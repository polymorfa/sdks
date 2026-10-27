import json, subprocess, tarfile, unittest, zipfile
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
ROOT = Path.home() / '.polymorfa-agent-work/native-artifact-inspection-tests'
ROOT.mkdir(parents=True, exist_ok=True)
SCRIPT = Path(__file__).with_name('inspect-native-artifacts.py')
GRAPH = json.loads(Path(__file__).with_name('native-packages.json').read_text())
VERSION = '0.2.3'


def add(archive, name, data):
    entry = tarfile.TarInfo(name)
    entry.size = len(data)
    archive.addfile(entry, BytesIO(data))


class Inspection(unittest.TestCase):
    """Fixtures follow the real package graph in scripts/native-packages.json."""

    def run_case(self, language, inner_sha='a', mutate=None):
        with TemporaryDirectory(dir=ROOT) as scratch:
            folder = Path(scratch); packs = folder / 'packs'; packs.mkdir(); meta = folder / 'release-contract.json'
            receipt = {'sourceSha': 'a', 'versions': {'semver': VERSION, 'python': VERSION}}
            inner = json.dumps(dict(receipt, sourceSha=inner_sha)).encode()
            meta.write_text(json.dumps(receipt))
            for entry in GRAPH[language]:
                name, deps = entry['name'], list(entry['dependsOn'])
                version, path_dep = VERSION, False
                if mutate and mutate[0] == name:
                    if mutate[1] == 'missing':
                        continue
                    version = '0.0.1' if mutate[1] == 'version' else VERSION
                    path_dep = mutate[1] == 'path'
                if language == 'dotnet':
                    dependencies = ''.join(f'<dependency id="{d}" version="{version}" />' for d in deps)
                    with zipfile.ZipFile(packs / f'{name}.{VERSION}.nupkg', 'w') as archive:
                        archive.writestr('release-contract.json', inner)
                        archive.writestr(f'{name}.nuspec', f'<package><metadata><id>{name}</id><version>{VERSION}</version><dependencies><group>{dependencies}</group></dependencies></metadata></package>')
                else:
                    manifest = f'[package]\nname = "{name}"\nversion = "{VERSION}"\n'
                    for d in deps:
                        manifest += f'\n[dependencies.{d}]\nversion = "={version}"\n' + ('path = "../core"\n' if path_dep else '')
                    with tarfile.open(packs / f'{name}-{VERSION}.crate', 'w') as archive:
                        add(archive, f'{name}-{VERSION}/release-contract.json', inner)
                        add(archive, f'{name}-{VERSION}/Cargo.toml', manifest.encode())
            return subprocess.run(['python3', str(SCRIPT), language, str(packs), str(meta)], capture_output=True).returncode

    def test_matching(self):
        self.assertEqual(self.run_case('rust'), 0)
        self.assertEqual(self.run_case('dotnet'), 0)

    def test_tampered(self):
        self.assertNotEqual(self.run_case('rust', 'b'), 0)
        self.assertNotEqual(self.run_case('dotnet', 'b'), 0)

    def test_incomplete_graph_or_non_exact_internal_dependencies(self):
        for language, name in [('rust', 'polymorfa-storage-core'), ('dotnet', 'Polymorfa.Storage.Sql')]:
            self.assertNotEqual(self.run_case(language, mutate=(name, 'missing')), 0)
        self.assertNotEqual(self.run_case('rust', mutate=('polymorfa-sdk', 'version')), 0)
        self.assertNotEqual(self.run_case('rust', mutate=('polymorfa-storage-indexeddb', 'path')), 0)
        self.assertNotEqual(self.run_case('dotnet', mutate=('Polymorfa.Storage.LibSql', 'version')), 0)


unittest.main()
