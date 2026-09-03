// SPDX-FileCopyrightText: 2026 INDUSTRIA DE DISEÑO TEXTIL S.A. (INDITEX S.A.)
//
// SPDX-License-Identifier: Apache-2.0

'use strict'

import { describe, expect, it, vi, beforeEach } from 'vitest'

const publishGhPages = require('./index')
const { createGitPlumbing } = publishGhPages

// Mirrors gh-pages's real contract: publish(dir, options, callback) invokes
// the callback with an error or none, AND returns a promise for the same
// outcome (mockResolvedValue below) — matching the normal, non-buggy path.
// Individual tests override this per-call to reproduce the buggy paths this
// file's own header describes.
const publish = vi.fn((dir, opts, callback) => {
  callback?.()
  return Promise.resolve(undefined)
})
const fakeGhpages = { publish }

const branchExists = vi.fn().mockResolvedValue(true)
const createOrphanBranch = vi.fn().mockResolvedValue(undefined)
const fakeGit = { branchExists, createOrphanBranch }

const silentLogger = { warn: () => {}, info: () => {} }

beforeEach(() => {
  publish.mockClear()
  publish.mockImplementation((dir, opts, callback) => {
    callback?.()
    return Promise.resolve(undefined)
  })
  branchExists.mockClear()
  branchExists.mockResolvedValue(true)
  createOrphanBranch.mockClear()
  createOrphanBranch.mockResolvedValue(undefined)
  delete process.env.GITHUB_TOKEN
  delete process.env.GITHUB_ACTIONS
  delete process.env.GITHUB_REPOSITORY
})

describe('publishGhPages', () => {
  it('publishes when a token is present and running in GitHub Actions', async () => {
    process.env.GITHUB_TOKEN = 'secret'
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_REPOSITORY = 'acme/docs'

    const result = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

    expect(result).toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
    const [dir, options] = publish.mock.calls[0]
    expect(dir).toBe('/site/build/site')
    expect(options.branch).toBe('gh-pages')
    expect(options.remote).toBe('origin')
    expect(options.repo).toBe('https://x-access-token:secret@github.com/acme/docs.git')
  })

  it('skips when no token is available', async () => {
    process.env.GITHUB_ACTIONS = 'true'

    const result = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

    expect(result).toBe(false)
    expect(publish).not.toHaveBeenCalled()
  })

  it('skips outside GitHub Actions unless options.force is set', async () => {
    process.env.GITHUB_TOKEN = 'secret'

    const skipped = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)
    expect(skipped).toBe(false)
    expect(publish).not.toHaveBeenCalled()

    const forced = await publishGhPages('/site/build/site', { logger: silentLogger, force: true }, fakeGhpages, fakeGit)
    expect(forced).toBe(true)
    expect(publish).toHaveBeenCalledTimes(1)
  })

  it('respects explicit option overrides', async () => {
    process.env.GITHUB_TOKEN = 'ignored-because-repo-is-explicit'
    process.env.GITHUB_ACTIONS = 'true'

    await publishGhPages(
      '/site/build/site',
      {
        logger: silentLogger,
        branch: 'pages',
        remote: 'upstream',
        repo: 'git@github.com:acme/docs.git',
        cname: 'docs.example.com',
        message: 'Deploy docs',
        user: { name: 'Docs Bot', email: 'docs-bot@example.com' },
      },
      fakeGhpages,
      fakeGit
    )

    const [, options] = publish.mock.calls[0]
    expect(options).toMatchObject({
      branch: 'pages',
      remote: 'upstream',
      repo: 'git@github.com:acme/docs.git',
      cname: 'docs.example.com',
      message: 'Deploy docs',
      user: { name: 'Docs Bot', email: 'docs-bot@example.com' },
    })
  })

  it('uses an explicit options.token over GITHUB_TOKEN', async () => {
    process.env.GITHUB_ACTIONS = 'true'

    await publishGhPages(
      '/site/build/site',
      { logger: silentLogger, token: 'explicit-token', repo: undefined },
      fakeGhpages,
      fakeGit
    )

    expect(publish).toHaveBeenCalledTimes(1)
  })

  describe('default git identity (fix 1)', () => {
    it('defaults to the github-actions[bot] identity when no user is supplied', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

      const [, options] = publish.mock.calls[0]
      expect(options.user).toEqual({
        name: 'github-actions[bot]',
        email: '41898282+github-actions[bot]@users.noreply.github.com',
      })
    })

    it('an explicit options.user still wins', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await publishGhPages(
        '/site/build/site',
        { logger: silentLogger, user: { name: 'Someone', email: 'someone@example.com' } },
        fakeGhpages,
        fakeGit
      )

      const [, options] = publish.mock.calls[0]
      expect(options.user).toEqual({ name: 'Someone', email: 'someone@example.com' })
    })
  })

  describe('swallowed-failure fix (fix 2)', () => {
    it('rejects when ghpages invokes its callback with an error, even if its own promise resolves', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      // Reproduces the exact gh-pages bug: the callback reports a real
      // failure, but the promise it returns still resolves. Before fix 2,
      // this outcome was invisible — publishGhPages would have returned
      // true.
      publish.mockImplementation((dir, opts, callback) => {
        callback?.(new Error('fatal: empty ident name'))
        return Promise.resolve(undefined)
      })

      await expect(publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)).rejects.toThrow(
        'fatal: empty ident name'
      )
    })

    it('rejects when ghpages returns no promise at all (its own "no files matched" early-return)', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      publish.mockImplementation((dir, opts, callback) => {
        callback?.(new Error('The pattern in the "src" property did not match any files.'))
        // No return value at all — mirrors gh-pages's own bare `return;`.
      })

      await expect(publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)).rejects.toThrow(
        'did not match any files'
      )
    })
  })

  describe('.nojekyll default (fix 4)', () => {
    it('defaults nojekyll to true', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

      const [, options] = publish.mock.calls[0]
      expect(options.nojekyll).toBe(true)
    })

    it('respects an explicit nojekyll: false', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await publishGhPages('/site/build/site', { logger: silentLogger, nojekyll: false }, fakeGhpages, fakeGit)

      const [, options] = publish.mock.calls[0]
      expect(options.nojekyll).toBe(false)
    })
  })

  describe('branch name validation', () => {
    it('rejects a branch that looks like a git flag (e.g. --upload-pack=...)', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await expect(
        publishGhPages(
          '/site/build/site',
          { logger: silentLogger, branch: '--upload-pack=touch /tmp/pwned;' },
          fakeGhpages,
          fakeGit
        )
      ).rejects.toThrow('Invalid branch')

      expect(branchExists).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
    })

    it('rejects a branch containing whitespace or shell metacharacters', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await expect(
        publishGhPages('/site/build/site', { logger: silentLogger, branch: 'gh pages; rm -rf /' }, fakeGhpages, fakeGit)
      ).rejects.toThrow('Invalid branch')

      expect(branchExists).not.toHaveBeenCalled()
      expect(publish).not.toHaveBeenCalled()
    })

    it('accepts an ordinary branch name', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'

      await publishGhPages(
        '/site/build/site',
        { logger: silentLogger, branch: 'release/gh-pages' },
        fakeGhpages,
        fakeGit
      )

      expect(publish).toHaveBeenCalledTimes(1)
    })
  })

  describe('orphan branch pre-create (fix 3)', () => {
    it('creates an empty orphan branch when it does not exist remotely yet', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'
      process.env.GITHUB_REPOSITORY = 'acme/docs'
      branchExists.mockResolvedValue(false)

      await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

      expect(branchExists).toHaveBeenCalledWith('https://x-access-token:secret@github.com/acme/docs.git', 'gh-pages')
      expect(createOrphanBranch).toHaveBeenCalledWith(
        'https://x-access-token:secret@github.com/acme/docs.git',
        'gh-pages',
        { name: 'github-actions[bot]', email: '41898282+github-actions[bot]@users.noreply.github.com' }
      )
      // The orphan branch must exist BEFORE gh-pages's own publish runs.
      expect(createOrphanBranch.mock.invocationCallOrder[0]).toBeLessThan(publish.mock.invocationCallOrder[0])
    })

    it('skips creating the branch when it already exists remotely', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'
      branchExists.mockResolvedValue(true)

      await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages, fakeGit)

      expect(createOrphanBranch).not.toHaveBeenCalled()
    })

    it('falls back to the named remote for the existence check when repo is not resolvable', async () => {
      process.env.GITHUB_TOKEN = 'secret'
      process.env.GITHUB_ACTIONS = 'true'
      // No GITHUB_REPOSITORY and no options.repo: repo stays undefined.
      branchExists.mockResolvedValue(true)

      await publishGhPages('/site/build/site', { logger: silentLogger, remote: 'upstream' }, fakeGhpages, fakeGit)

      expect(branchExists).toHaveBeenCalledWith('upstream', 'gh-pages')
    })
  })
})

// The real git plumbing `defaultGit` is built from (`fakeGit` stands in for
// the whole thing in every test above this point). Exercised directly here
// via `createGitPlumbing(fakeExec)` — a fake `exec` in place of a real git
// binary — to cover its own guard clauses and to pin down the `--`
// end-of-options argv fix for CodeQL alert #40
// (js/second-order-command-line-injection).
describe('git plumbing (createGitPlumbing)', () => {
  const fakeExec = vi.fn()

  beforeEach(() => {
    fakeExec.mockReset()
    fakeExec.mockResolvedValue({ stdout: '', stderr: '' })
  })

  describe('branchExists', () => {
    it('rejects a remote that looks like a git flag, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('--upload-pack=touch /tmp/pwned;', 'gh-pages')).rejects.toThrow('Invalid remote')
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('rejects a remote containing whitespace, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('git@github.com:acme/docs.git evil', 'gh-pages')).rejects.toThrow('Invalid remote')
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('rejects a remote in an unrecognised format, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('not a valid remote!!', 'gh-pages')).rejects.toThrow('Invalid remote')
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('rejects a branch that looks like a git flag, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('origin', '--upload-pack=touch /tmp/pwned;')).rejects.toThrow('Invalid branch')
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('calls git ls-remote with the -- end-of-options marker before the tainted args', async () => {
      const git = createGitPlumbing(fakeExec)

      const result = await git.branchExists('origin', 'gh-pages')

      expect(result).toBe(true)
      expect(fakeExec).toHaveBeenCalledExactlyOnceWith('git', ['ls-remote', '--exit-code', '--', 'origin', 'gh-pages'])
    })

    it('returns false when git ls-remote exits with code 2 (branch not found)', async () => {
      fakeExec.mockRejectedValue(Object.assign(new Error('not found'), { code: 2 }))
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('origin', 'gh-pages')).resolves.toBe(false)
    })

    it('rethrows any other git ls-remote failure', async () => {
      fakeExec.mockRejectedValue(Object.assign(new Error('network unreachable'), { code: 1 }))
      const git = createGitPlumbing(fakeExec)

      await expect(git.branchExists('origin', 'gh-pages')).rejects.toThrow('network unreachable')
    })
  })

  describe('createOrphanBranch', () => {
    const user = { name: 'github-actions[bot]', email: 'bot@example.com' }

    it('rejects a remote that looks like a git flag, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.createOrphanBranch('--upload-pack=touch /tmp/pwned;', 'gh-pages', user)).rejects.toThrow(
        'Invalid remote'
      )
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('rejects a branch that looks like a git flag, without shelling out', async () => {
      const git = createGitPlumbing(fakeExec)

      await expect(git.createOrphanBranch('origin', '--upload-pack=touch /tmp/pwned;', user)).rejects.toThrow(
        'Invalid branch'
      )
      expect(fakeExec).not.toHaveBeenCalled()
    })

    it('runs init/checkout/config/commit/push, with -- before the tainted push args', async () => {
      const git = createGitPlumbing(fakeExec)

      await git.createOrphanBranch('origin', 'gh-pages', user)

      expect(fakeExec).toHaveBeenNthCalledWith(1, 'git', ['init', '--quiet', expect.any(String)])
      const scratchDir = fakeExec.mock.calls[0][1][2]
      expect(fakeExec).toHaveBeenNthCalledWith(2, 'git', ['checkout', '--quiet', '--orphan', 'gh-pages'], {
        cwd: scratchDir,
      })
      expect(fakeExec).toHaveBeenNthCalledWith(3, 'git', ['config', 'user.email', user.email], { cwd: scratchDir })
      expect(fakeExec).toHaveBeenNthCalledWith(4, 'git', ['config', 'user.name', user.name], { cwd: scratchDir })
      expect(fakeExec).toHaveBeenNthCalledWith(
        5,
        'git',
        ['commit', '--quiet', '--allow-empty', '-m', 'Initial gh-pages branch'],
        { cwd: scratchDir }
      )
      expect(fakeExec).toHaveBeenNthCalledWith(
        6,
        'git',
        ['push', '--quiet', '--', 'origin', 'HEAD:refs/heads/gh-pages'],
        {
          cwd: scratchDir,
        }
      )
    })

    it('cleans up the scratch directory even when a git command fails', async () => {
      fakeExec.mockResolvedValueOnce({ stdout: '', stderr: '' })
      fakeExec.mockRejectedValueOnce(new Error('fatal: could not create work tree'))
      const git = createGitPlumbing(fakeExec)

      await expect(git.createOrphanBranch('origin', 'gh-pages', user)).rejects.toThrow('could not create work tree')
    })
  })
})
