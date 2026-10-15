// Confirm the public registry serves the packed bytes with provenance for this
// exact GitHub workflow/tag/commit. npm audit signatures separately verifies
// the registry signature and Sigstore cryptographic evidence.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout } from 'node:timers/promises';

export const predicateType = 'https://slsa.dev/provenance/v1';
const registry = 'https://registry.npmjs.org';

export function versionFromTag(ref) {
  assert.match(ref || '', /^refs\/tags\/v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/,
    'Expected a stable version tag');
  return ref.slice('refs/tags/v'.length);
}

export function verifyProvenance(attestations, expected) {
  const attestation = attestations.attestations?.find((entry) => entry.predicateType === predicateType);
  assert.ok(attestation?.bundle?.dsseEnvelope?.payload, 'Missing SLSA build provenance');
  const statement = JSON.parse(Buffer.from(attestation.bundle.dsseEnvelope.payload, 'base64').toString('utf8'));
  assert.equal(statement.predicateType, predicateType);
  const digest = Buffer.from(expected.integrity.slice('sha512-'.length), 'base64').toString('hex');
  assert.ok(statement.subject?.some((subject) =>
    subject.name === `pkg:npm/${expected.name}@${expected.version}` && subject.digest?.sha512 === digest),
  'Provenance does not describe the verified tarball');
  const definition = statement.predicate?.buildDefinition;
  assert.deepEqual(definition?.externalParameters?.workflow, {
    ref: expected.ref,
    repository: `https://github.com/${expected.repository}`,
    path: '.github/workflows/publish.yml',
  }, 'Provenance workflow, repository or tag does not match');
  assert.ok(definition.resolvedDependencies?.some((dependency) =>
    dependency.uri === `git+https://github.com/${expected.repository}@${expected.ref}` &&
    dependency.digest?.gitCommit === expected.commit), 'Provenance commit does not match');
  return statement;
}

class PendingPublication extends Error {}

export async function verifyRelease(expected, { request = fetch, pause = setTimeout, attempts = 20 } = {}) {
  assert.equal(expected.name, 'farvist');
  assert.equal(expected.version, versionFromTag(expected.ref));
  async function get(url) {
    const response = await request(url, { redirect: 'error', signal: AbortSignal.timeout(30000), headers: { 'Cache-Control': 'no-cache' } });
    if (response.status === 404 || response.status >= 500) {
      throw new PendingPublication(`${url}: HTTP ${response.status}`);
    }
    assert.equal(response.status, 200, `${url}: HTTP ${response.status}`);
    return response;
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const metadata = await (await get(`${registry}/${expected.name}/${expected.version}`)).json();
      assert.equal(metadata.version, expected.version);
      assert.equal(metadata.dist?.integrity, expected.integrity, 'Registry integrity differs from the packed release');
      const tarballUrl = `${registry}/farvist/-/farvist-${expected.version}.tgz`;
      assert.equal(metadata.dist.tarball, tarballUrl, 'Unexpected tarball URL');
      const tarball = Buffer.from(await (await get(tarballUrl)).arrayBuffer());
      assert.equal(`sha512-${createHash('sha512').update(tarball).digest('base64')}`, expected.integrity,
        'Downloaded registry tarball differs from the packed release');
      const attestations = await (await get(`${registry}/-/npm/v1/attestations/${expected.name}@${expected.version}`)).json();
      const statement = verifyProvenance(attestations, expected);
      return { package: `${expected.name}@${expected.version}`, integrity: expected.integrity,
        commit: expected.commit, workflow: statement.predicate.buildDefinition.externalParameters.workflow };
    } catch (error) {
      if (!(error instanceof PendingPublication) || attempt === attempts) throw error;
      console.log(`Waiting for npm publication (${attempt}/${attempts}): ${error.message}`);
      await pause(15000);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const published = process.argv[2] === '--published';
  const ref = published ? process.argv[3] : process.env.GITHUB_REF;
  const version = versionFromTag(ref);
  const [packed] = published
    ? [{ name: 'farvist', version, integrity: (await (await fetch(`${registry}/farvist/${version}`,
      { redirect: 'error', signal: AbortSignal.timeout(30000) })).json()).dist?.integrity }]
    : JSON.parse(readFileSync(process.argv[2] || 'npm-pack.json', 'utf8'));
  // Only the public, validated GitHub tag determines outbound request paths.
  // Local pack metadata supplies the comparison digest, never request data.
  const expected = { name: 'farvist', version, integrity: packed.integrity,
    repository: process.env.GITHUB_REPOSITORY, ref, commit: published ? process.argv[4] : process.env.GITHUB_SHA };
  assert.equal(packed.name, expected.name);
  assert.equal(packed.version, expected.version);
  assert.equal(expected.repository, 'FloKuersten/farvist');
  assert.equal(expected.ref, `refs/tags/v${expected.version}`);
  assert.match(expected.commit || '', /^[a-f\d]{40}$/);
  assert.match(expected.integrity, /^sha512-[A-Za-z\d+/]+={0,2}$/);
  console.log(JSON.stringify(await verifyRelease(expected), null, 2));
}
