# `code-npm-publish-release-and-snapshot`

[`code-npm_node-publish-release-and-snapshot.yml`](../code-npm_node-publish-release-and-snapshot.yml) is the same workflow (name, filename, job shape, triggers) as weave.js's workflow of the same name, adapted to docouture' pnpm/nx/just toolchain and to docouture being a site generator (it also ships a `ui-bundle` release artifact) rather than a plain npm-package monorepo.

## Triggers

- A manual dispatch (`workflow_dispatch`) with `ACTION=snapshot`, built from the `BASELINE` branch (`build-snapshot` + `publish-snapshot` jobs; "Use workflow from" only selects the workflow file). npm rejects trusted publishing tokens from `issue_comment` events, so the former `/publish-snapshot` comment trigger was removed.
- Any `closed` pull request to `main`/`main-*` on the `code/**` or `.github/workflows/code**` paths, if labeled `release-type/*` and not `skip-release` (`release` job).
- A manual dispatch (`workflow_dispatch`) with `ACTION=release` (the default), taking a `BASELINE` branch and a `RELEASE_TYPE` (`release` job).

## Where does it run?

`ubuntu-24.04` GitHub infrastructure.

## Versions used

`asdf` and whatever `nodejs`/`pnpm` versions are pinned in `code/.tool-versions`. npm is conditionally upgraded to `>=11.5.1` when the bundled version does not support OIDC Trusted Publishers.

> **Note:** `code/.tool-versions` uses `nodejs` (not `node` — the latter isn't a registered asdf-plugins short name and fails to resolve) and `pnpm`, same names weave.js's `.tool-versions` uses. docouture' `code-npm_node-pr-verify.yml` uses the identical asdf setup pattern as this workflow.

## Authentication

Uses **npm Trusted Publishers (OIDC)** instead of long-lived `NPM_TOKEN` secrets, same as weave.js. GitHub Actions generates short-lived OIDC tokens via the `id-token: write` permission at job level. `NPM_TOKEN` is kept as a fallback for the one case OIDC cannot cover: a package's first-ever publish, before npm has anything to attach OIDC trust to.

## How does it work?

Permissions are scoped at the job level following the principle of least privilege. Both jobs restore/install the pinned toolchain via asdf, then use `pnpm` (not plain `npm`) to install and build.

## Divergences from weave.js's workflow of the same name

- **Version bump**: homologated with weave.js's `npm run version:release` + `npm run release:prepare` step pair — `code/package.json` defines both scripts as just-free wrappers around `pnpm version` (propagated to every workspace package), so CI doesn't need `just` installed on the runner (README, "just and package.json"); `justfile`'s `bump` recipe is the human-facing equivalent for local use. There is no `version:development` step: docouture' release does not bump to a post-release snapshot version, so the repository is left at the just-released version rather than the next `-SNAPSHOT`.
- **Publish**: weave.js calls one aggregate script (`publish:snapshot` / `release:perform`) across nx targets. docouture has no such targets, so this loops `npm publish` directly over its five publishable packages (`ui-bundle`, `cli`, `antora-extensions`, `asciidoc-extensions`, `publish-gh-pages` — `example` is `private: true` and excluded, same set `just release-local` publishes to a local Verdaccio registry).
- **No gitflow sync-to-develop PR**: docouture is trunk-based (main + PRs only), so weave.js's "create a sync PR into develop" step and its failure-comment step are dropped entirely.
- **ui-bundle release artifact**: docouture additionally locates `packages/ui-bundle/build/ui-bundle-<version>.zip` and attaches it to the GitHub Release — weave.js has no equivalent since it ships npm packages only, not a site-building tool with a distributable UI bundle.
- **Tag scheme**: uses `tag-prefix: ""` (bare `X.Y.Z` tags), matching weave.js exactly.
- **Snapshot publish is split into two jobs**, unlike weave.js's single `publish-snapshot` job: `build-snapshot` checks out the `BASELINE` branch (only after an admin-checked manual dispatch) and packs `pnpm pack` tarballs, but never sees `NPM_TOKEN` or the OIDC id-token; `publish-snapshot` holds those credentials but only downloads the tarballs the first job produced and never checks out the branch itself. This closes off running an author-controlled `package.json`/lifecycle script in a job that can reach the npm registry — a snapshot of an author-controlled branch is inherently building untrusted code, and the admin check narrows *who* can trigger it but doesn't make *what* gets built trustworthy.
- **`build-snapshot`'s caches are read-only**: it restores the pnpm store and asdf caches but never saves them back (`actions/cache/restore`, not `actions/cache`, and no paired save step). A dispatch gets write access to the workflow ref's cache scope, so letting it save would let a malicious branch poison a cache entry later restored by `release` or `pr-verify`.

## Jobs

- ### `build-snapshot`

  Triggered by a manual dispatch with `ACTION=snapshot`. Builds the selected branch's code and packs (but does not publish) a pre-release snapshot version. Holds no publish credentials.

  - Validate the actor has admin permissions.
  - Take the release type from the `RELEASE_TYPE` input.
  - Checkout the `BASELINE` branch.
  - Restore (read-only) the pnpm store and asdf caches; configure asdf environment from `code/.tool-versions`.
  - Ensure minimum npm version (`>=11.5.1`) for OIDC support, upgrading only if needed.
  - Configure npmrc registry (no auth token — OIDC handles authentication in the publish job).
  - Install dependencies (`pnpm install --frozen-lockfile`).
  - Determine the release type from labels.
  - Update CHANGELOG.md and calculate next version using `release-flow/keep-a-changelog-action`.
  - Define the snapshot version (`<version>-SNAPSHOT.<run_number>.<run_attempt>`).
  - Bump every package to the snapshot version (`npm run version:release` + `npm run release:prepare`, just-free).
  - Verify each of the five packages exists in the npm registry (decides OIDC vs `NPM_TOKEN` for the publish job).
  - Build (`pnpm build`).
  - Pack each package (`pnpm pack`) into `existing/` or `new/` tarball directories and upload them as a build artifact.

- ### `publish-snapshot`

  Runs after `build-snapshot` succeeds. Downloads its tarballs and publishes them — no checkout of the PR branch happens in this job.

  - Download the `snapshot-tarballs` artifact.
  - Setup Node.js and ensure minimum npm version (`>=11.5.1`) for OIDC support.
  - Configure npmrc registry.
  - Publish the `existing/` tarballs via OIDC trusted publishing (`npm publish --tag next`), or the `new/` tarballs via `NPM_TOKEN` if any packages are being published for the first time.
  - Write a job summary with the result: the snapshot version, tag, baseline branch and auth method on success, or the attempted version on failure.

- ### `release`

  Triggered by a merged pull request or manual workflow dispatch. Publishes a release version, tags it, and creates a GitHub release with the `ui-bundle` artifact attached.

  - Validate the actor has admin permissions.
  - Get the release labels and the baseline branch.
  - Create a GitHub App token for signed commits/pushes.
  - Checkout the baseline branch.
  - Setup pnpm store and asdf caches; configure asdf environment from `code/.tool-versions`.
  - Configure npmrc registry (no auth token — OIDC handles authentication).
  - Install dependencies and run `lint`, `typecheck`, `format:check`, and `test` before releasing.
  - Determine the release type from labels.
  - Prepare committer information and configure GPG signing (gpg-agent with loopback-pinentry and preset-passphrase).
  - Update CHANGELOG.md and calculate next version using `release-flow/keep-a-changelog-action`.
  - Bump every package to the released version (same `npm run version:release` + `npm run release:prepare` pair as the snapshot job).
  - Build (`pnpm build`) and locate the `ui-bundle` release artifact.
  - Verify each of the five packages exists in the npm registry (decides OIDC vs `NPM_TOKEN`).
  - Publish the release (`npm publish`, looped per package, unconditional — no publish gate).
  - Commit and GPG-sign `package.json`, `packages/*/package.json` and `CHANGELOG.md`; create an annotated, signed git tag; push both atomically.
  - Publish the GitHub Release with the `ui-bundle` zip attached.
  - Comment on the PR if the GitHub Release creation failed.
