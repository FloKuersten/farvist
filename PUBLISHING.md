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

The [publish workflow](.github/workflows/publish.yml) runs when a GitHub release is published: it requires a version tag matching `package.json`, a successful main-branch run of `ci.yml` on the tagged commit, and fresh committed build outputs. It then packs those verified files and publishes the tarball through npm trusted publishing (OIDC), with provenance tying it to this repository, workflow and commit. The workflow does not require a long-lived npm token. A manual retry must also target the version tag; branch dispatches are rejected.

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

On npmjs.com open the `farvist` package → Settings → Trusted publishing → add a GitHub Actions publisher with owner `FloKuersten`, repository `farvist`, workflow filename `publish.yml` and no environment. Then, under Publishing access, choose "Require two-factor authentication and disallow tokens", so a leaked or phished token can no longer publish. Until the trusted publisher exists the workflow stops at the publish step with `ENEEDAUTH` and nothing is published.

### Fallback: publish locally

Only if the workflow is unavailable: from the verified commit, with npm 2FA, run `npm publish`, then confirm `npm view "farvist@$releaseVersion" version dist.integrity --json`. A locally published version carries no provenance. Creating the GitHub release afterwards is still safe: the workflow sees the version is already on npm and skips. `prepublishOnly` runs `build:all`; it does not run the other quality gates.

## 5. Verify npm, CDN and website separately

- Confirm the npm `latest` tag points to the intended stable release.
- Confirm provenance: `https://registry.npmjs.org/-/npm/v1/attestations/farvist@X.Y.Z` answers 200 and the npm package page shows the Provenance badge.
- Load the exact-version CSS and JavaScript URLs used by the install examples from jsDelivr, and confirm the installed CLI reports the expected version with `npx --yes farvist@X.Y.Z --version`.
- Install the published package into a temporary consumer project and verify the documented imports and Sass customization example.
- Deploy the website using the existing infrastructure, then check the live homepage, docs and changed templates. A Git push or npm publication does not deploy the website.

The GitHub publish workflow releases the npm package only. `npm run deploy` refers to the maintainer's local `deploy.ps1` for website deployment, which is intentionally git-ignored. A fresh clone needs that existing deployment setup before the command can work; keep it and its private infrastructure details out of the public repository.
