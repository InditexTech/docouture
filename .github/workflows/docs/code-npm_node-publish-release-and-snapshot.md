# `code-npm-publish-release-and-snapshot`

[`code-npm_node-publish-release-and-snapshot.yml`](../code-npm_node-publish-release-and-snapshot.yml) is the same workflow (name, filename, job shape, triggers) as weave.js's workflow of the same name, adapted to docouture' pnpm/nx/just toolchain and to docouture being a site generator (it also ships a `ui-bundle` release artifact) rather than a plain npm-package monorepo.

> **Note:** the `build-snapshot`/`publish-snapshot` jobs that used to live in this file moved out to their own workflow, [`code-npm_node-publish-snapshot.yml`](../code-npm_node-publish-snapshot.yml) — see [its doc](code-npm_node-publish-snapshot.md) — to resolve four open CodeQL `actions/cache-poisoning/poisonable-step` alerts (#180). CodeQL attributes a workflow's `workflow_dispatch` trigger to every job in the file regardless of job-level `if:` gating, so as long as those jobs shared a file with this one's `workflow_dispatch` trigger, it kept flagging their post-cache-restore steps even though they can only ever run under `issue_comment`.

## Triggers

- Any `closed` pull request to `main`/`main-*` on the `code/**` or `.github/workflows/code**` paths, if labeled `release-type/*` and not `skip-release` (`release` job).
- A manual dispatch (`workflow_dispatch`) invoked from the GitHub UI, taking a `BASELINE` branch and a `RELEASE_TYPE` (`release` job).

## Where does it run?

`ubuntu-24.04` GitHub infrastructure.

## Versions used

`asdf` and whatever `nodejs`/`pnpm` versions are pinned in `code/.tool-versions`. npm is conditionally upgraded to `>=11.5.1` when the bundled version does not support OIDC Trusted Publishers.

> **Note:** `code/.tool-versions` uses `nodejs` (not `node` — the latter isn't a registered asdf-plugins short name and fails to resolve) and `pnpm`, same names weave.js's `.tool-versions` uses. docouture' `code-npm_node-pr-verify.yml` uses the identical asdf setup pattern as this workflow.

## Authentication

Uses **npm Trusted Publishers (OIDC)** instead of long-lived `NPM_TOKEN` secrets, same as weave.js. GitHub Actions generates short-lived OIDC tokens via the `id-token: write` permission at job level. `NPM_TOKEN` is kept as a fallback for the one case OIDC cannot cover: a package's first-ever publish, before npm has anything to attach OIDC trust to.

## How does it work?

Permissions are scoped at the job level following the principle of least privilege. The `release` job restores/installs the pinned toolchain via asdf, then uses `pnpm` (not plain `npm`) to install and build.

## Divergences from weave.js's workflow of the same name

- **Version bump**: homologated with weave.js's `npm run version:release` + `npm run release:prepare` step pair — `code/package.json` defines both scripts as just-free wrappers around `pnpm version` (propagated to every workspace package), so CI doesn't need `just` installed on the runner (README, "just and package.json"); `justfile`'s `bump` recipe is the human-facing equivalent for local use. There is no `version:development` step: docouture' release does not bump to a post-release snapshot version, so the repository is left at the just-released version rather than the next `-SNAPSHOT`.
- **Publish**: weave.js calls one aggregate script (`publish:snapshot` / `release:perform`) across nx targets. docouture has no such targets, so this loops `npm publish` directly over its five publishable packages (`ui-bundle`, `cli`, `antora-extensions`, `asciidoc-extensions`, `publish-gh-pages` — `example` is `private: true` and excluded, same set `just release-local` publishes to a local Verdaccio registry).
- **No gitflow sync-to-develop PR**: docouture is trunk-based (main + PRs only), so weave.js's "create a sync PR into develop" step and its failure-comment step are dropped entirely.
- **ui-bundle release artifact**: docouture additionally locates `packages/ui-bundle/build/ui-bundle-<version>.zip` and attaches it to the GitHub Release — weave.js has no equivalent since it ships npm packages only, not a site-building tool with a distributable UI bundle.
- **Tag scheme**: uses `tag-prefix: ""` (bare `X.Y.Z` tags), matching weave.js exactly.
- **Snapshot publish lives in its own file**: unlike weave.js's single `publish-snapshot` job (which also lives alongside its release job), docouture splits `build-snapshot`/`publish-snapshot` into `code-npm_node-publish-snapshot.yml` — see that file's doc for why.

## Jobs

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
