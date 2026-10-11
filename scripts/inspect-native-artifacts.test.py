import json, subprocess, tarfile, unittest, zipfile
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
ROOT = Path.home() / '.polymorfa-agent-work/native-artifact-inspection-tests'
ROOT.mkdir(parents=True, exist_ok=True)
SCRIPT = Path(__file__).with_name('inspect-native-artifacts.py')
class Inspection(unittest.TestCase):
    def run_case(self, receipt, inner, zip_format=False):
        with TemporaryDirectory(dir=ROOT) as scratch:
            folder=Path(scratch); packs=folder/'packs';packs.mkdir(); meta=folder/'release-contract.json';receipt = dict(receipt, versions={'semver':'0.2.3','python':'0.2.3'}); inner = dict(inner, versions=receipt['versions']); meta.write_text(json.dumps(receipt))
            if zip_format:
                with zipfile.ZipFile(packs/'sdk.nupkg','w') as archive: archive.writestr('release-contract.json',json.dumps(inner)); archive.writestr('sdk.nuspec','<package><metadata><version>0.2.3</version></metadata></package>')
            else:
                raw=json.dumps(inner).encode()
                with tarfile.open(packs/'sdk.crate','w') as archive:
                    entry=tarfile.TarInfo('sdk/release-contract.json');entry.size=len(raw);archive.addfile(entry,BytesIO(raw)); version=b'[package]\nversion = "0.2.3"\n'; member=tarfile.TarInfo('sdk/Cargo.toml');member.size=len(version);archive.addfile(member,BytesIO(version))
            return subprocess.run(['python3',str(SCRIPT),'dotnet' if zip_format else 'rust',str(packs),str(meta)],capture_output=True).returncode
    def test_matching(self):
        self.assertEqual(self.run_case({'sourceSha':'a'},{'sourceSha':'a'}),0)
        self.assertEqual(self.run_case({'sourceSha':'a'},{'sourceSha':'a'},True),0)
    def test_tampered(self):
        self.assertNotEqual(self.run_case({'sourceSha':'a'},{'sourceSha':'b'}),0)
        self.assertNotEqual(self.run_case({'sourceSha':'a'},{'sourceSha':'b'},True),0)
unittest.main()
