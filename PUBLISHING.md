# Publishing Farvist — exact commands

Run these from the project root (`C:\Users\Flo\Farvistrap`). `git`, `gh` (logged in as
**FloKuersten**), and `npm` are all installed. The `farvist` name is **available** on npm.

> Heads up: the GitHub repo will be **public** and include the marketing site, examples, docs,
> Pro samples and `LAUNCH-KIT.md`. `deploy.ps1` (your origin IP) is git-ignored. The npm package
> only ships `scss/`, `dist/`, `assets/`, `README`, `LICENSE` (verified via `npm pack --dry-run`).

---

## 1. GitHub — create the repo and push

```powershell
git init -b main
git add .
git commit -m "Farvist v0.5.0 — glassmorphism CSS framework"

# creates github.com/FloKuersten/farvist, sets 'origin', and pushes 'main'
gh repo create farvist --public --source=. --remote=origin --push `
  --description "A lightweight glassmorphism CSS framework — frosted surfaces, neon glow, a free backgrounds library, 30+ components and dark/light themes."

# discoverability
gh repo edit FloKuersten/farvist --homepage "https://farvist.com" `
  --add-topic css --add-topic sass --add-topic css-framework --add-topic glassmorphism `
  --add-topic ui-kit --add-topic design-tokens --add-topic dark-mode `
  --add-topic bootstrap-alternative --add-topic tailwind-alternative
```

## 2. npm — publish

```powershell
npm login            # browser/OTP — authorizes this machine
npm publish          # prepublishOnly rebuilds the CSS, then publishes farvist@0.5.0 (public)
```

The package is unscoped, so it publishes **publicly** by default. After this:
- README badges (npm version, bundlephobia min-zip) resolve.
- CDN goes live: `https://cdn.jsdelivr.net/npm/farvist/dist/farvist.min.css`

## 3. Tag the release on GitHub

```powershell
git tag v0.5.0
git push origin v0.5.0
gh release create v0.5.0 --title "Farvist v0.5.0" --generate-notes
```

## 4. After publishing

- **Google Search Console:** add `farvist.com`, then submit `https://farvist.com/sitemap.xml`.
- Verify the CDN link loads, then update any docs that say "once published".
- Fire the launch posts from [`LAUNCH-KIT.md`](LAUNCH-KIT.md) (record the GIF first).

---

## Releasing future versions

```powershell
# bump version in package.json + add a CHANGELOG entry, then:
npm run build:all
git add . ; git commit -m "Farvist vX.Y.Z"
git tag vX.Y.Z ; git push ; git push --tags
npm publish
gh release create vX.Y.Z --generate-notes
```

(`npm version patch|minor|major` can do the bump + tag + commit in one step if you prefer.)
