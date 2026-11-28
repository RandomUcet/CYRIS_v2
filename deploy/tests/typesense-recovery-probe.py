"""Synthetic Typesense fixture for the existing disposable CI recovery test.

Never target a deployed endpoint or a caller-provided HTTP URL. Derive the
container address and ephemeral credential from the verified Compose service.
"""
import ipaddress
import json
import os
import re
import subprocess
import sys
import urllib.request
import urllib.error
import time


def request_with_readiness_retry(send, *, retryable, clock=time.monotonic, sleep=time.sleep):
    """Only retry explicit temporary unavailability on safe fixture operations."""
    deadline = clock() + 60
    while True:
        try:
            return send()
        except urllib.error.HTTPError as error:
            if not retryable or error.code != 503 or clock() >= deadline:
                raise
            error.close()
            sleep(min(2, max(0, deadline - clock())))


def main():
    if os.geteuid() != 0 or os.environ.get("GITHUB_ACTIONS") != "true":
        raise SystemExit("CI-only recovery probe")
    if len(sys.argv) != 4:
        raise SystemExit("Expected project, container ID and fixture action")
    project, container, action = sys.argv[1:]
    if not re.fullmatch(r"recovery-[0-9]+", project):
        raise SystemExit("Unexpected recovery project")
    if not re.fullmatch(r"[a-f0-9]{12,64}", container):
        raise SystemExit("Unexpected container ID")
    if action not in {"seed", "mutate", "assert-before", "assert-after"}:
        raise SystemExit("Unknown fixture action")
    info, = json.loads(subprocess.check_output(["docker", "inspect", container], text=True))
    labels = info["Config"]["Labels"]
    if labels.get("com.docker.compose.project") != project or labels.get("com.docker.compose.service") != "typesense":
        raise SystemExit("Container is not the isolated recovery Typesense service")
    networks = info["NetworkSettings"]["Networks"]
    if set(networks) != {project}:
        raise SystemExit("Unexpected network for recovery fixture")
    ip = ipaddress.IPv4Address(networks[project]["IPAddress"])
    if not ip.is_private or ip.is_loopback or ip.is_link_local:
        raise SystemExit("Expected private Compose address")
    values = [entry.partition("=")[2] for entry in info["Config"]["Env"] if entry.startswith("TYPESENSE_API_KEY=")]
    if len(values) != 1 or not values[0]:
        raise SystemExit("Missing isolated Typesense key")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    headers = {"X-TYPESENSE-API-KEY": values[0], "Content-Type": "application/json"}
    root = f"http://{ip}:8108"
    collection = "/collections/recovery_check"
    documents = collection + "/documents"

    def request(method, path, body=None):
        data = None if body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(root + path, data=data, headers=headers, method=method)
        def send():
            with opener.open(req, timeout=15) as result:
                return json.load(result)
        # A healthy container can still be loading its persisted search index.
        # Only GET and the deterministic fixed-ID upsert are safe to retry.
        retryable = method == "GET" or (method == "POST" and path == documents + "?action=upsert")
        return request_with_readiness_retry(send, retryable=retryable)

    if action == "seed":
        request("POST", "/collections", {"name": "recovery_check", "fields": [{"name": "value", "type": "string"}]})
        request("POST", documents, {"id": "probe", "value": "before"})
    elif action == "mutate":
        request("POST", documents + "?action=upsert", {"id": "probe", "value": "after"})
    else:
        expected = action.removeprefix("assert-")
        found = request("GET", documents + "/probe")
        if found.get("id") != "probe" or found.get("value") != expected:
            raise SystemExit("Typesense fixture recovery mismatch")
        search = request("GET", documents + "/search?q=" + expected + "&query_by=value")
        if search.get("found") != 1 or search["hits"][0]["document"].get("id") != "probe":
            raise SystemExit("Typesense restored index search mismatch")
        print("Typesense fixture and searchable index verified:", expected)


if __name__ == "__main__":
    main()
