# `code-npm-publish-release-and-snapshot`

[`code-npm_node-publish-release-and-snapshot.yml`](../code-npm_node-publish-release-and-snapshot.yml) is the same workflow (name, filename, job shape, triggers) as weave.js's workflow of the same name, adapted to pdocs' pnpm/nx/just toolchain and to pdocs being a site generator (it also ships a `ui-bundle` release artifact) rather than a plain npm-package monorepo.

## Triggers

- An `issue_comment` with `/publish-snapshot` on an open pull request (`publish-snapshot` job).
- Any `closed` pull request to `main`/`main-*` on the `code/**` or `.github/workflows/code**` paths, if labeled `release-type/*` and not `skip-release` (`release` job).
- A manual dispatch (`workflow_dispatch`) invoked from the GitHub UI, taking a `BASELINE` branch and a `RELEASE_TYPE` (`release` job).

## Where does it run?

`ubuntu-24.04` GitHub infrastructure.

## Versions used

`asdf` and whatever `nodejs`/`pnpm` versions are pinned in `code/.tool-versions`. npm is conditionally upgraded to `>=11.5.1` when the bundled version does not support OIDC Trusted Publishers.

> **Note:** `code/.tool-versions` uses `nodejs` (not `node` — the latter isn't a registered asdf-plugins short name and fails to resolve) and `pnpm`, same names weave.js's `.tool-versions` uses. pdocs' `code-npm_node-pr-verify.yml` uses the identical asdf setup pattern as this workflow.

## Authentication

Uses **npm Trusted Publishers (OIDC)** instead of long-lived `NPM_TOKEN` secrets, same as weave.js. GitHub Actions generates short-lived OIDC tokens via the `id-token: write` permission at job level. `NPM_TOKEN` is kept as a fallback for the one case OIDC cannot cover: a package's first-ever publish, before npm has anything to attach OIDC trust to.

## How does it work?

Permissions are scoped at the job level following the principle of least privilege. Both jobs restore/install the pinned toolchain via asdf, then use `pnpm` (not plain `npm`) to install and build.

## Divergences from weave.js's workflow of the same name

- **Version bump**: weave.js calls package.json scripts `version:release` / `release:prepare` / `version:development`. pdocs has no such scripts — `just bump <version>` (a thin wrapper over `pnpm version`, propagated to every workspace package) replaces them. There is no `version:development` step: pdocs' release does not bump to a post-release snapshot version, so the repository is left at the just-released version rather than the next `-SNAPSHOT`.
- **Publish**: weave.js calls one aggregate script (`publish:snapshot` / `release:perform`) across nx targets. pdocs has no such targets, so this loops `npm publish` directly over its five publishable packages (`ui-bundle`, `cli`, `antora-extensions`, `asciidoc-extensions`, `publish-gh-pages` — `example` is `private: true` and excluded, same set `just release-local` publishes to a local Verdaccio registry).
- **No gitflow sync-to-develop PR**: pdocs is trunk-based (main + PRs only), so weave.js's "create a sync PR into develop" step and its failure-comment step are dropped entirely.
- **ui-bundle release artifact**: pdocs additionally locates `packages/ui-bundle/build/ui-bundle-<version>.zip` and attaches it to the GitHub Release — weave.js has no equivalent since it ships npm packages only, not a site-building tool with a distributable UI bundle.
- **Tag scheme**: uses `tag-prefix: ""` (bare `X.Y.Z` tags), matching weave.js exactly.

## Jobs

- ### `publish-snapshot`

  Triggered by a `/publish-snapshot` comment on a pull request. Publishes a pre-release snapshot version tagged as `next`.

  - Validate the commenter has admin permissions.
  - Get the release labels from the PR.
  - Checkout the PR branch.
  - Setup pnpm store and asdf caches; configure asdf environment from `code/.tool-versions`.
  - Ensure minimum npm version (`>=11.5.1`) for OIDC support, upgrading only if needed.
  - Configure npmrc registry (no auth token — OIDC handles authentication).
  - Install dependencies (`pnpm install --frozen-lockfile`).
  - Determine the release type from labels.
  - Update CHANGELOG.md and calculate next version using `release-flow/keep-a-changelog-action`.
  - Define the snapshot version (`<version>-SNAPSHOT.<run_number>.<run_attempt>`).
  - Bump every package to the snapshot version with `just bump`.
  - Verify each of the five packages exists in the npm registry (decides OIDC vs `NPM_TOKEN`).
  - Build (`pnpm build`).
  - Publish the snapshot (`npm publish --tag next`, looped per package).
  - Comment on the PR with the result (success with version info, or failure).

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
  - Bump every package to the released version with `just bump`.
  - Build (`pnpm build`) and locate the `ui-bundle` release artifact.
  - Verify each of the five packages exists in the npm registry (decides OIDC vs `NPM_TOKEN`).
  - Publish the release (`npm publish`, looped per package, unconditional — no publish gate).
  - Commit and GPG-sign `package.json`, `packages/*/package.json` and `CHANGELOG.md`; create an annotated, signed git tag; push both atomically.
  - Publish the GitHub Release with the `ui-bundle` zip attached.
  - Comment on the PR if the GitHub Release creation failed.
