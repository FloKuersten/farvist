# Releasing Farvist

Farvist is already published as [`farvist` on npm](https://www.npmjs.com/package/farvist) and maintained in the public [`FloKuersten/farvist` repository](https://github.com/FloKuersten/farvist). The website is [farvist.com](https://farvist.com). Run the commands below in a repository checkout using PowerShell; they are a checklist for a new release, not an initial repository setup.

## 1. Check the current release

```powershell
git status --short
npm view farvist version dist-tags --json
gh release list --repo FloKuersten/farvist --limit 5
```

Use a new version for each npm release. An already published name and version cannot be overwritten, including a README-only update. Check the diff and keep local infrastructure files and unrelated work out of the release.

Update `CHANGELOG.md` for the new release, then bump the appropriate version without creating a commit or tag yet:

```powershell
npm version patch --no-git-tag-version
```

Use `minor` or `major` when appropriate. This updates `package.json` and `package-lock.json`. Update exact-version install examples to the intended release and keep the CSS and JavaScript examples on the same version.

## 2. Build and validate

Use Node.js 24 to match `.github/workflows/ci.yml`.

```powershell
npm ci
npm run build:all
npm run lint
npm run check:size
npm run check:theming
npm run check:skins
npm run check:sass-api
npm run check:privacy
npm run check:ai-contrast
npm run check:text-contrast
npm run check:nested-glass
npm run check:forced-colors
npm run check:cdn-pins
npm run check:validator
npm run check:prompt-grow
npm run check:safety
npm run check:release
```

For the accessibility scan, run `npx serve -l 4000 .` in one terminal and `npx pa11y-ci` in another. Also check the changed pages in a browser at desktop and mobile widths, including light and dark themes and any changed interactions.

`build:all` produces the CSS builds, AI compatibility CSS, catalog and agent reference files. Review and commit the generated changes with their sources. Do not edit generated files by hand. Repeating the build should leave those outputs unchanged.

## 3. Inspect the npm package

```powershell
npm pack --dry-run --ignore-scripts
git diff --check
git diff --stat
git status --short
```

The `files` list in `package.json` controls the package contents. It includes `scss/`, `dist/`, selected `assets/`, the validator CLI in `bin/`, agent skills and rules, and the text/JSON reference files. npm also includes the package metadata, README and MIT license. The website's HTML pages and templates are served from the website and repository, not included as templates in the npm package.

Check that all documented CSS and JavaScript entry points are present, while source maps, `assets/notify.js`, local infrastructure and credentials are absent. `--ignore-scripts` is intentional here: inspect the artifacts that were already built and tested in the previous step.

## 4. Commit, tag and publish

Stage the reviewed release files explicitly, create a release commit, and push the release branch through the repository's normal review process. Commit messages should include an emoji, for example `📦 Release Farvist vX.Y.Z`. Require the [CI workflow](https://github.com/FloKuersten/farvist/actions/workflows/ci.yml) to pass on the commit being released; it also checks that committed build outputs are fresh.

The [publish workflow](.github/workflows/publish.yml) runs when a GitHub release is published: it requires a version tag matching `package.json`, a successful main-branch run of `ci.yml` on the tagged commit, and fresh committed build outputs. It uses Node 24 and npm 11.19.0, disables dependency caching for the release, then packs the verified files and publishes the tarball through npm trusted publishing (OIDC). No long-lived npm token is needed. A manual retry must also target the version tag; branch dispatches are rejected.

After publication, the workflow waits for registry propagation and verifies the downloaded tarball against its pre-publish SHA-512 integrity. It checks that the SLSA provenance names the correct package, repository, workflow, tag and commit, then installs the registry package in a fresh consumer and runs `npm audit signatures` to validate the registry and provenance signatures. An already-published version skips only the upload: its bytes and provenance still have to pass verification. A locally published version without provenance cannot satisfy this gate.

Prepare `release-notes.md` from the reviewed changelog entry, then tag the verified commit and create the release:

```powershell
$releaseVersion = node -p "require('./package.json').version"
git tag "v$releaseVersion"
git push origin "v$releaseVersion"
gh release create "v$releaseVersion" --repo FloKuersten/farvist --verify-tag --title "Farvist v$releaseVersion" --notes-file release-notes.md
gh run watch --repo FloKuersten/farvist
```

Describe the release's actual behavior and validation in the notes. Update the GitHub About description if the product description or component count changed.

### One-time setup: trusted publishing on npm

Inspect existing trust first, using a current npm CLI with Node 24 and the maintainer's npm login. npm requires account 2FA for trust administration:

```powershell
npx --yes --package=npm@12.2.0 npm trust list farvist
npx --yes --package=npm@12.2.0 npm trust github farvist --file=publish.yml --repository=FloKuersten/farvist --allow-publish
```

Create the relationship only if the intended one is absent; inspect any existing configuration before replacing it. The equivalent npm website settings are owner `FloKuersten`, repository `farvist`, workflow filename `publish.yml`, no environment, and **allow direct publishing with `npm publish`**. Stage-only permission cannot run this automatic release workflow. Keep the repository and workflow spelling exact.

A new trusted publisher must complete its first successful publication within two days or npm expires it. Publish a new, validated version through GitHub Actions to activate the relationship and confirm provenance; rerunning an already-published version does not exercise authentication or activate the trust. Never overwrite or unpublish an existing release for this test.

Missing or mismatched trust can return `E404` or `ENEEDAUTH`. A provenance statement appearing in a Sigstore log does not prove npm accepted the package: require the registry and signature checks above. Version 1.8.3 hit this failure because no trusted publisher was configured, then used the documented local fallback.

After the first automated release succeeds, the npm package setting "Require two-factor authentication and disallow tokens" can prevent traditional token-based publishing while retaining OIDC publishing. See the current [npm trusted publishing documentation](https://docs.npmjs.com/trusted-publishers/) and [npm trust command](https://docs.npmjs.com/cli/v12/commands/npm-trust/).

### Fallback: publish locally

Only if the workflow is unavailable: pack the verified commit using `npm pack --ignore-scripts`, inspect the tarball, then publish that exact file with npm 2FA using `npm publish "farvist-$releaseVersion.tgz" --access public`. Confirm `npm view "farvist@$releaseVersion" version dist.integrity --json`. A locally published version carries no build provenance, and the automated provenance gate will fail for that version even though it is installable. Document that limitation in the release notes. Publishing a directory instead runs `prepublishOnly`, which rebuilds files but does not run the other quality gates.

## 5. Verify npm, CDN and website separately

- Confirm the npm `latest` tag points to the intended stable release.
- Confirm provenance: `https://registry.npmjs.org/-/npm/v1/attestations/farvist@X.Y.Z` answers 200 and the npm package page shows the Provenance badge.
- Verify signatures from a fresh registry install with `npm audit signatures` and check the attestation's workflow/tag/commit against the released source.
- Load the exact-version CSS and JavaScript URLs used by the install examples from jsDelivr, and confirm the installed CLI reports the expected version with `npx --yes farvist@X.Y.Z --version`.
- Install the published package into a temporary consumer project and verify the documented imports and Sass customization example.
- Deploy the website using the existing infrastructure, then check the live homepage, docs and changed templates. A Git push or npm publication does not deploy the website.

The GitHub publish workflow releases the npm package only. `npm run deploy` refers to the maintainer's local `deploy.ps1` for website deployment, which is intentionally git-ignored. A fresh clone needs that existing deployment setup before the command can work; keep it and its private infrastructure details out of the public repository.
