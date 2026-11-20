"""Installer regression tests. All requests target loopback, Docker and the GPU are fixtures."""
from contextlib import ExitStack, redirect_stdout
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import StringIO
import json
import os
from pathlib import Path
import subprocess
import tempfile
from threading import Thread
from types import ModuleType
import unittest
from unittest.mock import call, patch


script = Path(__file__).with_name("setup.sh")
source = script.read_text().split("<<'PYTHON'\n", 1)[1].rsplit("\nPYTHON", 1)[0]
spark = ModuleType("spark_setup")
exec(compile(source, str(script), "exec"), spark.__dict__)


def container(service, name="vllm-qwen38", state="exited", model=None):
    mapping = {"8000/tcp": [{"HostIp": "0.0.0.0", "HostPort": str(service.port)}]}
    return spark.Container(name, state, mapping, ["vllm", "serve", model or service.model], "", "no", "bridge")


class InstallerTests(unittest.TestCase):
    def test_restore_only_matching_model_and_port(self):
        chat = spark.CHAT
        original = container(chat)
        wrong = container(chat, name="different-service", model="other/model")
        with patch.object(spark, "port_open", return_value=False):
            self.assertEqual(spark.plan(chat, [original], "offline", ""), ("start", original))
            self.assertEqual(spark.plan(chat, [], "offline", ""), ("create", None))
            with self.assertRaises(spark.Problem):
                spark.plan(chat, [wrong], "offline", "")
            with self.assertRaises(spark.Problem):
                spark.plan(chat, [original, original._replace(name="copy")], "offline", "")
            with self.assertRaises(spark.Problem):
                spark.plan(chat, [], "conflict", "HTTP 401")
        with patch.object(spark, "port_open", return_value=True), self.assertRaises(spark.Problem):
            spark.plan(chat, [original], "offline", "")

    def test_prepare_resumes_without_replacing_and_second_run_preserves_restart_policy(self):
        chat, embed = spark.SERVICES
        original = container(chat)
        managed = container(embed, embed.name, "running")._replace(role=embed.role, restart="unless-stopped")
        with ExitStack() as stack:
            stack.enter_context(redirect_stdout(StringIO()))
            tmp = stack.enter_context(tempfile.TemporaryDirectory())
            stack.enter_context(patch.dict(os.environ, {"DOCKER_HOST": "unix:///test", "XDG_CACHE_HOME": tmp}))
            stack.enter_context(patch.object(spark, "ADDRESS", "127.0.0.1"))
            stack.enter_context(patch.object(spark, "port_open", return_value=False))
            starts = stack.enter_context(patch.object(spark, "output"))
            stack.enter_context(patch.object(spark, "probe", side_effect=[
                ("offline", ""), ("offline", ""), ("ready", chat.model), ("ready", embed.model)]))
            stack.enter_context(patch.object(spark, "containers", side_effect=[
                [original], [original._replace(status="running"), managed]]))
            stack.enter_context(patch.object(spark, "check_hardware"))
            image = stack.enter_context(patch.object(spark, "ensure_image", return_value="sha256:fixture"))
            create = stack.enter_context(patch.object(spark, "create"))
            wait = stack.enter_context(patch.object(spark, "wait_ready"))
            smoke = stack.enter_context(patch.object(spark, "smoke"))
            spark.prepare()
            spark.prepare()
        image.assert_called_once()
        create.assert_called_once_with(embed, "sha256:fixture")
        self.assertEqual(starts.call_args_list, [call("docker", "start", original.name),
            call("docker", "update", "--restart", "unless-stopped", embed.name)])
        self.assertEqual(wait.call_args_list, [call(chat, original.name), call(embed, embed.name)])
        self.assertEqual(smoke.call_args_list, [call(chat), call(embed), call(chat), call(embed)])

    def test_busy_embedding_port_is_detected_before_modifying_chat(self):
        with ExitStack() as stack:
            tmp = stack.enter_context(tempfile.TemporaryDirectory())
            stack.enter_context(patch.dict(os.environ, {"XDG_CACHE_HOME": tmp}))
            stack.enter_context(patch.object(spark, "ADDRESS", "127.0.0.1"))
            stack.enter_context(patch.object(spark, "containers", return_value=[]))
            stack.enter_context(patch.object(spark, "probe", side_effect=[("offline", ""), ("conflict", "HTTP 401")]))
            stack.enter_context(patch.object(spark, "port_open", return_value=False))
            docker = stack.enter_context(patch.object(spark, "create"))
            hardware = stack.enter_context(patch.object(spark, "check_hardware"))
            with self.assertRaisesRegex(spark.Problem, "401"):
                spark.prepare()
            docker.assert_not_called()
            hardware.assert_not_called()

    def test_cylab_image_is_reused_by_immutable_local_id(self):
        def run(args, **kwargs):
            if "inspect" in args:
                if args[-1] == "vllm/vllm-openai:qwen38":
                    return subprocess.CompletedProcess(args, 0, "arm64 sha256:fixture")
                return subprocess.CompletedProcess(args, 1, "")
            self.assertIn("sha256:fixture", args)
            self.assertIn("--gpus", args)
            return subprocess.CompletedProcess(args, 0)
        with patch.object(spark.subprocess, "run", side_effect=run) as docker, redirect_stdout(StringIO()):
            self.assertEqual(spark.ensure_image(), "sha256:fixture")
            self.assertEqual(docker.call_count, 3)

    def test_cached_weights_are_served_offline_and_published_only_to_cylab_address(self):
        with tempfile.TemporaryDirectory() as tmp, patch.object(spark, "HUB", Path(tmp)), \
                patch.object(spark.subprocess, "run") as docker:
            service = spark.EMBEDDING
            repo = Path(tmp) / "models--Qwen--Qwen3-Embedding-8B"
            snapshot = repo / "snapshots" / service.revision
            snapshot.mkdir(parents=True)
            index = {"weight_map": {"module.weight": "weights.safetensors"}}
            (snapshot / "model.safetensors.index.json").write_text(json.dumps(index))
            for name in ("config.json", "tokenizer.json", "tokenizer_config.json", "modules.json", "1_Pooling/config.json"):
                file = snapshot / name
                file.parent.mkdir(exist_ok=True)
                file.write_text("{}")
            self.assertFalse(spark.cached(service))
            (snapshot / "weights.safetensors").write_bytes(b"weights")
            self.assertTrue(spark.cached(service))
            spark.create(service, "sha256:fixture")
            docker.assert_called_once()
            args = docker.call_args.args[0]
            self.assertIn("10.15.69.2:8001:8001/tcp", args)
            self.assertIn(f"{repo}:/model:ro", args)
            self.assertIn(f"/model/snapshots/{service.revision}", args)
            self.assertIn("HF_HUB_OFFLINE=1", args)
            self.assertIn(service.model, args)

    def test_actual_http_classifies_model_and_checks_generation_and_embedding_shape(self):
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def respond(self, data):
                self.send_response(200)
                self.end_headers()
                self.wfile.write(json.dumps(data).encode())

            def do_GET(self):
                self.respond({"data": [{"id": s.model} for s in spark.SERVICES]})

            def do_POST(self):
                body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                if self.path == "/v1/embeddings" and body["model"] == spark.EMBEDDING.model:
                    self.respond({"data": [{"embedding": [0.5] * self.server.dimension}]})
                elif self.path == "/v1/chat/completions" and body["model"] == spark.CHAT.model:
                    self.respond({"choices": [{"message": {"content": "OK"}}]})
                else:
                    self.send_error(404)

        with ThreadingHTTPServer(("127.0.0.1", 0), Handler) as server, ExitStack() as stack:
            chat, embed = [s._replace(port=server.server_port) for s in spark.SERVICES]
            stack.enter_context(patch.multiple(spark, ADDRESS="127.0.0.1", CHAT=chat, EMBEDDING=embed))
            stack.enter_context(redirect_stdout(StringIO()))
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            stack.callback(thread.join)
            stack.callback(server.shutdown)
            server.dimension = 4096
            self.assertEqual(spark.probe(chat), ("ready", chat.model))
            self.assertEqual(spark.probe(embed._replace(model="different"))[0], "conflict")
            spark.smoke(chat)
            spark.smoke(embed)
            server.dimension = 3
            with self.assertRaises(spark.Problem):
                spark.smoke(embed)


if __name__ == "__main__":
    unittest.main()
