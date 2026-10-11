"""Check accepted distribution receipts without extracting executable content."""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
import sys
import tarfile
import zipfile

language, output, receipt = sys.argv[1:]
expected = json.loads(Path(receipt).read_text())
loose_receipt = Path(output) / "release-contract.json"
if loose_receipt.exists():
    assert json.loads(loose_receipt.read_text()) == expected
files = sorted(path for path in Path(output).iterdir() if path.name != "release-contract.json")
assert files, "No accepted artifacts"
expected_count = 2 if language == "python" else 1
assert len(files) == expected_count, "Unexpected artifact count"
for path in files:
    if path.suffix in (".whl", ".nupkg"):
        with zipfile.ZipFile(path) as archive:
            names = [name for name in archive.namelist() if name.endswith("release-contract.json")]
            assert len(names) == 1, f"Missing or ambiguous receipt in {path.name}"
            actual = json.loads(archive.read(names[0]))
            if language == "python":
                metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
                assert len(metadata) == 1
                assert re.search(r"^Version: (.+)$", archive.read(metadata[0]).decode(), re.M).group(1) == expected["versions"]["python"]
            else:
                metadata = [name for name in archive.namelist() if name.endswith(".nuspec")]
                assert len(metadata) == 1
                version = next(node.text for node in ET.fromstring(archive.read(metadata[0])).iter() if node.tag.rsplit("}", 1)[-1] == "version")
                assert version == expected["versions"]["semver"]
    else:
        with tarfile.open(path) as archive:
            members = [member for member in archive.getmembers() if member.name.endswith("release-contract.json")]
            # A Python sdist also contains the package-local copy. Every copy
            # must agree; none can silently carry another accepted revision.
            assert members, f"Missing receipt in {path.name}"
            actual = expected
            def text_member(suffix):
                found = [entry for entry in archive.getmembers() if entry.name.endswith(suffix) and entry.isfile()]
                assert len(found) == 1, f"Missing or ambiguous version metadata: {suffix}"
                return archive.extractfile(found[0]).read().decode()
            if language == "python":
                # PKG-INFO can also appear inside the source package. The root
                # sdist metadata is authoritative for its distribution version.
                infos = [entry for entry in archive.getmembers() if entry.name.endswith("/PKG-INFO") and entry.name.count("/") == 1]
                assert len(infos) == 1
                version = re.search(r"^Version: (.+)$", archive.extractfile(infos[0]).read().decode(), re.M).group(1)
                assert version == expected["versions"]["python"]
            elif language == "rust":
                package = text_member("/Cargo.toml").split("[package]", 1)[1].split("\n[", 1)[0]
                assert re.search(r'^version = "([^"]+)"', package, re.M).group(1) == expected["versions"]["semver"]
            elif language == "go":
                assert re.search(r'const Version = "([^"]+)"', text_member("/transport.go")).group(1) == expected["versions"]["semver"]
            elif language == "php":
                assert re.search(r"SDK_VERSION = '([^']+)'", text_member("src/HttpTransport.php")).group(1) == expected["versions"]["semver"]
            for member in members:
                stream = archive.extractfile(member)
                assert stream is not None
                assert json.load(stream) == expected, f"Receipt mismatch in {path.name}"
    assert actual == expected, f"Receipt mismatch in {path.name}"
print(f"Verified embedded acceptance receipts in {len(files)} {language} artifacts.")
