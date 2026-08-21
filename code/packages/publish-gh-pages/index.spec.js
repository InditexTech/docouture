'use strict'

import { describe, expect, it, vi, beforeEach } from 'vitest'

const publishGhPages = require('./index')

const publish = vi.fn().mockResolvedValue(undefined)
const fakeGhpages = { publish }
const silentLogger = { warn: () => {}, info: () => {} }

beforeEach(() => {
  publish.mockClear()
  delete process.env.GITHUB_TOKEN
  delete process.env.GITHUB_ACTIONS
  delete process.env.GITHUB_REPOSITORY
})

describe('publishGhPages', () => {
  it('publishes when a token is present and running in GitHub Actions', async () => {
    process.env.GITHUB_TOKEN = 'secret'
    process.env.GITHUB_ACTIONS = 'true'
    process.env.GITHUB_REPOSITORY = 'acme/docs'

    const result = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages)

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

    const result = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages)

    expect(result).toBe(false)
    expect(publish).not.toHaveBeenCalled()
  })

  it('skips outside GitHub Actions unless options.force is set', async () => {
    process.env.GITHUB_TOKEN = 'secret'

    const skipped = await publishGhPages('/site/build/site', { logger: silentLogger }, fakeGhpages)
    expect(skipped).toBe(false)
    expect(publish).not.toHaveBeenCalled()

    const forced = await publishGhPages('/site/build/site', { logger: silentLogger, force: true }, fakeGhpages)
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
      fakeGhpages
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
      fakeGhpages
    )

    expect(publish).toHaveBeenCalledTimes(1)
  })
})
