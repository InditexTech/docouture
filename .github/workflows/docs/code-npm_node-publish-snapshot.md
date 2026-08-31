# `code-npm-publish-snapshot`

[`code-npm_node-publish-snapshot.yml`](../code-npm_node-publish-snapshot.yml) builds and publishes an npm pre-release snapshot in response to an admin's `/publish-snapshot` comment on a pull request. Its `build-snapshot`/`publish-snapshot` jobs used to live in [`code-npm_node-publish-release-and-snapshot.yml`](../code-npm_node-publish-release-and-snapshot.yml) (which still has the same job shape as weave.js's workflow of the same name); they were split out into this single-trigger file to resolve four open CodeQL `actions/cache-poisoning/poisonable-step` alerts (#180).

## Why a separate file?

`build-snapshot` deliberately checks out untrusted, author-controlled PR code (pinned to a resolved HEAD SHA) to build a `/publish-snapshot` comment preview. It already has real mitigations, documented inline: an admin-permission gate, a SHA-pinned checkout (not the mutable `refs/pull/<n>/head`), `actions/cache/restore` instead of full `actions/cache` (so this job never writes a cache back), and a hard split from `publish-snapshot` (the job that actually holds `NPM_TOKEN`/the OIDC token).

CodeQL's cache-poisoning query still flagged every step that runs after the cache restore as "poisonable" while these jobs lived alongside `code-npm_node-publish-release-and-snapshot.yml`'s `release` job — it reasons about triggers declared at the *workflow* level, not job-level `if:` conditions, so that file's `workflow_dispatch` trigger got attributed to `build-snapshot`/`publish-snapshot` too, even though they're gated `if: github.event_name == 'issue_comment'` and can never run under `workflow_dispatch`. Isolating them in a file with only `issue_comment` as a trigger lets CodeQL see the one, already-low-privilege trigger these jobs actually have.

## Triggers

- An `issue_comment` with `/publish-snapshot` on an open pull request (both jobs).

## Where does it run?

`ubuntu-24.04` GitHub infrastructure.

## Versions used

`asdf` and whatever `nodejs`/`pnpm` versions are pinned in `code/.tool-versions`. npm is conditionally upgraded to `>=11.5.1` when the bundled version does not support OIDC Trusted Publishers.

> **Note:** `code/.tool-versions` uses `nodejs` (not `node` — the latter isn't a registered asdf-plugins short name and fails to resolve) and `pnpm`, same names weave.js's `.tool-versions` uses. docouture' `code-npm_node-pr-verify.yml` and `code-npm_node-publish-release-and-snapshot.yml` use the identical asdf setup pattern.

## Authentication

Uses **npm Trusted Publishers (OIDC)** instead of long-lived `NPM_TOKEN` secrets. GitHub Actions generates short-lived OIDC tokens via the `id-token: write` permission at job level. `NPM_TOKEN` is kept as a fallback for the one case OIDC cannot cover: a package's first-ever publish, before npm has anything to attach OIDC trust to.

## How does it work?

Permissions are scoped at the job level following the principle of least privilege. Both jobs restore/install the pinned toolchain via asdf, then use `pnpm` (not plain `npm`) to install and build.

- **Snapshot publish is split into two jobs**: `build-snapshot` checks out the PR branch (only after an admin's `/publish-snapshot` comment, and pinned to the PR's HEAD SHA at approval time) and packs `pnpm pack` tarballs, but never sees `NPM_TOKEN` or the OIDC id-token; `publish-snapshot` holds those credentials but only downloads the tarballs the first job produced and never checks out the PR branch itself. This closes off running an author-controlled `package.json`/lifecycle script in a job that can reach the npm registry — a workflow triggered by a PR comment is inherently building untrusted code, and admin approval narrows *who* can trigger it but doesn't make *what* gets built trustworthy.
- **`build-snapshot`'s caches are read-only**: it restores the pnpm store and asdf caches but never saves them back (`actions/cache/restore`, not `actions/cache`, and no paired save step). This job's `issue_comment` trigger gets write access to the default branch's cache scope even though it's building a PR branch, so letting it save would let a malicious PR poison a cache entry later restored by `release` or `pr-verify`.

## Jobs

- ### `build-snapshot`

  Triggered by a `/publish-snapshot` comment on a pull request. Builds the PR's code and packs (but does not publish) a pre-release snapshot version. Holds no publish credentials.

  - Validate the commenter has admin permissions.
  - Get the release labels from the PR.
  - Resolve and checkout the PR's HEAD SHA (pinned at approval time).
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
  - Comment on the PR with the result (success with version info, or failure).
