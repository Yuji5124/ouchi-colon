"""Save the built 1.9.0 software with the original local host; never include secrets/venvs."""
import hashlib
import json
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parent.parent
host = root.parent / 'colon-atom-app'
destination = root / 'work' / 'releases'
destination.mkdir(parents=True, exist_ok=True)
archive = destination / 'Colon-Motor-1.9.0-Notif.zip'
snapshot = json.loads((root / 'public/motor-release-1.9.0.json').read_text(encoding='utf-8'))
assert snapshot['firmware'] == 'colon-motor-1.9.0'
assert json.loads((root / 'dist/firmware/program/manifest.json').read_text())['version'] == '1.9.0'

with ZipFile(archive, 'w', ZIP_DEFLATED, compresslevel=6) as bundle:
    for path in sorted((root / 'dist').rglob('*')):
        if path.is_file():
            relative = path.relative_to(root / 'dist')
            # Include only the pinned image in its pinned directory.
            if relative.parts[:2] == ('firmware', 'notif-1.9.0') and len(relative.parts)>3 and relative.parts[2]!='colon-motor-1.9.0':
                continue
            bundle.write(path, 'ouchi-colon-motor-test/dist/' + relative.as_posix())
    for name in ['notif-extension.mjs', 'motor_ble.py', 'requirements.txt']:
        bundle.write(root / 'local-server' / name, 'ouchi-colon-motor-test/local-server/' + name)
    bundle.write(root / 'docs/motor-test/release-1.9.0.md', '1.9.0-README.md')
    for path in sorted(host.rglob('*')):
        relative = path.relative_to(host)
        if path.is_file() and not any(p in {'.git', 'node_modules', 'work', '__pycache__'} for p in relative.parts):
            bundle.write(path, 'colon-atom-app/' + relative.as_posix())
    setup = r'''@echo off
cd /d "%~dp0"
python -m venv ouchi-colon-motor-test\work\notif-motor-venv
if errorlevel 1 goto failed
ouchi-colon-motor-test\work\notif-motor-venv\Scripts\python.exe -m pip install -r ouchi-colon-motor-test\local-server\requirements.txt
if errorlevel 1 goto failed
cd colon-atom-app
start "" "http://localhost:18180/ouchi-colon/?motor=1&transport=notif"
node server.mjs
:failed
pause
'''
    bundle.writestr('START-Notif-1.9.0.cmd', setup.replace('\n', '\r\n'))

digest = hashlib.sha256(archive.read_bytes()).hexdigest()
(destination / (archive.name + '.sha256')).write_text(digest + '  ' + archive.name + '\n', encoding='ascii')
with ZipFile(archive) as bundle:
    assert bundle.testzip() is None
    assert json.loads(bundle.read('ouchi-colon-motor-test/dist/motor-release-1.9.0.json'))['turnMs']['45'] == 750
print(str(archive))
print('SHA256:', digest)
print('ZIP entries:', len(bundle.namelist()), 'bytes:', archive.stat().st_size)
