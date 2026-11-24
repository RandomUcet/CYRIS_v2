import argparse
import hashlib
import importlib.machinery
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch, Mock

loader = importlib.machinery.SourceFileLoader("ctl", str(Path(__file__).resolve().parents[1] / "cyrisctl"))
spec = importlib.util.spec_from_loader(loader.name, loader)
ctl = importlib.util.module_from_spec(spec)
loader.exec_module(ctl)


class Operations(unittest.TestCase):
    def setUp(self):
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.root = Path(tmp.name)
        etc, opt, var, backups = [self.root / s for s in ("etc", "opt", "var", "backups")]
        for d in (etc, opt, var, backups):
            d.mkdir()
        attrs = dict(CYRIS_ETC=str(etc), CYRIS_OPT=str(opt), CYRIS_VAR=str(var), CYRIS_BACKUPS=str(backups),
                     CYRIS_ENV_FILE=str(etc / "cyris.env"), CYRIS_MANIFEST_FILE=str(opt / "release.json"),
                     CYRIS_COMPOSE_FILE=str(opt / "compose.yml"))
        self.enterContext(patch.multiple(ctl, **attrs))
        (self.root / "gnupg").mkdir(mode=0o700)
        self.enterContext(patch.dict(os.environ, {"GNUPGHOME": str(self.root / "gnupg")}))
        for name, path in ctl.snapshot_layout().items():
            if name in {"postgres", "minio", "redis", "typesense", "ldap-ca", "caddy"}:
                path.mkdir()
                (path / "item").write_text(name)
            else:
                path.write_text(name)
        Path(ctl.CYRIS_MANIFEST_FILE).write_text('{"version":"abc123"}')
        self.docker = self.enterContext(patch.object(ctl, "docker_compose_cmd"))
        self.docker.return_value.stdout = "api\npostgres\n"
        self.args = argparse.Namespace(backup=None, force=True, version=None)

    def test_encrypted_restore_and_corrupt_input(self):
        checkpoint = Path(ctl.CYRIS_VAR, "typesense", "checkpoint")
        os.link(checkpoint.with_name("item"), checkpoint)
        archive = ctl.cmd_backup(self.args)
        self.assertEqual(archive.stat().st_mode & 0o777, 0o600)
        self.args.backup = str(archive)
        ctl.cmd_backup_verify(self.args)
        originals = {path: path.read_bytes() for root in ctl.snapshot_layout().values()
                     for path in ([root] if root.is_file() else root.glob("*"))}
        for path in originals:
            path.write_text("changed")
        ctl.cmd_restore(self.args)
        for path, data in originals.items():
            self.assertEqual(path.read_bytes(), data)
        archive.write_bytes(archive.read_bytes()[:-40])
        self.docker.reset_mock()
        with self.assertRaises(subprocess.CalledProcessError):
            ctl.cmd_restore(self.args)
        self.docker.assert_not_called()

    def test_failed_restart_restores_previous_state(self):
        self.args.backup = str(ctl.cmd_backup(self.args))
        live = Path(ctl.CYRIS_VAR, "postgres", "item")
        live.write_text("latest")
        def compose(*args, **kw):
            if "--force-recreate" in args:
                raise ValueError("unhealthy")
            return Mock(stdout="api postgres")
        self.docker.side_effect = compose
        with self.assertRaisesRegex(ValueError, "unhealthy"):
            ctl.cmd_restore(self.args)
        self.assertEqual(live.read_text(), "latest")

    def test_disallowed_path_and_incomplete_snapshot(self):
        for name in ("env/../config", "/etc/shadow", "postgres/link", "env"):
            item = tarfile.TarInfo(name)
            if name.endswith("link"):
                item.type = tarfile.SYMTYPE
            with self.assertRaises(ValueError):
                ctl.snapshot_inventory([item])

    def test_failed_pull_preserves_release_and_data(self):
        manifest = {"version":"2.0.1","images":{s: f"ghcr.io/randomucet/cyris-{s}@sha256:" + "a"*64
                                                 for s in ctl.APP_SERVICES}}
        with patch.object(ctl, "github_release", return_value={"tag_name":"v2.0.1"}), \
             patch.object(ctl, "release_asset", return_value=json.dumps(manifest).encode()), \
             patch.object(ctl, "run_command", side_effect=[Mock(), OSError("registry offline")]):
            with self.assertRaisesRegex(OSError, "registry offline"):
                ctl.cmd_update(self.args)
        self.docker.assert_not_called()
        self.assertEqual(ctl.get_installed_version(), "abc123")
        self.assertEqual(Path(ctl.CYRIS_ENV_FILE).read_text(), "env")

    def test_update_commits_manifest_only_after_readiness(self):
        images = {s: f"ghcr.io/randomucet/cyris-{s}@sha256:" + "a"*64 for s in ctl.APP_SERVICES}
        manifest = json.dumps({"version":"2.0.1","images":images}).encode()
        Path(ctl.CYRIS_ENV_FILE).write_text("CUSTOM_TLS=keep\nCYRIS_VERSION=abc123\n")
        def compose(*args, **kw):
            if "curl" in args:
                self.assertEqual(ctl.get_installed_version(), "abc123")
                self.assertIn("CUSTOM_TLS=keep", Path(ctl.CYRIS_ENV_FILE).read_text())
            return Mock(stdout="api worker web postgres")
        self.docker.side_effect = compose
        self.enterContext(patch.object(ctl, "github_release", return_value={"tag_name":"v2.0.1"}))
        self.enterContext(patch.object(ctl, "release_asset", return_value=manifest))
        check = Mock(returncode=0, stdout='{"status":"UP_TO_DATE","pendingCount":0,"totalAvailable":4}')
        self.enterContext(patch.object(ctl, "run_command", return_value=check))
        ctl.cmd_update(self.args)
        self.assertEqual(ctl.get_installed_version(), "2.0.1")
        self.assertEqual(ctl.load_env(ctl.CYRIS_ENV_FILE)["CYRIS_API_IMAGE"], images["api"])
        self.assertEqual(len(list(Path(ctl.CYRIS_BACKUPS).glob("*.gpg"))), 1)

    def test_release_asset_digest_required(self):
        good = hashlib.sha256(b"data").hexdigest()
        for digest in (None, "sha256:bad", "sha256:"+good):
            rel = {"assets":[{"id":1,"name":"asset","digest":digest}]}
            with patch.object(ctl, "github_get", return_value=b"data"):
                if digest == "sha256:"+good:
                    self.assertEqual(ctl.release_asset(rel, "asset"), b"data")
                else:
                    with self.assertRaises(ValueError):
                        ctl.release_asset(rel, "asset")


    def test_ghcr_verify_inspects_all_three_images_by_digest(self):
        images = {s: f"ghcr.io/randomucet/cyris-{s}@sha256:" + "a"*64 for s in ctl.APP_SERVICES}
        release = {"tag_name": "v2.0.3"}
        manifest = json.dumps({"version": "2.0.3", "images": images}).encode()
        with patch.object(ctl, "release_asset", return_value=manifest) as asset, \
             patch.object(ctl, "run_command", return_value=Mock(returncode=0)) as runner:
            self.assertEqual(ctl.verify_release_registry_access(release), "2.0.3")
        asset.assert_called_once_with(release, "release-manifest.json", token=None)
        self.assertEqual([call.args[0] for call in runner.call_args_list],
                         [["docker", "manifest", "inspect", images[s]] for s in ctl.APP_SERVICES])
        self.docker.assert_not_called()

    def test_ghcr_verify_specific_release_uses_requested_version(self):
        requested = argparse.Namespace(version="v2.4.12")
        release = {"tag_name": "v2.4.12"}
        with patch.object(ctl, "github_release", return_value=release) as fetch, \
             patch.object(ctl, "verify_release_registry_access", return_value="2.4.12") as probe:
            ctl.cmd_github_verify(requested)
        fetch.assert_called_once_with("v2.4.12")
        probe.assert_called_once_with(release)
        self.docker.assert_not_called()

    def test_ghcr_verify_default_still_checks_latest_release(self):
        with patch.object(ctl, "github_release", return_value={"tag_name":"v2.4.11"}) as fetch, \
             patch.object(ctl, "verify_release_registry_access", return_value="2.4.11"):
            ctl.cmd_github_verify(argparse.Namespace())
        fetch.assert_called_once_with(None)
        self.docker.assert_not_called()

    def test_ghcr_denial_does_not_mutate_running_app(self):
        images = {s: f"ghcr.io/randomucet/cyris-{s}@sha256:" + "a"*64 for s in ctl.APP_SERVICES}
        release = {"tag_name": "v2.0.3"}
        manifest = json.dumps({"version": "2.0.3", "images": images}).encode()
        with patch.object(ctl, "release_asset", return_value=manifest), \
             patch.object(ctl, "run_command", return_value=Mock(returncode=1, stderr="403 Forbidden")):
            with self.assertRaisesRegex(ValueError, "GHCR access check failed"):
                ctl.verify_release_registry_access(release)
        self.docker.assert_not_called()
        self.assertFalse(Path(ctl.CYRIS_ETC, "github.token").exists())

    def test_github_login_rejects_token_if_package_access_denied(self):
        token = Path(ctl.CYRIS_ETC, "github.token")
        token.write_text("previous-token")
        with patch("builtins.input", return_value="service-robot"), \
             patch.object(ctl.getpass, "getpass", return_value="candidate-token"), \
             patch.object(ctl, "github_get", return_value=b"{}"), \
             patch.object(ctl, "github_release", return_value={"tag_name": "v2.0.3"}), \
             patch.object(ctl.subprocess, "run", return_value=Mock(returncode=0)), \
             patch.object(ctl, "verify_release_registry_access", side_effect=ValueError("403 Forbidden")):
            with self.assertRaisesRegex(ValueError, "403 Forbidden"):
                ctl.cmd_github_login(self.args)
        self.assertEqual(token.read_text(), "previous-token")
        self.docker.assert_not_called()

    def test_backup_restores_exact_running_services_without_start_wait(self):
        """v2.1.0 regression: an unsupported start flag aborted backup after pause."""
        services = ["postgres", "redis", "typesense", "minio", "gateway"]
        self.docker.reset_mock()
        def compose(*args, **kwargs):
            if args and args[0] == "start" and "--wait" in args:
                raise subprocess.CalledProcessError(1, args, stderr="unknown flag: --wait")
            return Mock(returncode=0, stdout="\n".join(services))
        self.docker.side_effect = compose
        with patch.object(ctl, "running_services", return_value=services):
            archive = ctl.cmd_backup(self.args)
        self.assertTrue(archive.is_file())
        calls = [call.args for call in self.docker.call_args_list]
        self.assertIn(("stop", *services), calls)
        self.assertIn(("up", "-d", "--no-deps", "--no-recreate",
                       "--wait", "--wait-timeout", "240", *services), calls)
        for args in calls:
            self.assertFalse(args and args[0] == "start" and "--wait" in args)
        ctl.cmd_backup_verify(argparse.Namespace(backup=str(archive)))

    def test_backup_restarts_services_even_if_snapshot_write_fails(self):
        """An archive-write error must still trigger the service restart path."""
        services = ["postgres", "redis"]
        self.docker.reset_mock()
        self.docker.return_value.stdout = "\n".join(services)
        with patch.object(ctl, "running_services", return_value=services), \
             patch.object(ctl, "add_snapshot_path", side_effect=OSError("disk unavailable")):
            with self.assertRaisesRegex(OSError, "disk unavailable"):
                ctl.cmd_backup(self.args)
        calls = [call.args for call in self.docker.call_args_list]
        self.assertEqual(calls[-1], ("up", "-d", "--no-deps", "--no-recreate",
                                     "--wait", "--wait-timeout", "240", *services))

class WatchdogPolicy(unittest.TestCase):
    def setUp(self):
        self.states = {s: ("running", "healthy") for s in (*ctl.WATCHDOG_DEPENDENCIES, *ctl.APP_SERVICES)}
        self.states["worker"] = ("running", "unhealthy")

    def test_requires_two_samples_and_healthy_dependencies(self):
        name, previous, _ = ctl.watchdog_decision(self.states, {}, 10000)
        self.assertIsNone(name)
        self.assertEqual(ctl.watchdog_decision(self.states, previous, 10060)[0], "worker")
        self.states["postgres"] = ("running", "unhealthy")
        self.assertIsNone(ctl.watchdog_decision(self.states, previous, 10060)[0])

    def test_never_restarts_stopped_stack_or_during_cooldown(self):
        previous = {"worker": {"count": 2, "seen": 10000, "attempts": [9900]}}
        self.assertIsNone(ctl.watchdog_decision(self.states, previous, 10060)[0])
        self.states["api"] = ("exited", "")
        self.assertIsNone(ctl.watchdog_decision(self.states, {}, 10060)[0])

    def test_budget_survives_healthy_sample(self):
        self.states["worker"] = ("running", "healthy")
        previous = {"worker": {"count": 0, "seen": 10000, "attempts": [7000, 5000, 3000]}}
        _, sample, _ = ctl.watchdog_decision(self.states, previous, 10060)
        self.assertEqual(len(sample["worker"]["attempts"]), 3)
        self.states["worker"] = ("running", "unhealthy")
        _, sample, _ = ctl.watchdog_decision(self.states, sample, 10120)
        self.assertIsNone(ctl.watchdog_decision(self.states, sample, 10180)[0])

    def test_compose_parser_rejects_duplicate_services(self):
        row = {"Service":"api","State":"running","Health":"healthy"}
        self.assertEqual(ctl.watchdog_states(json.dumps([row]))["api"], ("running","healthy"))
        with self.assertRaises(ValueError):
            ctl.watchdog_states(json.dumps(row)+"\\n"+json.dumps(row))
