"""Mirror preparation proof with synthetic receipts; no deployed acceptance."""

import importlib.util
import json
import subprocess
import sys
import tarfile
import unittest
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory

SCRIPT = Path(__file__).with_name("prepare-php-mirror.py")
sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("php_mirror", SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
SCRATCH = Path.home() / ".polymorfa-agent-work/native-php-mirror-tests"
SCRATCH.mkdir(parents=True, exist_ok=True)


class MirrorPreparation(unittest.TestCase):
    def fixture(self, root, nightly=False, extra=None, tamper=False):
        version = "0.2.3-dev.20261011120000" if nightly else "0.2.3"
        receipt = {
            "schemaVersion": 1,
            "repository": "polymorfa/sdks",
            "sourceSha": "a" * 40,
            "fingerprint": "b" * 64,
            "channel": "nightly" if nightly else "stable",
            "versions": {"semver": version},
        }
        inner = dict(receipt, sourceSha="c" * 40) if tamper else receipt
        contents = {
            "composer.json": json.dumps(
                {
                    "name": "polymorfa/sdk",
                    "autoload": {"psr-4": {"Polymorfa\\": "src/"}},
                }
            ).encode(),
            "src/HttpTransport.php": f"<?php const SDK_VERSION = '{version}';\n".encode(),
            # The real archive carries the schema-2 resource the storage engine loads.
            "src/Storage/schema2.json": b'{"schemaVersion":2}\n',
            "README.md": b"SDK development source\n",
            "LICENSE": b"MIT\n",
            "release-contract.json": json.dumps(inner).encode(),
        }
        packs = root / "packs"
        packs.mkdir()
        receipt_path = root / "receipt.json"
        receipt_path.write_text(json.dumps(receipt))
        with tarfile.open(packs / "polymorfa-sdk.tar", "w") as archive:
            for name, content in contents.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(content)
                archive.addfile(entry, BytesIO(content))
            if extra:
                archive.addfile(extra, BytesIO(b"x") if extra.isfile() else None)
        return packs, receipt_path, contents

    def test_stable_preserves_exact_accepted_files_at_root(self):
        with TemporaryDirectory(dir=SCRATCH) as scratch:
            root = Path(scratch)
            packs, receipt, contents = self.fixture(root)
            output = root / "mirror"
            plan = module.prepare(packs, receipt, output)
            self.assertEqual(plan["proposedTag"], "v0.2.3")
            self.assertEqual(plan["publication"], "not performed")
            self.assertEqual(sorted(plan["files"]), sorted(contents))
            for name, data in contents.items():
                self.assertEqual((output / "source" / name).read_bytes(), data)
            self.assertFalse((output / "source/.git").exists())

    def test_nightly_records_composer_branch_without_creating_tag(self):
        with TemporaryDirectory(dir=SCRATCH) as scratch:
            root = Path(scratch)
            packs, receipt, _ = self.fixture(root, nightly=True)
            plan = module.prepare(packs, receipt, root / "mirror")
            self.assertEqual(plan["composerBranchVersion"], "dev-main")
            self.assertNotIn("proposedTag", plan)

    def test_existing_output_is_preserved(self):
        with TemporaryDirectory(dir=SCRATCH) as scratch:
            root = Path(scratch)
            packs, receipt, _ = self.fixture(root)
            output = root / "mirror"
            output.mkdir()
            (output / "operator-file").write_text("preserve")
            with self.assertRaises(AssertionError):
                module.prepare(packs, receipt, output)
            self.assertEqual((output / "operator-file").read_text(), "preserve")

    def test_mismatched_receipt_never_creates_output(self):
        with TemporaryDirectory(dir=SCRATCH) as scratch:
            root = Path(scratch)
            packs, receipt, _ = self.fixture(root, tamper=True)
            with self.assertRaises(subprocess.CalledProcessError):
                module.prepare(packs, receipt, root / "mirror")
            self.assertFalse((root / "mirror").exists())

    def test_unsafe_or_unexpected_archive_entries_never_create_output(self):
        for name, kind in [
            ("../escape", None),
            ("vendor/unexpected.php", None),
            ("src/Storage/other.json", None),
            ("src/link.php", tarfile.SYMTYPE),
            ("src/HttpTransport.php", None),
        ]:
            with (
                self.subTest(name=name, kind=kind),
                TemporaryDirectory(dir=SCRATCH) as scratch,
            ):
                root = Path(scratch)
                entry = tarfile.TarInfo(name)
                if kind:
                    entry.type = kind
                    entry.linkname = "../escape"
                else:
                    entry.size = 1
                packs, receipt, _ = self.fixture(root, extra=entry)
                with self.assertRaises((AssertionError, subprocess.CalledProcessError)):
                    module.prepare(packs, receipt, root / "mirror")
                self.assertFalse((root / "mirror").exists())


unittest.main()
