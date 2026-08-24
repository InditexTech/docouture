'use strict'

import { describe, expect, it, vi, beforeEach } from 'vitest'

const publishGhPages = require('./index')

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
