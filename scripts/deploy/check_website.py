"""Adversarial tests for the only commands available to the deploy SSH key."""
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile
import unittest
from unittest.mock import patch
import website


def fixture(version='1.8.4', commit='a' * 40, revision=None):
    files = {'index.html': b'homepage', '404.html': b'not found',
             'assets/farvist.js': b'script', 'dist/farvist.min.css': b'css'}
    manifest = {'version': version, 'commit': commit, 'files': [
        {'path': name, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()}
        for name, data in files.items()]}
    if revision is not None:
        manifest['revision'] = revision
    return files, manifest


def passing_ci(commit):
    return {'head_sha': commit, 'head_branch': 'main', 'event': 'push',
            'conclusion': 'success', 'path': '.github/workflows/ci.yml',
            'head_repository': {'full_name': website.REPOSITORY}}


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

    def test_revision_requires_bounded_nonnegative_integer(self):
        for revision in (-1, True, '2', 1.5, 1_000_000_001):
            with self.subTest(revision=revision), self.assertRaisesRegex(ValueError, 'revision'):
                website.validate_manifest(fixture(revision=revision)[1])
        for revision in (None, 0, 1, 200):
            website.validate_manifest(fixture(revision=revision)[1])

    def test_revision_ordering_preserves_legacy_retry_and_package_upgrade(self):
        old = fixture(revision=120)[1]
        website.require_forward_release(old, fixture(revision=120)[1])
        website.require_forward_release(old, fixture(commit='b' * 40, revision=121)[1])
        website.require_forward_release(fixture()[1], fixture(commit='b' * 40, revision=1)[1])
        website.require_forward_release(old, fixture('1.8.5', 'b' * 40, 125)[1])
        for revision in (None, 0, 119, 120):
            with self.subTest(revision=revision), self.assertRaisesRegex(ValueError, 'revision downgrade'):
                website.require_forward_release(old, fixture(commit='b' * 40, revision=revision)[1])
        with self.assertRaisesRegex(ValueError, 'release downgrade'):
            website.require_forward_release(old, fixture('1.8.3', 'b' * 40, 999)[1])

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

    @unittest.skipIf(os.name == 'nt', 'Deployment symlinks run on Linux')
    def test_website_updates_keep_package_version_and_reject_old_revisions(self):
        (self.base / 'releases').mkdir()
        seed = self.base / 'legacy'
        seed.mkdir()
        os.symlink(seed, self.base / 'current')
        for commit, revision in [('a' * 40, 120), ('b' * 40, 123)]:
            files, manifest = fixture(commit=commit, revision=revision)
            stage = self.base / commit
            stage.mkdir()
            website.unpack(archive(files, manifest), stage)
            receipt = website.activate(self.base, stage, manifest)
            self.assertTrue(receipt['changed'])
            self.assertEqual(receipt['revision'], revision)
            self.assertFalse(website.activate(self.base, stage, manifest)['changed'])
        for revision in (None, 0, 122, 123):
            with self.subTest(revision=revision), self.assertRaisesRegex(ValueError, 'revision downgrade'):
                website.activate(self.base, stage, fixture(commit='c' * 40, revision=revision)[1])
        with self.assertRaisesRegex(ValueError, 'release downgrade'):
            website.activate(self.base, stage, fixture('1.8.3', 'd' * 40, 999)[1])
        website.rollback(self.base, 'b' * 40)
        self.assertEqual(json.loads((self.base / 'current' / website.MANIFEST).read_text())['commit'], 'a' * 40)

    @unittest.skipIf(os.name == 'nt', 'Deployment symlinks run on Linux')
    def test_legacy_same_commit_retry_preserves_immutable_manifest(self):
        (self.base / 'releases').mkdir()
        files, old = fixture()
        release = self.base / 'releases' / f'{old["version"]}-{old["commit"]}'
        release.mkdir()
        website.unpack(archive(files, old), release)
        os.symlink(str(release.relative_to(self.base)), self.base / 'current')
        incoming = dict(old, revision=120)
        receipt = website.activate(self.base, self.base / 'unused', incoming)
        self.assertEqual(receipt, {'changed': False, 'commit': old['commit'], 'revision': 0, 'files': 4})
        self.assertEqual(json.loads((release / website.MANIFEST).read_text()), old)
        incoming['files'] = [dict(item) for item in old['files']]
        incoming['files'][0]['sha256'] = '0' * 64
        with self.assertRaisesRegex(ValueError, 'manifest differs'):
            website.activate(self.base, self.base / 'unused', incoming)

    @unittest.skipIf(os.name == 'nt', 'Deployment symlinks run on Linux')
    def test_legacy_release_accepts_newer_site_and_new_package_release(self):
        (self.base / 'releases').mkdir()
        files, old = fixture()
        release = self.base / 'releases' / f'{old["version"]}-{old["commit"]}'
        release.mkdir()
        website.unpack(archive(files, old), release)
        os.symlink(str(release.relative_to(self.base)), self.base / 'current')
        for version, commit, revision in [('1.8.4', 'b' * 40, 123), ('1.8.5', 'c' * 40, 125)]:
            files, manifest = fixture(version, commit, revision)
            stage = self.base / commit
            stage.mkdir()
            website.unpack(archive(files, manifest), stage)
            self.assertTrue(website.activate(self.base, stage, manifest)['changed'])

    def test_ci_requires_exact_successful_main_push_from_this_repository_and_workflow(self):
        good = passing_ci('a' * 40)
        with patch.object(website, 'gh', return_value={'workflow_runs': [good]}):
            website.require_main_ci('a' * 40)
        variants = ({'head_sha': 'b' * 40}, {'head_branch': 'feature'}, {'event': 'pull_request'},
                    {'conclusion': 'failure'}, {'path': '.github/workflows/other.yml'},
                    {'head_repository': {'full_name': 'someone/farvist'}})
        for changes in variants:
            with self.subTest(changes=changes), patch.object(website, 'gh', return_value={
                    'workflow_runs': [{**good, **changes}]}):
                with self.assertRaisesRegex(ValueError, 'Main-branch CI'):
                    website.require_main_ci('a' * 40)

    def test_transfer_legacy_retry_verifies_retained_manifest(self):
        _, manifest = fixture(revision=120)
        (self.base / 'website-manifest.json').write_text(json.dumps(manifest))
        (self.base / 'website.tgz').write_bytes(b'archive fixture')
        receipt = {'changed': False, 'commit': manifest['commit'], 'revision': 0}
        environment = {'WEBSITE_SSH_HOST': 'example.invalid', 'WEBSITE_SSH_KEY': 'fixture',
                       'WEBSITE_SSH_KNOWN_HOSTS': 'fixture'}
        with patch.dict(os.environ, environment), patch.object(website.subprocess, 'check_output',
                return_value=json.dumps(receipt).encode()), patch.object(website, 'public_verify') as verify:
            website.transfer(self.base)
        expected = dict(manifest)
        expected.pop('revision')
        verify.assert_called_once_with(expected, self.base)
        self.assertEqual(json.loads((self.base / 'website-manifest.json').read_text()), expected)

    def test_transfer_rolls_back_changed_release_if_receiver_lacks_revision_support(self):
        _, manifest = fixture(revision=120)
        (self.base / 'website-manifest.json').write_text(json.dumps(manifest))
        (self.base / 'website.tgz').write_bytes(b'archive fixture')
        receipt = {'changed': True, 'commit': manifest['commit']}
        environment = {'WEBSITE_SSH_HOST': 'example.invalid', 'WEBSITE_SSH_KEY': 'fixture',
                       'WEBSITE_SSH_KNOWN_HOSTS': 'fixture'}
        with (patch.dict(os.environ, environment), patch.object(website.subprocess, 'check_output',
                return_value=json.dumps(receipt).encode()), patch.object(website.subprocess, 'run') as rollback,
                patch.object(website, 'public_verify') as verify):
            with self.assertRaisesRegex(ValueError, 'support website revisions'):
                website.transfer(self.base)
        verify.assert_not_called()
        self.assertEqual(rollback.call_args.args[0][-1], 'rollback ' + manifest['commit'])

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


class WebsiteSourceTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.repo = Path(self.temporary.name)
        self.git('init', '-b', 'main')
        self.git('config', 'user.name', 'Deployment tests')
        self.git('config', 'user.email', 'deployment-tests@example.invalid')
        files, _ = fixture()
        files.update({'scss/farvist.scss': b'framework source', 'bin/farvist.mjs': b'cli',
                      'assets/icons/farvist-icons.svg': b'<svg/>',
                      'package.json': json.dumps({'name': 'farvist', 'version': '1.8.4',
                                                  'main': 'dist/farvist.css'}).encode()})
        for name, data in files.items():
            self.write(name, data)
        self.release = self.commit()

    def git(self, *args):
        return subprocess.check_output(['git', '-C', str(self.repo), *args], stderr=subprocess.DEVNULL)

    def write(self, name, data):
        target = self.repo / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(data)

    def commit(self):
        self.git('add', '.')
        self.git('-c', 'commit.gpgsign=false', 'commit', '-m', 'Fixture')
        return self.git('rev-parse', 'HEAD').decode().strip()

    def ci_answers(self, commit):
        return [{'commit': {'sha': commit}}, {'workflow_runs': [passing_ci(commit)]}]

    def test_website_only_main_commit_passes_and_has_deterministic_revision(self):
        for name in ('templates/index.html', 'templates/downloads/dashboard.html',
                     'assets/templates.css', 'assets/templates.js', 'scss/site/templates.scss'):
            self.write(name, b'website-only fixture')
        self.write('package.json', json.dumps({'name': 'farvist', 'version': '1.8.4',
                                               'main': 'dist/farvist.css', 'scripts': {'site': 'build'},
                                               'devDependencies': {'example': '1'},
                                               'files': ['dist', 'assets', '!assets/templates.js']}).encode())
        commit = self.commit()
        with patch.object(website, 'gh', side_effect=self.ci_answers(commit)):
            self.assertEqual(website.website_gate(self.repo, commit, self.release), commit)
        for output in ('archive1', 'archive2'):
            manifest = website.prepare(self.repo, commit, '1.8.4', self.repo / output)
            self.assertEqual(manifest['revision'], 2)
        self.assertEqual((self.repo / 'archive1/website-manifest.json').read_bytes(),
                         (self.repo / 'archive2/website-manifest.json').read_bytes())

    def test_website_gate_rejects_stale_main_and_wrong_checkout(self):
        self.write('index.html', b'new homepage')
        commit = self.commit()
        with patch.object(website, 'gh', return_value={'commit': {'sha': commit}}):
            with self.assertRaisesRegex(ValueError, 'exact current main'):
                website.website_gate(self.repo, self.release, self.release)
        with patch.object(website, 'gh', return_value={'commit': {'sha': self.release}}):
            with self.assertRaisesRegex(ValueError, 'trusted workflow checkout'):
                website.website_gate(self.repo, self.release, self.release)

    def test_website_gate_requires_ancestry_and_main_ci(self):
        self.write('index.html', b'new homepage')
        commit = self.commit()
        with patch.object(website, 'gh', side_effect=[{'commit': {'sha': commit}}, {'workflow_runs': []}]):
            with self.assertRaisesRegex(ValueError, 'Main-branch CI'):
                website.website_gate(self.repo, commit, self.release)
        self.git('checkout', '--detach', self.release)
        with patch.object(website, 'gh', side_effect=self.ci_answers(self.release)):
            with self.assertRaisesRegex(ValueError, 'descend from'):
                website.website_gate(self.repo, self.release, commit)

    def test_package_runtime_changes_cannot_use_website_only_path(self):
        original = json.loads((self.repo / 'package.json').read_text())
        for key, value in [('version', '1.8.5'), ('main', 'other.js'), ('dependencies', {'x': '1'}),
                           ('exports', './other.js'), ('sideEffects', False)]:
            self.write('package.json', json.dumps({**original, key: value}).encode())
            commit = self.commit()
            with self.subTest(key=key), self.assertRaisesRegex(ValueError, 'runtime metadata'):
                website.require_unchanged_runtime(self.repo, self.release, commit)

    def test_framework_files_cannot_change_be_removed_or_be_added(self):
        for name in ('scss/farvist.scss', 'dist/farvist.min.css', 'assets/farvist.js',
                     'assets/icons/farvist-icons.svg', 'bin/farvist.mjs', 'assets/new-runtime.js'):
            self.git('checkout', '--detach', self.release)
            self.write(name, b'changed runtime')
            commit = self.commit()
            with self.subTest(name=name), self.assertRaisesRegex(ValueError, 'framework source'):
                website.require_unchanged_runtime(self.repo, self.release, commit)
        self.git('checkout', '--detach', self.release)
        (self.repo / 'assets/farvist.js').unlink()
        commit = self.commit()
        with self.assertRaisesRegex(ValueError, 'framework source'):
            website.require_unchanged_runtime(self.repo, self.release, commit)


if __name__ == '__main__':
    unittest.main()
