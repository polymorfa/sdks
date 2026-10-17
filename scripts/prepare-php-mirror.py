"""Prepare Composer's root source tree from an inspected accepted archive.

This command is local only. It never creates a repository, commit, tag or push.
The release workflow owns acceptance; this command preserves its exact bytes.
"""

import argparse
import hashlib
import json
import re
import shutil
import subprocess
import sys
import tarfile
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory


def prepare(packs: Path, receipt_path: Path, output: Path) -> dict:
    subprocess.run(
        [
            sys.executable,
            str(Path(__file__).with_name("inspect-native-artifacts.py")),
            "php",
            str(packs),
            str(receipt_path),
        ],
        check=True,
    )
    receipt = json.loads(receipt_path.read_text())
    assert receipt["schemaVersion"] == 1
    assert receipt["repository"] == "polymorfa/sdks"
    assert re.fullmatch(r"[a-f0-9]{40}", receipt["sourceSha"])
    assert re.fullmatch(r"[a-f0-9]{64}", receipt["fingerprint"])
    version = receipt["versions"]["semver"]
    assert re.fullmatch(r"\d+\.\d+\.\d+(?:-dev\.\d{14})?", version)
    assert receipt["channel"] in ("stable", "nightly")
    assert ("-dev." in version) == (receipt["channel"] == "nightly")
    assert not output.exists(), (
        "Mirror output must not exist; preserve previous preparations"
    )
    archives = [p for p in packs.iterdir() if p.name != "release-contract.json"]
    assert len(archives) == 1
    archive_path = archives[0]
    allowed_root = {
        "README.md",
        "calls.md",
        "composer.json",
        "LICENSE",
        "release-contract.json",
    }
    # Exact runtime resources the source loads; no other non-PHP file is mirrored.
    allowed_resources = {"src/Storage/schema2.json"}
    files = {}
    with tarfile.open(archive_path) as archive:
        members = archive.getmembers()
        assert len(members) <= 4096, "Too many archive entries"
        total = 0
        for member in members:
            relative = PurePosixPath(member.name)
            assert not relative.is_absolute() and ".." not in relative.parts
            assert str(relative) == member.name and "\\" not in member.name
            assert member.isfile(), "Mirror accepts regular files only"
            assert member.name in allowed_root or member.name in allowed_resources or (
                relative.parts[0] == "src" and relative.suffix == ".php"
            ), "Unexpected mirror file"
            assert member.name not in files, "Duplicate archive path"
            total += member.size
            assert total <= 64 * 1024 * 1024, "Mirror archive is too large"
            stream = archive.extractfile(member)
            assert stream is not None
            files[member.name] = stream.read()
    assert {
        "composer.json",
        "src/HttpTransport.php",
        "LICENSE",
        "README.md",
        "release-contract.json",
    } <= files.keys()
    composer = json.loads(files["composer.json"])
    assert composer["name"] == "polymorfa/sdk"
    assert composer["autoload"]["psr-4"]["Polymorfa\\"] == "src/"
    assert "version" not in composer, (
        "Composer derives the version from the approved VCS ref"
    )
    assert json.loads(files["release-contract.json"]) == receipt
    plan = {
        "schemaVersion": 1,
        "package": "polymorfa/sdk",
        "sourceSha": receipt["sourceSha"],
        "sourceFingerprint": receipt["fingerprint"],
        "version": version,
        "channel": receipt["channel"],
        "sourceDirectory": "source",
        "archiveSha256": hashlib.sha256(archive_path.read_bytes()).hexdigest(),
        "files": {
            name: hashlib.sha256(data).hexdigest()
            for name, data in sorted(files.items())
        },
        "publication": "not performed",
    }
    if receipt["channel"] == "stable":
        plan["proposedTag"] = "v" + version
    else:
        # Timestamped SDK prereleases remain in provenance. Composer discovers
        # nightly source through the approved mirror branch, not a made-up tag.
        plan["composerBranchVersion"] = "dev-main"
    output.parent.mkdir(parents=True, exist_ok=True)
    with TemporaryDirectory(prefix=".php-mirror-", dir=output.parent) as staging:
        staged = Path(staging) / "prepared"
        staged.mkdir(mode=0o700)
        for name, data in files.items():
            destination = staged / "source" / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(data)
            destination.chmod(0o644)
        (staged / "mirror-plan.json").write_text(json.dumps(plan, indent=2) + "\n")
        # An exclusive reservation prevents overwriting another preparation.
        output.mkdir(mode=0o700)
        try:
            for child in staged.iterdir():
                shutil.move(str(child), str(output / child.name))
        except BaseException:
            shutil.rmtree(output)
            raise
    return plan


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "packs", type=Path, help="Inspected native-PHP accepted-packs directory"
    )
    parser.add_argument(
        "receipt", type=Path, help="Trusted workflow release-contract.json"
    )
    parser.add_argument(
        "output", type=Path, help="New local mirror preparation directory"
    )
    args = parser.parse_args()
    prepare(args.packs.resolve(), args.receipt.resolve(), args.output.absolute())
    print(
        "Prepared PHP root source and mirror plan. No repository, tag or publication was created."
    )
