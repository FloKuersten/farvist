# Static website deployment boundary

Farvist's production website is served as static files by nginx. It does not
require PHP, PHP-FPM, mod_php, or a backend request handler. The PHP2Shell issues
CVE-2026-109618 and CVE-2026-109619 affect PHP runtimes; a static-file deny rule
is not a substitute for updating PHP if PHP is introduced later. See the
[PHP security advisory](https://www.php.net/archive/2026.php).

The deployment builder and the root-owned receiver both validate every archive
member and manifest entry with `scripts/deploy/website.py`. Files must have an
explicitly supported static extension. Server source, private keys, database
files, source maps, backups, and hidden files are rejected, including mixed-case
extensions and names such as `contact.php.txt` or `contact.php/index.html`.

Install `scripts/deploy/nginx-static-guard.conf` as the root-owned, mode `0644`
file `/etc/nginx/snippets/farvist-static-guard.conf`. Include it inside every
nginx server block serving the site, including any legacy/default document root:

```nginx
include /etc/nginx/snippets/farvist-static-guard.conf;
```

Validate with `nginx -t` before reloading. The snippet uses return-only guards
before location handling, so HTML regex locations and the ACME prefix cannot
bypass the restrictions. Normal `/.well-known/security.txt` and extensionless
ACME challenge tokens remain available. Certificate challenges use their own
root outside the website release directories.

The receiver must also be updated when its validation policy changes. Keep it
root-owned and non-writable by the deployment account. Run
`python3 scripts/deploy/check_website.py`, validate the current release against
the candidate receiver, back up both receiver and nginx configuration, and
verify origin/public HTTPS and release hashes after installation. Never deploy
the working directory recursively: use the release-gated GitHub Actions
workflow, which reads only tracked files from the verified release commit.

On 2026-10-23, the receiver and nginx policy were installed and validated on the
production origin. Nine Linux deployment tests passed. An isolated nginx
instance denied 19 existing harmless sensitive-file fixtures while serving
four legitimate fixtures, including an ACME challenge. No production secrets
or executable payloads were used for these checks.
