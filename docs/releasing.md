# Releasing

## Dev prereleases

Every push to `dev` runs `.github/workflows/publish-dev.yml`. It also runs on
manual dispatch. The workflow has two jobs:

1. **Verify and pack** runs the full CI check list (format, lint, typecheck,
   workspace build, tests, coverage ledger, retired-name check, production
   audit). If every check passes, `scripts/dev-release.mjs pack` rewrites the
   package versions, packs each public package, and verifies each tarball:
   the version, exact internal dependency ranges, a `dist/` directory, and
   every `exports` target. For `@polymorfa/sdk` it also checks the `./node`,
   `./calls` and `./calls/internal` entry points.
2. **Publish** runs in the `npm-dev` environment. It publishes those exact
   tarballs to npm with `--tag dev --provenance`, in dependency order. It does
   not run repository scripts. A package version that already exists (for
   example on a rerun) is skipped.

The `latest` dist-tag is never changed.

### Packages

Published, in order: `@polymorfa/sdk`, `@polymorfa/browser`, `@polymorfa/ui`,
`@polymorfa/elements`, `@polymorfa/react`, `@polymorfa/store`,
`@polymorfa/nextjs`, `@polymorfa/devtools`. The order is computed from
internal dependencies, so a new public workspace is picked up automatically.
Workspaces marked `"private": true` (such as `@polymorfa/calls`, which ships
inside `@polymorfa/sdk/calls`) are never published. A public package that
depends on a private workspace fails the run.

All packages are published on every run with the same version, even when a
package did not change. This keeps one version number for a matching set.

### Version scheme

```
<base>-dev.<UTC timestamp YYYYMMDDHHmmss>
0.1.0-dev.20260919094454
```

`<base>` is the `x.y.z` part of `packages/typescript/package.json`. The
prerelease has one numeric identifier, and semver compares numeric
identifiers as numbers, so a later run always sorts higher. That holds across
workflow reruns, renames and manual dispatches, which is why the scheme does
not use `github.run_number`. Internal dependencies and peer dependencies are
pinned to the exact same version, so installing one dev package never mixes
builds.

The `package.json` files in the repository keep `0.1.0-dev.0`. The rewrite
exists only inside the CI checkout.

### Installing

```bash
npm install @polymorfa/sdk@dev                       # newest dev build
npm install @polymorfa/sdk@0.1.0-dev.20260919094454   # a specific build
npm view @polymorfa/sdk dist-tags                    # see what `dev` points to
```

Pin an exact version in anything that needs reproducible installs. A range
such as `^0.1.0-dev.0` also matches later `0.1.0-dev.*` builds.

### Local dry run

```bash
npm ci
npm run build:workspaces
node scripts/dev-release.mjs pack \
  --version "$(node scripts/dev-release.mjs version)" --out ../packs
git checkout -- packages/*/package.json   # the pack step edits them in place
```

## One-time operator setup

These steps require npm organization owner and GitHub repository admin
rights. The workflow fails at the publish step until they are done.

1. **npm scope.** Create or claim the `polymorfa` organization on npmjs.com
   so `@polymorfa/*` packages can be published. Require 2FA for members.
2. **First publish.** npm only allows a Trusted Publisher to be configured on
   a package that already exists. For each package listed above, either
   publish once with a token (step 4, then remove it), or create the package
   manually from an owner account.
3. **Trusted Publisher (preferred).** For each package, open _Settings →
   Trusted publishing_ on npmjs.com and add a GitHub Actions publisher:
   - Organization or user: `polymorfa`
   - Repository: `sdks`
   - Workflow filename: `publish-dev.yml`
   - Environment: `npm-dev`

   Then set _Publishing access_ to require 2FA and disallow tokens. No
   repository secret is needed; npm 11.5.1 or later exchanges the job's OIDC
   token and records provenance.

4. **Token fallback.** Use this only while trusted publishing is not
   configured. Create a granular npm access token with read and write access
   to the `@polymorfa` packages and a short expiry. Store it as the
   `NPM_TOKEN` secret on the `npm-dev` environment, not as a repository
   secret. Delete it once trusted publishing works.
5. **GitHub environment.** In the repository settings, create an environment
   named `npm-dev`. Restrict deployment branches to `dev`. Add required
   reviewers if a human should approve each publish.

After the first successful run, confirm with `npm view @polymorfa/sdk
dist-tags` that `dev` points to the new version and `latest` is unchanged.
