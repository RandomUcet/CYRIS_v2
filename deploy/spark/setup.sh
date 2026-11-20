#!/usr/bin/env bash
# Single-file installer for the CYLAB DGX Spark. Copy it to the Spark and run it with Bash.
set -eu
command -v python3 >/dev/null || { echo 'Na Sparku chybí python3.' >&2; exit 1; }
exec python3 - "$@" <<'PYTHON'
import argparse
import fcntl
import http.client
import json
import math
import os
from pathlib import Path
import platform
import shlex
import socket
import subprocess
import sys
import time
from typing import NamedTuple
from urllib.error import HTTPError, URLError
from urllib.request import build_opener, HTTPRedirectHandler, ProxyHandler, Request


ADDRESS = "10.15.69.2"
# NVIDIA's vLLM recipe for Qwen3.8 27B on the 128 GB Spark:
# https://build.nvidia.com/spark/vllm/intermediate
IMAGE = "nvcr.io/nvidia/vllm:26.10.pre1-py3"
LABEL = "cz.czechcybertron.cyris.spark"
HUB = Path(os.environ.get("HF_HUB_CACHE") or
           Path(os.environ.get("HF_HOME") or Path.home() / ".cache/huggingface") / "hub").expanduser().resolve()


class Service(NamedTuple):
    role: str
    port: int
    model: str
    revision: str

    @property
    def name(self):
        return "cyris-spark-" + self.role


CHAT = Service("chat", 8000, "nvidia/Qwen3.8-27B-NVFP4", "482ca0f3832238542f8f5295dde86b5f22711d80")
EMBEDDING = Service("embedding", 8001, "Qwen/Qwen3-Embedding-8B", "1d8ad4ca9b3dd8059ad90a75d4983776a23d44af")
SERVICES = (CHAT, EMBEDDING)


class Problem(Exception):
    pass


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None


# Device-local checks must reach the published address directly, even with a host proxy.
client = build_opener(ProxyHandler({}), NoRedirect())


def request(service, path, payload=None, timeout=3):
    body = json.dumps(payload).encode() if payload is not None else None
    req = Request(f"http://{ADDRESS}:{service.port}/v1/{path}", data=body,
                  headers={"Content-Type": "application/json"})
    with client.open(req, timeout=timeout) as response:
        result = json.loads(response.read(2_000_000))
        if not isinstance(result, dict):
            raise ValueError("odpověď není objekt JSON")
        return result


def probe(service):
    try:
        models = request(service, "models").get("data")
        if not isinstance(models, list):
            return "conflict", "odpověď neobsahuje seznam modelů"
        if not models:
            return "starting", "server ještě neuvádí načtený model"
        if any(isinstance(row, dict) and row.get("id") == service.model for row in models):
            return "ready", service.model
        return "conflict", f"server nenabízí {service.model}"
    except HTTPError as exc:
        return ("starting" if exc.code == 503 else "conflict"), f"HTTP {exc.code}"
    except (URLError, OSError, http.client.HTTPException) as exc:
        return "offline", str(exc)
    except ValueError:
        return "conflict", "neplatná odpověď modelového API"


def smoke(service):
    if service == CHAT:
        payload = {"model": service.model, "messages": [{"role": "user", "content": "Reply with OK."}],
                   "max_tokens": 64, "chat_template_kwargs": {"enable_thinking": False}}
        result = request(service, "chat/completions", payload, 120)
        try:
            content = result["choices"][0]["message"]["content"]
        except (IndexError, KeyError, TypeError):
            content = None
        if not isinstance(content, str) or not content.strip():
            raise Problem("Chat nevrátil žádný text.")
        print("Chat vygeneroval text.", flush=True)
    else:
        result = request(service, "embeddings", {"model": service.model, "input": "CYRIS"}, 120)
        try:
            vector = result["data"][0]["embedding"]
        except (IndexError, KeyError, TypeError):
            vector = None
        if (not isinstance(vector, list) or len(vector) != 4096 or
                not all(type(v) in (float, int) and math.isfinite(v) for v in vector)):
            raise Problem("Embedding nevrátil očekávaných 4096 čísel.")
        print("Embedding vrátil vektor o 4096 hodnotách.", flush=True)


def output(*cmd):
    return subprocess.run(cmd, check=True, stdout=subprocess.PIPE, text=True, timeout=45).stdout.strip()


class Container(NamedTuple):
    name: str
    status: str
    bindings: dict
    args: list
    role: str
    restart: str
    network: str

    def claims(self, service):
        for key, bindings in self.bindings.items():
            if key.endswith("/tcp") and any(binding.get("HostPort") == str(service.port) and
                    binding.get("HostIp") in ("", "0.0.0.0", ADDRESS, "::") for binding in (bindings or [])):
                return True
        if self.network == "host":
            # With host networking Docker has no mapping. Require the model and an explicit port.
            return self.has_model(service) and (
                f"--port={service.port}" in self.args or
                ("--port", str(service.port)) in zip(self.args, self.args[1:]))
        return False

    def has_model(self, service):
        if not any(arg == service.model or arg in (f"--model={service.model}", f"--model-id={service.model}",
                                                   f"--served-model-name={service.model}") for arg in self.args):
            return False
        return (self.role == service.role or
                any(Path(arg).name in ("vllm", "text-embeddings-router", "text-embeddings-inference") or
                    arg in ("vllm.entrypoints.openai.api_server", "sglang.launch_server") for arg in self.args))


def containers():
    context = os.environ.get("DOCKER_CONTEXT")
    host = os.environ.get("DOCKER_HOST")
    if context or not host:
        host = output("docker", "context", "inspect", "--format", "{{.Endpoints.docker.Host}}",
                      *([context] if context else []))
    if not host.startswith("unix://"):
        raise Problem("Na Sparku vyberte místní Docker kontext s Unix socketem.")
    ids = output("docker", "container", "ls", "--all", "--quiet").split()
    if not ids:
        return []
    # Do not inspect container environments or print the arguments of other workloads.
    fields = [".Name", ".State.Status", ".HostConfig.PortBindings", ".Config.Entrypoint",
              ".Config.Cmd", f'(index .Config.Labels "{LABEL}")', ".HostConfig.RestartPolicy.Name",
              ".HostConfig.NetworkMode"]
    template = "\t".join("{{json " + key + "}}" for key in fields)
    records = []
    for line in output("docker", "inspect", "--type", "container", "--format", template, *ids).splitlines():
        name, status, bindings, entrypoint, cmd, role, restart, network = map(json.loads, line.split("\t"))
        args = (entrypoint or []) + (cmd or [])
        if (len(args) >= 3 and Path(args[0]).name in ("sh", "bash") and
                args[1].startswith("-") and "c" in args[1]):
            try:
                args = shlex.split(args[2])
            except ValueError:
                pass
        records.append(Container(name.lstrip("/"), status, bindings or {}, args, role or "", restart, network))
    return records


def candidates(service, records):
    return [item for item in records if item.claims(service) and item.has_model(service)]


def port_open(service):
    try:
        with socket.create_connection((ADDRESS, service.port), timeout=2):
            return True
    except OSError:
        return False


def plan(service, records, state, info):
    if state == "conflict":
        raise Problem(f"Port {service.port}: {info}. Zkontrolujte službu, která na portu odpovídá.")
    matches = candidates(service, records)
    active = [c for c in matches if c.status in ("running", "restarting")]
    if state == "ready":
        return "reuse", active[0] if len(active) == 1 else None
    choices = active or matches
    if len(choices) > 1:
        raise Problem(f"Port {service.port} je nastaven u více kontejnerů: " + ", ".join(c.name for c in choices))
    if active:
        return "wait", active[0]
    if state == "starting" or port_open(service):
        raise Problem(f"Port {service.port} je obsazen. Zkontrolujte příkaz ss -ltnp na Sparku.")
    conflicts = [c.name for c in records if c not in matches and (c.name == service.name or c.claims(service))]
    if conflicts:
        raise Problem(f"Název nebo port pro {service.role} je už přidělen: " + ", ".join(conflicts))
    if matches:
        if matches[0].status not in ("created", "exited"):
            raise Problem(f"Kontejner {matches[0].name} je ve stavu {matches[0].status}.")
        return "start", matches[0]
    return "create", None


def check_hardware():
    if platform.system() != "Linux" or platform.machine() not in ("aarch64", "arm64"):
        raise Problem("Nová instalace vyžaduje Linux arm64 na DGX Spark.")
    if "GB10" not in output("nvidia-smi", "--query-gpu=name", "--format=csv,noheader"):
        raise Problem("nvidia-smi nerozpoznalo GPU NVIDIA GB10.")
    memory = next(line for line in Path("/proc/meminfo").read_text().splitlines() if line.startswith("MemTotal:"))
    if int(memory.split()[1]) < 100 * 1024 * 1024:
        raise Problem("Tato konfigurace obou modelů je určena pro variantu DGX Spark se 128 GB sdílené paměti.")


def check_image_gpu(image):
    # Test the driver and Docker GPU runtime before downloading model weights.
    subprocess.run(["docker", "run", "--rm", "--gpus", "all", "--entrypoint", "python3", image, "-c",
                    "import torch; print(torch.cuda.get_device_name(), torch.ones(1, device='cuda').item())"],
                   check=True, timeout=150)


def ensure_image():
    pinned_installed = False
    for tag in (IMAGE, "vllm/vllm-openai:qwen38"):
        inspection = subprocess.run(["docker", "image", "inspect", "--format", "{{.Architecture}} {{.Id}}", tag],
                                    capture_output=True, text=True, timeout=30)
        parts = inspection.stdout.strip().split()
        if inspection.returncode == 0 and len(parts) == 2 and parts[0] == "arm64":
            image = parts[1]  # Use the installed image ID, including the original CYLAB runtime if present.
            pinned_installed = pinned_installed or tag == IMAGE
            try:
                check_image_gpu(image)
            except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
                print(f"Kontrola GPU v místním obrazu {tag} selhala.", file=sys.stderr)
                continue
            print(f"Používám místní obraz {tag}.", flush=True)
            return image
    if pinned_installed:
        raise Problem("Místní obrazy nerozpoznaly GPU. Zkontrolujte ovladač DGX OS a NVIDIA Container Toolkit.")
    print(f"Stahuji obraz pro linux/arm64: {IMAGE}", flush=True)
    subprocess.run(["docker", "pull", "--platform", "linux/arm64", IMAGE], check=True, timeout=4 * 3600)
    check_image_gpu(IMAGE)
    return IMAGE


def cached(service):
    snapshot = HUB / ("models--" + service.model.replace("/", "--")) / "snapshots" / service.revision
    try:
        weights = set(json.loads((snapshot / "model.safetensors.index.json").read_text())["weight_map"].values())
        required = weights | {"config.json", "tokenizer.json", "tokenizer_config.json"}
        if service == CHAT:
            required.update(("processor_config.json", "chat_template.jinja", "hf_quant_config.json"))
        else:
            required.update(("modules.json", "1_Pooling/config.json"))
        return bool(weights) and all((snapshot / f).is_file() and (snapshot / f).stat().st_size for f in required)
    except (OSError, ValueError, KeyError):
        return False


def create(service, image):
    HUB.mkdir(parents=True, exist_ok=True)
    if not cached(service):
        print(f"Stahuji soubory modelu {service.model} do {HUB}…", flush=True)
        download = ("import sys; from huggingface_hub import snapshot_download; "
                    "snapshot_download(sys.argv[1], revision=sys.argv[2], cache_dir='/hub')")
        subprocess.run(["docker", "run", "--rm", "--init", "--user", f"{os.getuid()}:{os.getgid()}",
                        "-e", "HF_HOME=/tmp/hf", "-v", f"{HUB}:/hub", "--entrypoint", "python3",
                        image, "-c", download, service.model, service.revision], check=True, timeout=4 * 3600)
    # Pin weights, persist only the model cache and serve from local files after the first download.
    model_cache = HUB / ("models--" + service.model.replace("/", "--"))
    args = ["docker", "run", "--detach", "--name", service.name, "--label", f"{LABEL}={service.role}",
            "--gpus", "all", "--shm-size", "4g", "--ulimit", "memlock=-1", "--ulimit", "stack=67108864",
            "--publish", f"{ADDRESS}:{service.port}:{service.port}/tcp", "-v", f"{model_cache}:/model:ro",
            "-e", "HF_HUB_OFFLINE=1", "--entrypoint", "vllm", image, "serve", f"/model/snapshots/{service.revision}",
            "--served-model-name", service.model, "--host", "0.0.0.0", "--port", str(service.port), "--max-num-seqs", "2"]
    if service == CHAT:
        args += ["--gpu-memory-utilization", "0.52", "--max-model-len", "16384", "--kv-cache-dtype", "fp8",
                 "--reasoning-parser", "qwen3"]
    else:
        args += ["--gpu-memory-utilization", "0.20", "--max-model-len", "4096", "--runner", "pooling",
                 "--convert", "embed", "--enforce-eager"]
    subprocess.run(args, check=True, timeout=180)


def wait_ready(service, name):
    deadline = time.monotonic() + 1800
    notice = 0
    first_restarts = None
    while time.monotonic() < deadline:
        state, info = probe(service)
        if state == "ready":
            return
        status = output("docker", "inspect", "--type", "container", "--format",
                        "{{.RestartCount}} {{.State.Status}} exit={{.State.ExitCode}} OOM={{.State.OOMKilled}}", name)
        restarts, docker_state = status.split(" ", 1)
        if first_restarts is None:
            first_restarts = int(restarts)
        if (state == "conflict" or not docker_state.startswith(("running ", "restarting ")) or
                int(restarts) - first_restarts >= 2):
            raise Problem(f"{name}: {docker_state}, API: {info}. Podrobnosti: bash ~/cyris-spark.sh logs {service.role}")
        if time.monotonic() >= notice:
            print(f"Čekám na {service.model} na portu {service.port} ({docker_state}).", flush=True)
            notice = time.monotonic() + 45
        time.sleep(5)
    raise Problem(f"{name}: model se do 30 minut nepřipravil. Spusťte bash ~/cyris-spark.sh logs {service.role}.")


def prepare():
    try:
        with socket.socket() as local:
            local.bind((ADDRESS, 0))
    except OSError as exc:
        raise Problem(f"Na tomto stroji není dostupná lokální IP {ADDRESS}. Na Sparku ověřte ip -br -4 addr.") from exc
    cache_dir = Path(os.environ.get("XDG_CACHE_HOME") or Path.home() / ".cache")
    cache_dir.mkdir(parents=True, exist_ok=True)
    with (cache_dir / "cyris-spark-setup.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise Problem("Jiná příprava právě běží pro tento účet.") from exc
        states = {s: probe(s) for s in SERVICES}
        try:
            records = containers()
        except (OSError, subprocess.SubprocessError, Problem) as exc:
            if any(state != "ready" for state, _ in states.values()):
                raise Problem(f"Pro přípravu chybějícího modelu je nutný přístup k místnímu Dockeru: {exc}") from exc
            records = []  # Both model servers can also be managed by another process.
        plans = [(s, *plan(s, records, *states[s])) for s in SERVICES]
        image = None
        # Bring back installed runtimes first, even if a missing model later needs an online download.
        for service, action, existing in sorted(plans, key=lambda item: item[1] == "create"):
            name = existing.name if existing else service.name
            if action == "create":
                if image is None:
                    check_hardware()
                    image = ensure_image()
                print(f"Připravuji {name}.", flush=True)
                create(service, image)
            elif action == "start":
                print(f"Spouštím původní kontejner {name}.", flush=True)
                output("docker", "start", name)
            elif action == "reuse":
                print(f"Model na portu {service.port} už odpovídá.", flush=True)
            if action != "reuse":
                wait_ready(service, name)
        # Both models now share the GB10. Check inference with both resident before recording success.
        for service, action, existing in plans:
            try:
                smoke(service)
            except (ValueError, OSError, http.client.HTTPException) as exc:
                raise Problem(f"Test {service.role} na portu {service.port} selhal: {exc}") from exc
            # Enable boot persistence only after the first successful inference; preserve other operators' policies.
            if action == "create" or (existing and existing.role == service.role and existing.restart != "unless-stopped"):
                output("docker", "update", "--restart", "unless-stopped", existing.name if existing else service.name)
        print("Obě služby jsou připravené. V CYRIS zapněte DGX Spark a spusťte test spojení.", flush=True)


def main():
    parser = argparse.ArgumentParser(prog="bash cyris-spark.sh", description="Příprava a kontrola modelů CYRIS na DGX Spark.")
    parser.add_argument("action", nargs="?", default="prepare", choices=["prepare", "status", "test", "logs"],
                        help="prepare = připravit, status = vypsat dostupnost, test = vyzkoušet inferenci, logs = poslední logy")
    parser.add_argument("role", nargs="?", choices=["chat", "embedding"], help="služba pro příkaz logs")
    args = parser.parse_args()
    if (args.action == "logs") != bool(args.role):
        parser.error("příkaz logs vyžaduje chat nebo embedding")
    if args.action == "prepare":
        prepare()
    elif args.action == "logs":
        service = next(s for s in SERVICES if s.role == args.role)
        matches = candidates(service, containers())
        active = [c for c in matches if c.status == "running"]
        choices = active or matches
        if len(choices) != 1:
            raise Problem("Na portu nemá jednoznačnou shodu žádný místní Docker kontejner. Zkontrolujte docker ps -a.")
        subprocess.run(["docker", "logs", "--tail", "60", choices[0].name], check=True, timeout=20)
    else:
        passed = True
        for service in SERVICES:
            state, info = probe(service)
            print(f"{ADDRESS}:{service.port}  {service.role}  {info}", flush=True)
            if state != "ready":
                passed = False
            elif args.action == "test":
                try:
                    smoke(service)
                except (Problem, ValueError, OSError, http.client.HTTPException) as exc:
                    print(f"{service.role}: {exc}", file=sys.stderr)
                    passed = False
        if not passed:
            sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
    except subprocess.CalledProcessError as exc:
        print(f"CYRIS: příkaz {exc.cmd[0]} {exc.cmd[1]} skončil s kódem {exc.returncode}.", file=sys.stderr)
        sys.exit(1)
    except (Problem, OSError, ValueError, http.client.HTTPException, subprocess.TimeoutExpired) as exc:
        print(f"CYRIS: {exc}", file=sys.stderr)
        sys.exit(1)
PYTHON
