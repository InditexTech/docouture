'use strict'

// The GitHub Pages `pdocs publish` driver. Called by
// @inditextech/pdocs-cli's `publish` command as
// `require('@inditextech/pdocs-publish-gh-pages')(dir, options)` — a plain
// function, not an Antora extension. Earlier design hooked Antora's own
// `sitePublished` pipeline event instead (a publish-target `antora.extensions`
// entry); this package is deliberately NOT that anymore; publishing is a CLI
// concern (`pdocs publish gh-pages`), decoupled from `antora build` — a site
// can build without publishing, and re-publish an already-built `build/site`
// without rebuilding.
//
// `dir` is the already-built site directory — resolved by the CLI (reading
// `output.dir` out of the site's own antora-playbook.yml, defaulting to
// Antora's own `build/site`), not by this package. This package's only job
// is pushing that directory to a branch.

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
 * @param {string} [options.message] - The commit message. Default `Publish site`.
 * @param {{name: string, email: string}} [options.user] - Commit author,
 *   when the environment doing the push has no git identity configured
 *   (the normal case on a CI runner).
 * @param {boolean} [options.force] - Publish even when `GITHUB_ACTIONS` is
 *   not `'true'`. See "Skipping" below.
 * @param {Object} [options.logger] - `{ warn, info }`. Defaults to `console`.
 * @param {Object} [ghpages] - The `gh-pages` client to publish through.
 *   Defaults to the real `gh-pages` package; overridden in tests, since
 *   `vi.mock` cannot intercept a plain CommonJS `require()` of a dependency
 *   the way it does an ES module import — this parameter is the seam instead.
 * @returns {Promise<boolean>} Whether the push actually happened.
 */
module.exports = async function publishGhPages(dir, options = {}, ghpages = require('gh-pages')) {
  const logger = options.logger || console

  // Two independent guards, both meant to make an accidental push
  // impossible rather than merely unlikely:
  //
  //   - No token, no push. Running this by hand with no `GITHUB_TOKEN` and
  //     no `options.token` can never reach the git operations below.
  //   - Not GitHub Actions, no push, UNLESS `options.force` says so
  //     explicitly. `GITHUB_ACTIONS=true` is set by every GitHub Actions job
  //     automatically — nothing to configure there — so the common case
  //     (pdocs-publish.yml, in GitHub Actions) "just works". Any other CI
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

  const repo =
    options.repo ||
    (process.env.GITHUB_REPOSITORY
      ? `https://x-access-token:${token}@github.com/${process.env.GITHUB_REPOSITORY}.git`
      : undefined)

  const ghpagesOptions = {
    branch: options.branch || 'gh-pages',
    remote: options.remote || 'origin',
    repo,
    dotfiles: options.dotfiles || false,
    message: options.message || 'Publish site',
    user: options.user,
    cname: options.cname,
  }

  logger.info(`Publishing ${dir} to branch '${ghpagesOptions.branch}'`)
  await ghpages.publish(dir, ghpagesOptions)
  logger.info('GitHub Pages publish complete')
  return true
}
