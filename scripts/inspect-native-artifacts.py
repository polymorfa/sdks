"""Check accepted distribution receipts without extracting executable content.

Every artifact in scripts/native-packages.json must be present exactly once,
carry the accepted version and receipt, and depend on sibling Polymorfa
packages only through that exact accepted version, never a path or local feed.
"""
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
import sys
import tarfile
import zipfile

language, output, receipt = sys.argv[1:]
expected = json.loads(Path(receipt).read_text())
graph = json.loads(Path(__file__).with_name("native-packages.json").read_text())[language]
names = [entry["name"] for entry in graph]
version = expected["versions"]["semver"]
pep440 = expected["versions"]["python"] if language == "python" else None
loose_receipt = Path(output) / "release-contract.json"
if loose_receipt.exists():
    assert json.loads(loose_receipt.read_text()) == expected
files = sorted(path for path in Path(output).iterdir() if path.name != "release-contract.json")
assert files, "No accepted artifacts"
if language == "python":
    expected_files = {f"polymorfa_sdk-{pep440}-py3-none-any.whl", f"polymorfa_sdk-{pep440}.tar.gz"}
elif language == "rust":
    expected_files = {f"{name}-{version}.crate" for name in names}
elif language == "dotnet":
    expected_files = {f"{name}.{version}.nupkg" for name in names}
elif language == "go":
    expected_files = {f"polymorfa-go-{version}.tar"}
else:
    expected_files = None
if expected_files is None:
    assert len(files) == 1, "Unexpected artifact count"
else:
    assert {path.name for path in files} == expected_files, f"Unexpected artifacts: {sorted(path.name for path in files)}"


def sibling_versions(dependencies):
    for name, requirement in dependencies:
        if name in names:
            yield name, requirement


for path in files:
    if path.suffix in (".whl", ".nupkg"):
        with zipfile.ZipFile(path) as archive:
            receipts = [name for name in archive.namelist() if name.endswith("release-contract.json")]
            assert len(receipts) == 1, f"Missing or ambiguous receipt in {path.name}"
            actual = json.loads(archive.read(receipts[0]))
            if language == "python":
                metadata = [name for name in archive.namelist() if name.endswith(".dist-info/METADATA")]
                assert len(metadata) == 1
                assert re.search(r"^Version: (.+)$", archive.read(metadata[0]).decode(), re.M).group(1) == pep440
            else:
                metadata = [name for name in archive.namelist() if name.endswith(".nuspec")]
                assert len(metadata) == 1
                nuspec = ET.fromstring(archive.read(metadata[0]))
                local = lambda node: node.tag.rsplit("}", 1)[-1]
                assert next(node.text for node in nuspec.iter() if local(node) == "version") == version
                package_id = next(node.text for node in nuspec.iter() if local(node) == "id")
                declared = {node.get("id"): node.get("version") for node in nuspec.iter() if local(node) == "dependency"}
                wanted = next(entry for entry in graph if entry["name"] == package_id)["dependsOn"]
                siblings = dict(sibling_versions(declared.items()))
                assert set(siblings) == set(wanted), f"{package_id} sibling dependencies differ: {siblings}"
                for name, requirement in siblings.items():
                    assert requirement in (version, f"[{version}]", f"[{version}, )"), f"{package_id} -> {name} is not the accepted version: {requirement}"
    else:
        with tarfile.open(path) as archive:
            members = [member for member in archive.getmembers() if member.name.endswith("release-contract.json")]
            # A Python sdist also contains the package-local copy. Every copy
            # must agree; none can silently carry another accepted revision.
            assert members, f"Missing receipt in {path.name}"
            actual = expected

            def text_member(suffix, top=False):
                found = [entry for entry in archive.getmembers() if entry.name.endswith(suffix) and entry.isfile() and (not top or entry.name.count("/") == 1)]
                assert len(found) == 1, f"Missing or ambiguous version metadata: {suffix}"
                return archive.extractfile(found[0]).read().decode()

            if language == "python":
                # PKG-INFO can also appear inside the source package. The root
                # sdist metadata is authoritative for its distribution version.
                infos = [entry for entry in archive.getmembers() if entry.name.endswith("/PKG-INFO") and entry.name.count("/") == 1]
                assert len(infos) == 1
                assert re.search(r"^Version: (.+)$", archive.extractfile(infos[0]).read().decode(), re.M).group(1) == pep440
            elif language == "rust":
                manifest = text_member("/Cargo.toml", top=True)
                package = manifest.split("[package]", 1)[1].split("\n[", 1)[0]
                crate = re.search(r'^name = "([^"]+)"', package, re.M).group(1)
                assert re.search(r'^version = "([^"]+)"', package, re.M).group(1) == version
                assert path.name == f"{crate}-{version}.crate"
                wanted = next(entry for entry in graph if entry["name"] == crate)["dependsOn"]
                for name in names:
                    sections = re.findall(r'^\[(?:[^\]]*\.)?dependencies\.' + re.escape(name) + r'\]\n((?:[^\[].*\n?)*)', manifest, re.M)
                    assert len(sections) == (1 if name in wanted else 0), f"{crate} dependency on {name} differs"
                    for body in sections:
                        assert re.search(r'^version = "=' + re.escape(version) + '"$', body, re.M), f"{crate} -> {name} is not the exact accepted version"
                        assert not re.search(r"^(path|git|registry) = ", body, re.M), f"{crate} -> {name} has a non-registry source"
            elif language == "go":
                assert re.search(r'const Version = "([^"]+)"', text_member("/transport.go")).group(1) == version
            elif language == "php":
                assert re.search(r"SDK_VERSION = '([^']+)'", text_member("src/HttpTransport.php")).group(1) == version
            for member in members:
                stream = archive.extractfile(member)
                assert stream is not None
                assert json.load(stream) == expected, f"Receipt mismatch in {path.name}"
    assert actual == expected, f"Receipt mismatch in {path.name}"
print(f"Verified embedded acceptance receipts in {len(files)} {language} artifacts.")
