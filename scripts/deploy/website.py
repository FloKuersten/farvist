#!/usr/bin/env python3
"""Build, receive and verify a static Farvist release. No release code is executed."""
import concurrent.futures
import gzip
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

REPOSITORY = 'FloKuersten/farvist'
BASE = Path('/var/www/farvist')
ORIGIN = 'https://farvist.com/'
ROOTS = ('index.html', 'marketing.html', '404.html', 'robots.txt', 'ads.txt', 'sitemap.xml',
         'llms.txt', 'llms-full.txt', 'ai-context.json', 'farvist.cursorrules', 'dist', 'assets',
         'examples', 'docs', 'pro', 'privacy', 'blog', 'themer', 'templates', 'about',
         'contact', 'terms', 'ai', '.well-known')
MANIFEST = 'release.json'
MAX_FILE = 5_000_000
MAX_TOTAL = 50_000_000


def require(condition, message):
    if not condition:
        raise ValueError(message)


def version_tuple(version):
    require(isinstance(version, str) and re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version),
            'A stable semantic version is required')
    return tuple(map(int, version.split('.')))


def valid_commit(commit):
    require(isinstance(commit, str) and re.fullmatch(r'[a-f0-9]{40}', commit), 'Invalid commit')
    return commit


def valid_path(name):
    require(isinstance(name, str) and re.fullmatch(r'[a-zA-Z0-9_./-]+', name), 'Invalid site path')
    parts = name.split('/')
    require(all(part not in ('', '.', '..') for part in parts), 'Unsafe site path')
    require(all(not part.startswith('.') for part in parts[1:]), 'Hidden website files are forbidden')
    require(name in ROOTS or parts[0] in ROOTS and len(parts) > 1, 'Path outside website allowlist')
    require(not name.endswith('.map'), 'Source maps are not public assets')
    return name


def validate_manifest(manifest):
    valid_commit(manifest['commit'])
    version_tuple(manifest['version'])
    files = manifest['files']
    require(isinstance(files, list) and 1 <= len(files) <= 1000, 'Invalid file count')
    names = set()
    total = 0
    for item in files:
        name = valid_path(item['path'])
        require(name not in names, 'Duplicate manifest path')
        names.add(name)
        require(type(item['bytes']) is int and 0 <= item['bytes'] <= MAX_FILE, 'Invalid file size')
        require(re.fullmatch(r'[a-f0-9]{64}', item['sha256']), 'Invalid file digest')
        total += item['bytes']
    require(total <= MAX_TOTAL, 'Website exceeds size limit')
    require({'index.html', '404.html', 'assets/farvist.js', 'dist/farvist.min.css'} <= names,
            'Required website files missing')
    return manifest


def gh(path):
    return json.loads(subprocess.check_output(['gh', 'api', f'repos/{REPOSITORY}/{path}']))


def release_gate(tag, event=None):
    require(tag.startswith('v'), 'Invalid release tag')
    version_tuple(tag[1:])
    latest = gh('releases/latest')
    require(latest['tag_name'] == tag and not latest['draft'] and not latest['prerelease'],
            'Only the latest published stable GitHub release may deploy')
    ref = gh(f'git/ref/tags/{tag}')['object']
    if ref['type'] == 'tag':
        ref = gh(f'git/tags/{valid_commit(ref["sha"])}')['object']
    require(ref['type'] == 'commit', 'Tag must resolve to a commit')
    commit = valid_commit(ref['sha'])
    runs = gh(f'actions/workflows/publish.yml/runs?head_sha={commit}&status=success&per_page=100')['workflow_runs']
    matching = [run for run in runs if run['head_sha'] == commit and run['head_branch'] == tag
                and run['event'] in ('release', 'workflow_dispatch') and run['conclusion'] == 'success'
                and run['path'] == '.github/workflows/publish.yml'
                and run['head_repository']['full_name'] == REPOSITORY]
    require(matching, 'No successful npm publication verification for this tag and commit')
    if event is not None:
        require(any(run['id'] == event['id'] for run in matching), 'Untrusted triggering workflow')
    checks = gh(f'actions/workflows/ci.yml/runs?head_sha={commit}&branch=main&event=push&status=success')['workflow_runs']
    require(any(run['head_sha'] == commit and run['head_branch'] == 'main' and run['conclusion'] == 'success'
                for run in checks), 'Main-branch CI must pass on the release commit')
    return commit


def prepare(repo, commit, version, output):
    valid_commit(commit)
    version_tuple(version)
    output.mkdir(parents=True, exist_ok=True)
    def git(*args):
        return subprocess.check_output(['git', '-C', str(repo), *args])
    package = json.loads(git('show', f'{commit}:package.json'))
    require(package['name'] == 'farvist' and package['version'] == version, 'Tag/package version mismatch')
    entries = git('ls-tree', '-rz', commit, '--', *ROOTS).split(b'\0')
    files, contents = [], {}
    for entry in filter(None, entries):
        info, path = entry.decode('utf8').split('\t')
        mode, kind, _ = info.split()
        require(mode in ('100644', '100755') and kind == 'blob', 'Only regular tracked files may deploy')
        valid_path(path)
        data = git('show', f'{commit}:{path}')
        files.append({'path': path, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
        contents[path] = data
    manifest = validate_manifest({'version': version, 'commit': commit, 'files': files})
    encoded = json.dumps(manifest, sort_keys=True).encode()
    (output / 'website-manifest.json').write_bytes(encoded)
    contents[MANIFEST] = encoded
    with tarfile.open(output / 'website.tgz', 'w:gz') as archive:
        for name, data in contents.items():
            member = tarfile.TarInfo(name)
            member.size, member.mode = len(data), 0o644
            archive.addfile(member, io.BytesIO(data))
    return manifest


class LimitedReader:
    def __init__(self, stream, limit):
        self.stream, self.remaining = stream, limit

    def read(self, size=-1):
        size = self.remaining + 1 if size < 0 else min(size, self.remaining + 1)
        data = self.stream.read(size)
        self.remaining -= len(data)
        require(self.remaining >= 0, 'Expanded archive exceeds size limit')
        return data


def unpack(stream, directory):
    total, names = 0, set()
    with gzip.GzipFile(fileobj=stream) as compressed, tarfile.open(
            fileobj=LimitedReader(compressed, MAX_TOTAL + 2_000_000), mode='r|') as archive:
        for member in archive:
            require(member.isfile() and not member.issparse(), 'Archive must contain regular files only')
            require(member.name == MANIFEST or valid_path(member.name), 'Invalid archive member')
            require(member.name not in names and len(names) < 1001, 'Duplicate/excess archive entries')
            require(0 <= member.size <= MAX_FILE, 'Archive file too large')
            total += member.size
            require(total <= MAX_TOTAL, 'Archive too large')
            names.add(member.name)
            target = directory.joinpath(*PurePosixPath(member.name).parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            # The extraction directory is private and new. Never use extractall,
            # archive permissions, links, devices, absolute paths or parent paths.
            with target.open('xb') as destination, archive.extractfile(member) as source:
                shutil.copyfileobj(source, destination)
            target.chmod(0o644)
    manifest = validate_manifest(json.loads((directory / MANIFEST).read_text()))
    require(names == {MANIFEST} | {item['path'] for item in manifest['files']}, 'Archive/manifest mismatch')
    verify_directory(directory, manifest)
    return manifest


def verify_directory(directory, manifest):
    for item in manifest['files']:
        data = (directory / item['path']).read_bytes()
        require(len(data) == item['bytes'] and hashlib.sha256(data).hexdigest() == item['sha256'],
                f'File integrity mismatch: {item["path"]}')


def replace_link(base, name, target):
    temporary = base / f'.{name}-{os.getpid()}'
    os.symlink(target, temporary)
    os.replace(temporary, base / name)


def activate(base, staging, manifest):
    current = base / 'current'
    old_manifest = current / MANIFEST
    if old_manifest.is_file():
        old = json.loads(old_manifest.read_text())
        require(version_tuple(manifest['version']) >= version_tuple(old['version']), 'Refusing release downgrade')
        if old['version'] == manifest['version']:
            require(old['commit'] == manifest['commit'], 'Same version has a different commit')
    release = base / 'releases' / f'{manifest["version"]}-{manifest["commit"]}'
    if release.exists():
        require(json.loads((release / MANIFEST).read_text()) == manifest, 'Existing release manifest differs')
        verify_directory(release, manifest)
    else:
        staging.chmod(0o755)
        staging.rename(release)
    relative = str(release.relative_to(base))
    old_target = os.readlink(current)
    if old_target == relative:
        return {'changed': False, 'commit': manifest['commit'], 'files': len(manifest['files'])}
    replace_link(base, 'previous', old_target)
    replace_link(base, 'current', relative)
    return {'changed': True, 'commit': manifest['commit'], 'files': len(manifest['files'])}


def rollback(base, commit):
    valid_commit(commit)
    current = json.loads((base / 'current' / MANIFEST).read_text())
    require(current['commit'] == commit, 'Refusing rollback of a different active release')
    target = os.readlink(base / 'previous')
    require(target == '/var/www/html' or re.fullmatch(r'releases/[0-9.]+-[a-f0-9]{40}', target), 'Invalid rollback target')
    replace_link(base, 'current', target)
    return {'rolledBack': commit}


def receive():
    import fcntl
    os.umask(0o022)
    # Installed root-owned, called by an SSH forced command as farvist-deploy.
    # This user has no sudo and no write access to nginx, the receiver or SSH keys.
    command = os.environ.get('SSH_ORIGINAL_COMMAND', '')
    require(command == 'deploy' or re.fullmatch(r'rollback [a-f0-9]{40}', command), 'Unsupported deployment command')
    with (BASE / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if command.startswith('rollback '):
            result = rollback(BASE, command.split()[1])
        else:
            with tempfile.TemporaryDirectory(prefix='.incoming-', dir=BASE) as temporary:
                staging = Path(temporary)
                # Cap compressed input before tar parsing, in addition to per-file
                # and expanded-size limits. The SSH connection has an idle timeout.
                data = sys.stdin.buffer.read(20_000_001)
                require(len(data) <= 20_000_000, 'Compressed archive too large')
                manifest = unpack(io.BytesIO(data), staging)
                result = activate(BASE, staging, manifest)
        print(json.dumps(result))


def undo_email_protection(html):
    def decode(value):
        data = bytes.fromhex(value)
        return bytes(byte ^ data[0] for byte in data[1:]).decode('utf8')
    html = re.sub(r'<script data-cfasync="false" src="/cdn-cgi/scripts/[a-f\d]+/cloudflare-static/email-decode\.min\.js"></script>', '', html)
    html = re.sub(r'href="/cdn-cgi/l/email-protection#([a-f\d]+)"', lambda m: 'href="mailto:' + decode(m[1]) + '"', html)
    return re.sub(r'<(span|a)\b[^>]*\bdata-cfemail="([a-f\d]+)"[^>]*>\[email&#160;protected\]</\1>', lambda m: decode(m[2]), html)


def public_verify(manifest, output):
    validate_manifest(manifest)
    def request(path):
        url = ORIGIN + path + ('&' if '?' in path else '?') + 'release=' + manifest['commit']
        with urllib.request.urlopen(urllib.request.Request(url, headers={'Cache-Control': 'no-cache'}), timeout=30) as response:
            require(response.url.startswith(ORIGIN), 'Unexpected website redirect')
            return response.read(MAX_FILE + 1)
    def check(item):
        path = '' if item['path'] == 'index.html' else re.sub(r'/index\.html$', '/', item['path'])
        if path.endswith(('.css', '.js')):
            path += '?v=' + manifest['version']
        data = request(path)
        digest = hashlib.sha256(data).hexdigest()
        normalized = hashlib.sha256(undo_email_protection(data.decode()).encode()).hexdigest() if item['path'].endswith('.html') else digest
        require(normalized == item['sha256'], f'Public file mismatch: {item["path"]}')
        return {'path': item['path'], 'sha256': digest, 'matchesCommit': True,
                'cloudflareEmailProtection': digest != normalized}
    for attempt in range(1, 9):
        try:
            require(json.loads(request(MANIFEST)) == manifest, 'Public release manifest differs')
            with concurrent.futures.ThreadPoolExecutor(max_workers=5) as pool:
                results = list(pool.map(check, manifest['files']))
            proof = {'version': manifest['version'], 'commit': manifest['commit'], 'filesChecked': len(results), 'results': results}
            (output / 'website-proof.json').write_text(json.dumps(proof, indent=2) + '\n')
            print(f'Public HTTPS verification passed for {len(results)} files at {manifest["commit"]}')
            return proof
        except Exception:
            if attempt == 8:
                raise
            print(f'Waiting for website propagation ({attempt}/8)', flush=True)
            time.sleep(10)


def transfer(output):
    manifest = validate_manifest(json.loads((output / 'website-manifest.json').read_text()))
    host = os.environ['WEBSITE_SSH_HOST']
    require(re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9.-]+', host), 'Invalid SSH host')
    with tempfile.TemporaryDirectory(prefix='farvist-ssh-') as temporary:
        folder = Path(temporary)
        key, known = folder / 'key', folder / 'known_hosts'
        key.write_text(os.environ['WEBSITE_SSH_KEY'].strip() + '\n')
        key.chmod(0o600)
        known.write_text(os.environ['WEBSITE_SSH_KNOWN_HOSTS'].strip() + '\n')
        ssh = ['ssh', '-T', '-i', str(key), '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes',
               '-o', 'StrictHostKeyChecking=yes', '-o', f'UserKnownHostsFile={known}',
               '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=4',
               f'farvist-deploy@{host}']
        receipt = json.loads(subprocess.check_output([*ssh, 'deploy'], input=(output / 'website.tgz').read_bytes(), timeout=120))
        require(receipt['commit'] == manifest['commit'], 'Origin deployed the wrong commit')
        (output / 'origin-receipt.json').write_text(json.dumps(receipt) + '\n')
        try:
            public_verify(manifest, output)
        except Exception:
            if receipt['changed']:
                subprocess.run([*ssh, 'rollback ' + manifest['commit']], check=True, timeout=30)
            raise


def main():
    operation = sys.argv[1]
    if operation == 'receive':
        receive()
        return
    output = Path(sys.argv[2]).resolve()
    if operation == 'prepare':
        require(os.environ['GITHUB_REPOSITORY'] == REPOSITORY, 'Unexpected repository')
        require(os.environ['GITHUB_REF'] == 'refs/heads/main', 'Website workflow must run from main')
        event = json.loads(Path(os.environ['GITHUB_EVENT_PATH']).read_text())
        run = event.get('workflow_run') if os.environ['GITHUB_EVENT_NAME'] == 'workflow_run' else None
        tag = run['head_branch'] if run else os.environ['RELEASE_TAG']
        commit = release_gate(tag, run)
        manifest = prepare(Path.cwd(), commit, tag[1:], output)
        with open(os.environ['GITHUB_OUTPUT'], 'a') as stream:
            stream.write(f'tag={tag}\nversion={tag[1:]}\ncommit={commit}\n')
        print(f'Prepared {len(manifest["files"])} tracked files from {tag} at {commit}')
    elif operation == 'transfer':
        transfer(output)
    else:
        raise ValueError('Unknown operation')


if __name__ == '__main__':
    main()
