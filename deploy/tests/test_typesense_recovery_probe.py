import importlib.util
import pathlib
import unittest
from urllib.error import HTTPError

spec = importlib.util.spec_from_file_location("recovery_probe", pathlib.Path(__file__).with_name("typesense-recovery-probe.py"))
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

class TypesenseReadinessTest(unittest.TestCase):
    def exercise(self, statuses, retryable=True):
        calls = []
        time = [0]
        def send():
            code = statuses[min(len(calls), len(statuses)-1)]
            calls.append(code)
            if code != 200:
                raise HTTPError("http://fixture.invalid", code, "", {}, None)
            return "ok"
        def sleep(seconds):
            time[0] += seconds
        return lambda: probe.request_with_readiness_retry(send, retryable=retryable, clock=lambda:time[0], sleep=sleep), calls, time

    def test_temporary_unavailability_then_success(self):
        run, calls, elapsed = self.exercise([503,503,200])
        self.assertEqual(run(), "ok")
        self.assertEqual(calls, [503,503,200])
        self.assertEqual(elapsed[0], 4)

    def test_permanent_unavailability_fails_at_deadline(self):
        run, calls, elapsed = self.exercise([503])
        with self.assertRaises(HTTPError) as error:
            run()
        self.assertEqual(error.exception.code, 503)
        self.assertEqual(elapsed[0], 60)
        self.assertEqual(len(calls), 31)

    def test_other_errors_and_non_idempotent_operations_fail_immediately(self):
        for status, retryable in [(401,True),(404,True),(500,True),(503,False)]:
            run, calls, elapsed = self.exercise([status,200], retryable)
            with self.assertRaises(HTTPError):
                run()
            self.assertEqual(calls, [status])
            self.assertEqual(elapsed[0], 0)
