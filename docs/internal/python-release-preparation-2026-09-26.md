# Python SDK release preparation (2026-09-26)

This is an internal handoff for the local source foundation at `27c53543` on
`codex/python-sdk-foundation-20260926`. It does not authorize publication or
assert that a Python distribution or deployed route is available.

## Distribution identity

The candidate distribution is `polymorfa-sdk`; the import is `polymorfa_sdk`.
The local `pyproject.toml` sets version `0.1.0.dev0` and Python `>=3.11`.
Read-only requests to PyPI's project JSON and Simple endpoints returned HTTP
404 for `polymorfa-sdk` on 2026-09-26. The normalized aliases
`polymorfa_sdk` and `polymorfa.sdk` also returned 404. This shows no public
project entry at the time of the check, not that the name is reserved or
guaranteed to be accepted on upload. PyPI normalizes those three spellings to
the same project name. Recheck immediately before the first upload.

Sources: [name normalization](https://packaging.python.org/en/latest/specifications/name-normalization/),
[PyPI name retention](https://docs.pypi.org/project-management/name-retention/),
and [pending trusted publishers](https://docs.pypi.org/trusted-publishers/creating-a-project-through-oidc/).

## Existing CI and release behavior

The local `.github/workflows/python-ci.yml` runs Ruff, offline unit tests, and
wheel/sdist build on Python 3.11 and 3.12 for Python package or Platform
contract changes. It does not publish. The SDK's existing
`.github/workflows/publish-dev.yml` runs on every `dev` push without a path
filter, verifies and packs all eight public npm workspaces, and publishes each
under npm's `dev` tag with a fresh timestamp version. A merge containing only
Python code would therefore still initiate that npm publication. It does not
move npm `latest`. The current `origin/dev` at
`bd94b733e79f008c4254225f6654c98741907c6c` has no Python CI or PyPI
publishing workflow; the Python CI file exists only in the local foundation.

## Proposed first release, subject to owner choice

1. Owner confirms the distribution/import names and whether `0.1.0.dev0` is
   the intended initial prerelease version. Decide whether a Python source PR
   may merge while PyPI and public documentation remain gated, given the
   monorepo rule that customer-facing SDK changes include Mintlify docs.
   Also decide whether the incidental eight-workspace npm `dev` publication
   from that merge is authorized. Do not silently change release automation.
2. Before a Python publication, repository/PyPI owners configure a dedicated
   trusted publisher for `polymorfa/sdks` with the exact release workflow
   filename and a protected GitHub environment. A pending publisher can create
   a new project on the first upload but does not reserve its name. Keep
   `id-token: write` scoped to the publish job; require explicit release
   approval. Do not store a PyPI token in the repository.
3. The release workflow should build a wheel and sdist from the approved
   source, validate metadata/README and archive contents, install the wheel in
   a clean Python 3.11 environment, run the offline contract tests, and upload
   only the reviewed artifacts. After upload, verify the exact PyPI version,
   files/digests, and install from the registry. Publication needs separate
   authorization; no workflow or trusted publisher is configured by this
   handoff.

Sources: [PyPI trusted publishers](https://docs.pypi.org/trusted-publishers/),
[publisher configuration](https://docs.pypi.org/trusted-publishers/adding-a-publisher/),
[publishing workflow](https://docs.pypi.org/trusted-publishers/using-a-publisher/),
[security model](https://docs.pypi.org/trusted-publishers/security-model/),
[packaging flow](https://packaging.python.org/en/latest/flow/), and
[README validation](https://packaging.python.org/en/latest/guides/making-a-pypi-friendly-readme/).

## Exact public documentation after release evidence

Public Mintlify changes belong in a separate isolated monorepo worktree, not
in this SDK repository. Once the owner has settled release sequencing, the
artifact exists, and customer route availability is verified:

- Add `docs/sdks/python/installation.mdx` with the verified exact
  `pip install polymorfa-sdk==<version>` command, Python 3.11+ requirement,
  server-side team API key with `sessions:read`, and a runnable
  `Client.projects.list()` example. State that this is only project listing;
  document typed project fields, response metadata, safe HTTP/transport/
  protocol errors, no automatic retries or credential-forwarding redirects,
  and no support for project or browser tokens. Link the existing project-list
  API reference. Avoid a broad parity or deployed-availability claim.
- Update `docs/sdks/overview.mdx` to link that page, name the verified version
  and narrow capability, and add the page under `Tools and clients` in
  `docs/docs.json`. Review the affected TypeScript page for cross-language
  wording. The existing API reference for `GET /platform/projects` needs no
  route/shape change from this package.
- Add `docs/changelog.mdx` only when a customer-visible release actually ships,
  dated for that release. Run `scripts/mint-docs.sh broken-links --check-anchors`
  and `scripts/mint-docs.sh validate` from the monorepo root on the docs change.

The public docs guide requires released, verified behavior. A PyPI artifact
alone does not establish that the API route is deployed or accepted in the
intended customer environment; live verification remains an owner gate.

## Five-part assessment

- **API — unaffected:** The Python client reads the pinned Platform OpenAPI
  `GET /platform/projects` contract at API commit
  `9b64c70b622593aeda7364b7603ba6790144594e`; it changes no handler,
  scope, request, or response. Deployment/acceptance is not verified here.
- **SDKs — local source updated, publication blocked:** The Python package is a
  bounded synchronous foundation, not broad parity. TypeScript/npm packages
  are unchanged by its source, though a `dev` merge would publish fresh npm
  prerelease artifacts under the current workflow.
- **CLI — unaffected:** No command, flag, or SDK registry dependency changes;
  CLI does not consume this Python package.
- **Docs — blocked:** The exact Mintlify edits above depend on the distribution
  choice, a verified artifact, and truthful route-availability evidence.
- **Feature release — blocked:** No new feature flag or entitlement is needed
  for a client to call the existing route. Distribution approval, publication,
  deployment evidence, and customer acceptance remain separate release gates.

No PyPI name was registered, no package was published, and no live feature test
was run during this preparation.
