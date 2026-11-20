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
