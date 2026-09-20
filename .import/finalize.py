"""Check delivery completeness and record fresh checksums without rewriting provenance."""
import hashlib
import json
import os
from pathlib import Path
import shutil

root = Path.cwd()
original = json.loads((root / 'docs/ORIGINAL_RELEASE_MANIFEST.json').read_text())
missing = [entry['path'] for entry in original['files'] if not (root / entry['path']).is_file()]
assert not missing, f'Missing original delivery paths: {missing}'
report = json.loads((root / 'artifacts/browser-tests.json').read_text())
example = json.loads((root / 'artifacts/examples-tests.json').read_text())
shutil.rmtree(root / '.import')
files = []
for path in sorted(root.rglob('*')):
    rel = path.relative_to(root)
    if not path.is_file() or any(part in ('.git', 'node_modules', '__pycache__') for part in rel.parts) or str(rel) == 'release-manifest.json':
        continue
    data = path.read_bytes()
    files.append({'path': rel.as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
output = {**original, 'files': files, 'provenance': {'originalManifest': 'docs/ORIGINAL_RELEASE_MANIFEST.json', 'sourceImport': 'docs/SOURCE_IMPORT.json', 'run': f'https://github.com/{os.environ["GITHUB_REPOSITORY"]}/actions/runs/{os.environ["GITHUB_RUN_ID"]}', 'generatedBinaryArtifacts': 'Rebuilt from the verified source in GitHub Actions; not copied from the original archive'}, 'freshBrowserReport': report, 'freshExampleReport': example}
(root / 'release-manifest.json').write_text(json.dumps(output, indent=2) + '\n')
print(f'Validated all {len(original["files"])} original manifest paths; recorded {len(files)} current files')
