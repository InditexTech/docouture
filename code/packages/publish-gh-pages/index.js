// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

// The GitHub Pages `docouture publish` driver. Called by
// @inditextech/docouture-cli's `publish` command as
// `require('@inditextech/docouture-publish-gh-pages')(dir, options)` — a plain
// function, not an Antora extension. Earlier design hooked Antora's own
// `sitePublished` pipeline event instead (a publish-target `antora.extensions`
// entry); this package is deliberately NOT that anymore; publishing is a CLI
// concern (`docouture publish gh-pages`), decoupled from `antora build` — a site
// can build without publishing, and re-publish an already-built `build/site`
// without rebuilding.
//
// `dir` is the already-built site directory — resolved by the CLI (reading
// `output.dir` out of the site's own antora-playbook.yml, defaulting to
// Antora's own `build/site`), not by this package. This package's only job
// is pushing that directory to a branch.
//
// THREE HARD-LEARNED FIXES BAKED IN HERE, all discovered from the same
// symptom: `docouture-publish.yml` reported success ("GitHub Pages publish
// complete") while the `gh-pages` branch was never actually created/updated.
//
//   1. DEFAULT GIT IDENTITY. `gh-pages`'s own commit step needs a
//      `user.name`/`user.email` somewhere. A fresh GitHub Actions runner has
//      none configured, and nothing here supplied one unless the caller
//      passed `--user-name`/`--user-email` explicitly — so the very first
//      `git commit` inside gh-pages's scratch clone failed with `fatal:
//      empty ident name`. `DEFAULT_USER` below is the standard
//      github-actions[bot] identity (same one other gh-pages-deploy actions
//      use), applied whenever the caller doesn't supply their own.
//
//   2. THE SWALLOWED FAILURE. `gh-pages@6.3.0`'s own `publish()`
//      (lib/index.js) ends its promise chain with
//      `.then(() => done(), (error) => { ...; done(error) })` — the
//      rejection handler never re-throws, so the returned promise RESOLVES
//      even when a step failed (the identity failure above, a rejected
//      push, or its own "no files matched" early-return, which doesn't even
//      return a promise at all). With no callback passed, its internal
//      default (`err => { if (err) log(err.message) }`, gated behind
//      `util.debuglog` and therefore invisible without `NODE_DEBUG=gh-pages`)
//      swallowed the real error entirely. `await ghpages.publish(dir,
//      opts)` therefore never threw, no matter what actually happened.
//      Fixed below by passing our OWN callback and settling a wrapping
//      promise from it, so any failure gh-pages reports through the
//      callback surfaces as a real rejection here.
//
//   3. THE DIRTY-BRANCH RISK ON FIRST PUBLISH. When the target branch
//      doesn't exist on the remote yet, `gh-pages`'s own `Git.clone()`
//      (lib/git.js) does `git clone --branch <branch> --single-branch`,
//      which FAILS (no such branch), and falls back to a full clone of the
//      remote's default branch instead — typically `main`. It then does
//      `git checkout --orphan <branch>`, which detaches history but leaves
//      the working tree exactly as it was — full of `main`'s files. The
//      "Removing files" step gh-pages runs next is supposed to clear all of
//      that out before copying in the new build, but its own
//      `globby.sync(options.remove, { cwd })` call never passes `dot:
//      true` — so any dotfile/dot-directory from `main` (`.github/`,
//      `.gitignore`, ...) survives into the very first `gh-pages` commit.
//      Fixed below by pre-creating the branch as a genuinely empty orphan
//      commit ourselves, whenever it doesn't already exist remotely, BEFORE
//      calling into `gh-pages` at all — its own `--branch --single-branch`
//      clone then succeeds normally and the risky fallback path, and the
//      dotfile-cleanup gap along with it, is never reached.
//
// A fourth, unrelated fix lives in `ghpagesOptions.nojekyll` below: GitHub
// Pages runs Jekyll by default, which excludes any `_`-prefixed directory
// from what it serves — exactly where Antora's default UI bundle output
// lives (`/_/css/...`, `/_/js/...`). Without a `.nojekyll` file at the
// branch root, every one of those assets 404s. `gh-pages` writes that file
// itself when `options.nojekyll` is set; nothing here was ever passing it.

const { execFile } = require('node:child_process')
const { promisify } = require('node:util')
const { mkdtemp, rm } = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const execFileAsync = promisify(execFile)

const DEFAULT_USER = {
  name: 'github-actions[bot]',
  email: '41898282+github-actions[bot]@users.noreply.github.com',
}

function assertSafeGitRemote(value, name = 'remote') {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Invalid ${name}: expected a non-empty string`)
  }
  if (value.startsWith('-')) {
    throw new Error(`Invalid ${name}: must not start with '-'`)
  }
  if (/[\r\n\t ]/.test(value)) {
    throw new Error(`Invalid ${name}: must not contain whitespace or control characters`)
  }
  if (
    /^(?:https?:\/\/|ssh:\/\/|git:\/\/)/.test(value) || // URL forms
    /^[A-Za-z0-9._-]+$/.test(value) || // remote name, e.g. origin
    /^[^@\s]+@[^:\s]+:[^\s]+$/.test(value) // scp-like, e.g. git@github.com:org/repo.git
  ) {
    return
  }
  throw new Error(`Invalid ${name}: unsupported remote format`)
}

/**
 * Real git plumbing used to pre-create an empty orphan branch. Exposed as
 * its own object — rather than inlined — so tests can inject a fake in its
 * place, the same seam-over-mock reasoning as the `ghpages` parameter below
 * (a real `git` binary is not something a unit test should shell out to).
 */
async function assertSafeGitBranch(branch, fieldName = 'branch') {
  if (typeof branch !== 'string' || branch.length === 0) {
    throw new Error(`Invalid ${fieldName}: expected a non-empty string`)
  }
  if (branch.startsWith('-')) {
    throw new Error(`Invalid ${fieldName}: must not start with '-'`)
  }
  // Whitelist guard, checked ahead of (and independently from) the
  // `check-ref-format` shellout below. Static analysis (CodeQL's
  // second-order command injection query) doesn't treat "validated by
  // shelling out to `git check-ref-format`" as a sanitizer — it only
  // recognises inline whitelist checks like this one, the same pattern
  // `assertSafeGitRemote` above already uses for `remote`. Functionally
  // this also closes the actual gap: it rejects any value containing
  // characters (spaces, `=`, control chars, …) that could turn a
  // `--upload-pack=<cmd>`-shaped branch name into an argument `git
  // ls-remote`/`git push` would interpret as a flag rather than a ref.
  if (!/^[A-Za-z0-9._/-]+$/.test(branch)) {
    throw new Error(`Invalid ${fieldName}: unsupported branch name format`)
  }
  try {
    await execFileAsync('git', ['check-ref-format', '--branch', branch])
  } catch (err) {
    throw new Error(`Invalid ${fieldName}: ${branch}`, { cause: err })
  }
}

const defaultGit = {
  /** @returns {Promise<boolean>} Whether `branch` already exists on `remote`. */
  async branchExists(remote, branch) {
    try {
      await execFileAsync('git', ['ls-remote', '--exit-code', remote, branch])
      return true
    } catch (err) {
      if (err && err.code === 2) return false
      throw err
    }
  },

  /** Creates `branch` on `remote` as a single, empty, historyless commit. */
  async createOrphanBranch(remote, branch, user) {
    const dir = await mkdtemp(path.join(os.tmpdir(), 'docouture-gh-pages-'))
    try {
      await execFileAsync('git', ['init', '--quiet', dir])
      await execFileAsync('git', ['checkout', '--quiet', '--orphan', branch], { cwd: dir })
      await execFileAsync('git', ['config', 'user.email', user.email], { cwd: dir })
      await execFileAsync('git', ['config', 'user.name', user.name], { cwd: dir })
      await execFileAsync('git', ['commit', '--quiet', '--allow-empty', '-m', 'Initial gh-pages branch'], {
        cwd: dir,
      })
      await execFileAsync('git', ['push', '--quiet', remote, `HEAD:refs/heads/${branch}`], { cwd: dir })
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  },
}

/**
 * @param {string} dir - Absolute path to the already-built site.
 * @param {Object} [options]
 * @param {string} [options.branch] - Branch to publish to. Default `gh-pages`.
 * @param {string} [options.remote] - Remote to push that branch to. Default `origin`.
 * @param {string} [options.repo] - A full remote URL, overriding `remote`
 *   entirely. Defaults to
 *   `https://x-access-token:<token>@github.com/<GITHUB_REPOSITORY>.git` when
 *   a token is available and `GITHUB_REPOSITORY` is set (both true on every
 *   GitHub Actions run) — set this explicitly to publish somewhere else (a
 *   different repo, a non-GitHub remote, over SSH).
 * @param {string} [options.token] - Falls back to `process.env.GITHUB_TOKEN`.
 *   Required unless `repo` already embeds its own credentials (e.g. an SSH
 *   URL) — see "Skipping" below.
 * @param {string} [options.cname] - Written as a `CNAME` file, for a custom domain.
 * @param {boolean} [options.dotfiles] - Publish dotfiles too. Default `false`.
 * @param {boolean} [options.nojekyll] - Write a `.nojekyll` file at the branch
 *   root, so GitHub Pages serves `_`-prefixed paths (Antora's default UI
 *   bundle output dir) instead of stripping them via its default Jekyll
 *   processing. Default `true` — pass `false` explicitly to opt back into
 *   Jekyll processing.
 * @param {string} [options.message] - The commit message. Default `Publish site`.
 * @param {{name: string, email: string}} [options.user] - Commit author.
 *   Defaults to the `github-actions[bot]` identity when not supplied — see
 *   fix 1 in this file's header comment for why a default is needed at all.
 * @param {boolean} [options.force] - Publish even when `GITHUB_ACTIONS` is
 *   not `'true'`. See "Skipping" below.
 * @param {Object} [options.logger] - `{ warn, info }`. Defaults to `console`.
 * @param {Object} [ghpages] - The `gh-pages` client to publish through.
 *   Defaults to the real `gh-pages` package; overridden in tests, since
 *   `vi.mock` cannot intercept a plain CommonJS `require()` of a dependency
 *   the way it does an ES module import — this parameter is the seam instead.
 * @param {Object} [git] - The git plumbing client used to pre-create an
 *   empty orphan branch when it doesn't exist remotely yet (fix 3 above).
 *   Defaults to `defaultGit`; overridden in tests for the same reason as
 *   `ghpages`.
 * @returns {Promise<boolean>} Whether the push actually happened.
 */
module.exports = async function publishGhPages(dir, options = {}, ghpages = require('gh-pages'), git = defaultGit) {
  const logger = options.logger || console

  // Two independent guards, both meant to make an accidental push
  // impossible rather than merely unlikely:
  //
  //   - No token, no push. Running this by hand with no `GITHUB_TOKEN` and
  //     no `options.token` can never reach the git operations below.
  //   - Not GitHub Actions, no push, UNLESS `options.force` says so
  //     explicitly. `GITHUB_ACTIONS=true` is set by every GitHub Actions job
  //     automatically — nothing to configure there — so the common case
  //     (docouture-publish.yml, in GitHub Actions) "just works". Any other CI
  //     vendor, or a deliberate publish from a local machine, has to opt in
  //     with `--force` — a choice made explicitly at the call site, never a
  //     side effect nobody asked for.
  const token = options.token || process.env.GITHUB_TOKEN
  if (!token) {
    logger.warn('Skipping GitHub Pages publish: no token (set GITHUB_TOKEN or pass --token)')
    return false
  }
  if (process.env.GITHUB_ACTIONS !== 'true' && !options.force) {
    logger.warn('Skipping GitHub Pages publish: not running in GitHub Actions (pass --force to publish anyway)')
    return false
  }

  const branch = options.branch || 'gh-pages'
  await assertSafeGitBranch(branch, 'branch')
  const remote = options.remote || 'origin'
  const repo =
    options.repo ||
    (process.env.GITHUB_REPOSITORY
      ? `https://x-access-token:${token}@github.com/${process.env.GITHUB_REPOSITORY}.git`
      : undefined)
  const user = options.user || DEFAULT_USER

  // Fix 3: pre-create the branch as an empty orphan commit when it doesn't
  // exist remotely yet, so gh-pages's own clone never falls back to `main`.
  // `repo || remote` mirrors gh-pages's own `getRepo()` fallback (an
  // explicit repo URL, or else whatever the named remote resolves to
  // locally) — either is a valid target for `git ls-remote`/`git push`.
  const remoteTarget = repo || remote
  assertSafeGitRemote(remoteTarget, 'repo/remote')
  const branchAlreadyExists = await git.branchExists(remoteTarget, branch)
  if (!branchAlreadyExists) {
    logger.info(`Branch '${branch}' does not exist on '${remoteTarget}' yet; creating it as an empty orphan branch`)
    await git.createOrphanBranch(remoteTarget, branch, user)
  }

  const ghpagesOptions = {
    branch,
    remote,
    repo,
    dotfiles: options.dotfiles || false,
    nojekyll: options.nojekyll !== false,
    message: options.message || 'Publish site',
    user,
    cname: options.cname,
  }

  logger.info(`Publishing ${dir} to branch '${ghpagesOptions.branch}'`)

  // Fix 2: never trust ghpages.publish()'s own return value alone — pass an
  // explicit callback and settle our own promise from it. In the normal
  // (non-buggy) case gh-pages both invokes this callback AND resolves its
  // own returned promise for the same outcome, so `settled` guards against
  // double-resolution; in the buggy cases described above (a resolved
  // promise on failure, or no promise at all), the callback is the only
  // place the real error ever surfaces.
  await new Promise((resolve, reject) => {
    let settled = false
    const finish = (err) => {
      if (settled) return
      settled = true
      if (err) reject(err instanceof Error ? err : new Error(String(err)))
      else resolve()
    }
    const maybePromise = ghpages.publish(dir, ghpagesOptions, finish)
    if (maybePromise && typeof maybePromise.then === 'function') {
      maybePromise.then(() => finish(), finish)
    }
  })

  logger.info('GitHub Pages publish complete')
  return true
}
