'use strict'

import { describe, expect, it, vi } from 'vitest'

const { ensureKrokiRunning, BUNDLED_COMPOSE_FILE } = require('./kroki-docker')

function logger() {
  const warnings = []
  const infos = []
  return { warn: (...args) => warnings.push(args), info: (...args) => infos.push(args), warnings, infos }
}

describe('ensureKrokiRunning', () => {
  it('does nothing when Kroki already answers', async () => {
    const isReachable = vi.fn().mockResolvedValue(true)
    const execFileAsync = vi.fn()
    const log = logger()

    await ensureKrokiRunning('http://localhost:8500', undefined, log, { isReachable, execFileAsync })

    expect(execFileAsync).not.toHaveBeenCalled()
    expect(log.warnings).toEqual([])
    expect(log.infos.some(([msg]) => msg.includes('already reachable'))).toBe(true)
  })

  it('starts the bundled compose file when nothing answers, then succeeds on the next probe', async () => {
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const log = logger()

    await ensureKrokiRunning('http://localhost:8500', undefined, log, { isReachable, execFileAsync })

    expect(execFileAsync).toHaveBeenCalledTimes(1)
    expect(execFileAsync).toHaveBeenCalledWith('docker', ['compose', '-f', BUNDLED_COMPOSE_FILE, 'up', '-d'])
    expect(log.warnings).toEqual([])
    expect(log.infos.some(([msg]) => msg.includes('starting it via'))).toBe(true)
    expect(log.infos.some(([msg]) => msg.includes('up -d succeeded'))).toBe(true)
    expect(log.infos.some(([msg]) => msg.includes('reachable at %s after'))).toBe(true)
  })

  it('warns and gives up quietly when docker compose itself fails (e.g. Docker not installed)', async () => {
    const isReachable = vi.fn().mockResolvedValue(false)
    const execFileAsync = vi.fn().mockRejectedValue(new Error('spawn docker ENOENT'))
    const log = logger()

    await ensureKrokiRunning('http://localhost:8500', undefined, log, { isReachable, execFileAsync })

    expect(log.warnings.some(([msg]) => msg.includes('Could not start the local Kroki service'))).toBe(true)
  })

  it('warns when the service never becomes reachable within the timeout', async () => {
    const isReachable = vi.fn().mockResolvedValue(false)
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const sleep = vi.fn().mockResolvedValue(undefined)
    const log = logger()

    const realNow = Date.now
    let now = 0
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    // Advance the fake clock a bit further than the timeout on every sleep()
    // call, so the polling loop's own `Date.now() < deadline` check exits
    // after a couple of iterations instead of looping until a real 60s pass.
    sleep.mockImplementation(async () => {
      now += 30000
    })

    try {
      await ensureKrokiRunning('http://localhost:8500', undefined, log, { isReachable, execFileAsync, sleep })
    } finally {
      Date.now = realNow
    }

    expect(log.warnings.some(([msg]) => msg.includes('did not become reachable'))).toBe(true)
  })

  it('prefers an ejected override compose file over the bundled default', async () => {
    const isReachable = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const execFileAsync = vi.fn().mockResolvedValue({ stdout: '', stderr: '' })
    const log = logger()

    // No override file actually exists at this made-up path, so this also
    // exercises the "falls back to the bundled file" branch — a real
    // override's presence is covered by copy-template-style file-existence
    // logic already tested at the CLI layer (eject.spec.ts).
    await ensureKrokiRunning('http://localhost:8500', '/tmp/does-not-exist-kroki-docker-spec', log, {
      isReachable,
      execFileAsync,
    })

    expect(execFileAsync).toHaveBeenCalledWith('docker', ['compose', '-f', BUNDLED_COMPOSE_FILE, 'up', '-d'])
  })
})
