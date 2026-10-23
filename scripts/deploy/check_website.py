"""Adversarial tests for the only commands available to the deploy SSH key."""
import hashlib
import io
import json
import os
from pathlib import Path
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import website


def fixture(version='1.8.4', commit='a' * 40):
    files = {'index.html': b'homepage', '404.html': b'not found',
             'assets/farvist.js': b'script', 'dist/farvist.min.css': b'css'}
    manifest = {'version': version, 'commit': commit, 'files': [
        {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in files.items()]}
    return files, manifest


def archive(files, manifest, extra=None):
    result = io.BytesIO()
    with tarfile.open(fileobj=result, mode='w:gz') as tar:
        for name, data in {**files, website.MANIFEST: json.dumps(manifest).encode()}.items():
            info = tarfile.TarInfo(name)
            info.size = len(data)
            tar.addfile(info, io.BytesIO(data))
        if extra:
            tar.addfile(extra, io.BytesIO(b'bad'))
    result.seek(0)
    return result


class DeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)

    def test_valid_archive_and_manifest(self):
        files, manifest = fixture()
        self.assertEqual(website.unpack(archive(files, manifest), self.base), manifest)

    def test_unsafe_members_are_rejected(self):
        for name, kind in [('../escape', tarfile.REGTYPE), ('/absolute', tarfile.REGTYPE),
                           ('assets/link', tarfile.SYMTYPE), ('assets/hard', tarfile.LNKTYPE),
                           ('assets/device', tarfile.CHRTYPE), ('assets/.secret', tarfile.REGTYPE),
                           ('scripts/private.py', tarfile.REGTYPE), ('index.html', tarfile.REGTYPE)]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                files, manifest = fixture()
                info = tarfile.TarInfo(name)
                info.type, info.linkname = kind, '/etc/passwd'
                with self.assertRaises(ValueError):
                    website.unpack(archive(files, manifest, info), Path(temp))

    def test_mismatched_bytes_missing_and_extra_files_fail(self):
        for change in ('corrupt', 'missing', 'extra'):
            with self.subTest(change=change), tempfile.TemporaryDirectory() as temp:
                files, manifest = fixture()
                if change == 'corrupt':
                    files['index.html'] = b'corrupt'
                elif change == 'missing':
                    files.pop('index.html')
                else:
                    files['assets/unlisted.js'] = b'unlisted'
                with self.assertRaises(ValueError):
                    website.unpack(archive(files, manifest), Path(temp))

    def test_size_limits_include_expanded_archive_metadata(self):
        with self.assertRaises(ValueError):
            website.LimitedReader(io.BytesIO(b'123456'), 5).read(1_000_000)
        files, manifest = fixture()
        manifest['files'][0]['bytes'] = website.MAX_FILE + 1
        with self.assertRaises(ValueError):
            website.validate_manifest(manifest)

    def test_private_files_are_rejected_even_with_matching_manifest(self):
        for name in ('assets/contact.php', 'contact/CONTACT.PHP8', 'docs/config.phtml',
                     'assets/archive.phar', 'assets/contact.php.txt', 'assets/contact.php/index.html',
                     'assets/secret.key', 'docs/database.sql', 'assets/site.js.bak',
                     'assets/settings.env.json', 'assets/site.js.map', 'assets/site.js.MAP',
                     'assets/unknown.bin', 'assets/.env', '.well-known/.git/config'):
            with self.subTest(name=name), tempfile.TemporaryDirectory() as temp:
                files, manifest = fixture()
                data = b'non-secret regression fixture'
                files[name] = data
                manifest['files'].append({'path': name, 'bytes': len(data),
                                         'sha256': hashlib.sha256(data).hexdigest()})
                with self.assertRaises(ValueError):
                    website.validate_manifest(manifest)
                with self.assertRaises(ValueError):
                    website.unpack(archive(files, manifest), Path(temp))
                self.assertFalse((Path(temp) / name).exists())

    def test_public_static_formats_remain_supported(self):
        for name in ('assets/image.webp', 'assets/font.woff2', 'assets/site.js',
                     'docs/index.html', 'ai/prompt.md', 'ai/rules.mdc',
                     '.well-known/security.txt', '.well-known/ai-plugin.json',
                     'farvist.cursorrules', 'ai-context.json'):
            with self.subTest(name=name):
                self.assertEqual(website.valid_path(name), name)

    @unittest.skipIf(os.name == 'nt', 'Deployment symlinks run on Linux')
    def test_atomic_activation_idempotence_downgrade_and_rollback(self):
        (self.base / 'releases').mkdir()
        seed = self.base / 'releases' / ('1.8.3-' + 'b' * 40)
        seed.mkdir()
        os.symlink(str(seed.relative_to(self.base)), self.base / 'current')
        files, manifest = fixture()
        stage = self.base / 'stage'
        stage.mkdir()
        website.unpack(archive(files, manifest), stage)
        self.assertTrue(website.activate(self.base, stage, manifest)['changed'])
        self.assertEqual((self.base / 'current' / 'index.html').read_bytes(), b'homepage')
        self.assertFalse(website.activate(self.base, stage, manifest)['changed'])
        with self.assertRaisesRegex(ValueError, 'different active release'):
            website.rollback(self.base, 'c' * 40)
        _, older = fixture('1.8.2', 'c' * 40)
        with self.assertRaisesRegex(ValueError, 'downgrade'):
            website.activate(self.base, stage, older)
        website.rollback(self.base, manifest['commit'])
        self.assertEqual((self.base / 'current').resolve(), seed)

    def test_unpublished_or_stale_release_is_refused(self):
        with patch.object(website, 'gh', return_value={'tag_name': 'v1.8.5', 'draft': False, 'prerelease': False}):
            with self.assertRaisesRegex(ValueError, 'latest published'):
                website.release_gate('v1.8.4')
        for tag in ('v1.8.4;echo bad', 'v01.8.4', 'v1.8.4-rc.1'):
            with self.assertRaises(ValueError):
                website.release_gate(tag)

    def test_no_deploy_without_successful_publication(self):
        answers = [{'tag_name': 'v1.8.4', 'draft': False, 'prerelease': False},
                   {'object': {'type': 'commit', 'sha': 'a' * 40}}, {'workflow_runs': []}]
        with patch.object(website, 'gh', side_effect=answers):
            with self.assertRaisesRegex(ValueError, 'No successful npm'):
                website.release_gate('v1.8.4')


if __name__ == '__main__':
    unittest.main()
