import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { predicateType, verifyProvenance, verifyRelease } from './verify-npm-release.mjs';

const bytes = Buffer.from('verified release fixture');
const expected = { name: 'farvist', version: '1.8.4', repository: 'FloKuersten/farvist',
  ref: 'refs/tags/v1.8.4', commit: 'a'.repeat(40),
  integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` };
function proof(change = () => {}) {
  const statement = { predicateType,
    subject: [{ name: 'pkg:npm/farvist@1.8.4', digest: { sha512: createHash('sha512').update(bytes).digest('hex') } }],
    predicate: { buildDefinition: {
      externalParameters: { workflow: { ref: expected.ref, repository: `https://github.com/${expected.repository}`,
        path: '.github/workflows/publish.yml' } },
      resolvedDependencies: [{ uri: `git+https://github.com/${expected.repository}@${expected.ref}`,
        digest: { gitCommit: expected.commit } }],
    } } };
  change(statement);
  return { attestations: [{ predicateType, bundle: { dsseEnvelope: {
    payload: Buffer.from(JSON.stringify(statement)).toString('base64'),
  } } }] };
}
test('accepts provenance for the exact tarball and released source', () => {
  assert.ok(verifyProvenance(proof(), expected));
});
for (const [name, change] of [
  ['tarball', (s) => { s.subject[0].digest.sha512 = '0'.repeat(128); }],
  ['package', (s) => { s.subject[0].name = 'pkg:npm/another@1.8.4'; }],
  ['repository', (s) => { s.predicate.buildDefinition.externalParameters.workflow.repository = 'https://github.com/other/repo'; }],
  ['workflow', (s) => { s.predicate.buildDefinition.externalParameters.workflow.path = '.github/workflows/other.yml'; }],
  ['tag', (s) => { s.predicate.buildDefinition.externalParameters.workflow.ref = 'refs/heads/main'; }],
  ['commit', (s) => { s.predicate.buildDefinition.resolvedDependencies[0].digest.gitCommit = 'b'.repeat(40); }],
]) {
  test(`rejects provenance for a different ${name}`, () => {
    assert.throws(() => verifyProvenance(proof(change), expected));
  });
}
test('rejects missing provenance, including a version published locally', () => {
  assert.throws(() => verifyProvenance({ attestations: [] }, expected), /Missing SLSA/);
});
function response(body, status = 200) { return new Response(body, { status }); }
test('waits for registry propagation then verifies the downloaded bytes', async () => {
  let requests = 0;
  let pauses = 0;
  const request = async () => {
    requests++;
    if (requests === 1) return response('', 404);
    if (requests === 2) return response(JSON.stringify({ version: expected.version,
      dist: { integrity: expected.integrity, tarball: 'https://registry.npmjs.org/farvist/-/farvist-1.8.4.tgz' } }));
    if (requests === 3) return response(bytes);
    return response(JSON.stringify(proof()));
  };
  assert.equal((await verifyRelease(expected, { request, pause: async () => { pauses++; }, attempts: 2 })).commit, expected.commit);
  assert.equal(pauses, 1);
  assert.equal(requests, 4);
});
test('does not accept different published bytes or retry an integrity mismatch', async () => {
  let pauses = 0;
  await assert.rejects(verifyRelease(expected, { request: async () => response(JSON.stringify({
    version: expected.version, dist: { integrity: 'sha512-wrong' },
  })), pause: async () => { pauses++; } }), /integrity differs/);
  assert.equal(pauses, 0);
});
test('rejects corrupt downloaded bytes even when the registry metadata matches', async () => {
  let requests = 0;
  await assert.rejects(verifyRelease(expected, { request: async () => ++requests === 1
    ? response(JSON.stringify({ version: expected.version, dist: { integrity: expected.integrity,
      tarball: 'https://registry.npmjs.org/farvist/-/farvist-1.8.4.tgz' } }))
    : response('corrupt archive') }), /Downloaded registry tarball differs/);
});
test('fails after the bounded propagation window', async () => {
  await assert.rejects(verifyRelease(expected, { request: async () => response('', 404),
    pause: async () => {}, attempts: 2 }), /HTTP 404/);
});
