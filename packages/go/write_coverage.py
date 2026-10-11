"""Reconcile handwritten wire fixture evidence with the pinned coverage ledger.

This emits attribution metadata only; it never generates SDK code or types.
Run from repository root after the Go wire tests pass.
"""
import json
import pathlib
import re

ROOT = pathlib.Path(__file__).resolve().parents[2]
PACKAGE = ROOT / "packages/go"
ledger = json.loads((ROOT / "contracts/coverage.json").read_text())
evidence = []
for test in PACKAGE.glob("*_test.go"):
    source = test.read_text()
    for sdk_method, method, path in re.findall(r'\{"([^"\n]+)", "(GET|POST|PUT|PATCH|DELETE)", "([^"\n]+)"', source):
        evidence.append((sdk_method, method, path, test.name))
operations = []
for operation in ledger["operations"]:
    path = operation["path"]
    pattern = re.escape(path)
    pattern = re.sub(r'\\\{[^}]+\\\}', '[^/]+', pattern)
    candidates = [item for item in evidence if item[1] == operation["method"] and re.fullmatch(pattern, item[2])]
    # Match the most specific literal route first; a parameter cannot turn a
    # fixture for /sessions/stop into proof for /sessions/{session}/stop.
    candidates = [item for item in candidates if not any(other["method"] == operation["method"] and other["path"] == item[2] and other["path"] != path for other in ledger["operations"])]
    entry = {"family": operation["family"], "method": operation["method"], "path": path}
    if candidates:
        chosen = candidates[0]
        entry.update(status="covered", sdkMethod=chosen[0], testFile=chosen[3])
    elif operation["typescript"]["status"] == "excluded":
        entry.update(status="excluded", reason=operation["typescript"].get("reason", "Outside the merged handwritten TypeScript surface."))
    else:
        entry.update(status="missing", reason="Handwritten typed resource and per-operation native request/response test have not both been verified.", milestone="server-sdk-parity")
    operations.append(entry)
manifest = {"schemaVersion": 1, "sourceSdkCommit": "ff51567105b64bf6997e7330ba8eb502d875e7b9", "operations": operations}
(PACKAGE / "coverage.json").write_text(json.dumps(manifest, indent=2) + "\n")
print({status: sum(item["status"] == status for item in operations) for status in ["covered", "excluded", "missing"]})
