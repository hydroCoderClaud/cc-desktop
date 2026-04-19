import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('plugin-runtime state lock', () => {
  let withPluginStateLock

  beforeEach(async () => {
    vi.resetModules()
    ;({ withPluginStateLock } = await import('../../src/main/plugin-runtime/core/state-lock.js'))
  })

  it('serializes concurrent tasks', async () => {
    const events = []
    let releaseFirst

    const first = withPluginStateLock(async () => {
      events.push('first-start')
      await new Promise(resolve => {
        releaseFirst = resolve
      })
      events.push('first-end')
      return 'first'
    })

    const second = withPluginStateLock(async () => {
      events.push('second-start')
      events.push('second-end')
      return 'second'
    })

    await Promise.resolve()
    await Promise.resolve()
    expect(events).toEqual(['first-start'])

    releaseFirst()

    await expect(first).resolves.toBe('first')
    await expect(second).resolves.toBe('second')
    expect(events).toEqual(['first-start', 'first-end', 'second-start', 'second-end'])
  })

  it('continues processing after a rejected task', async () => {
    const events = []
    let rejectFirst

    const first = withPluginStateLock(async () => {
      events.push('first-start')
      await new Promise((_, reject) => {
        rejectFirst = reject
      })
    })

    const second = withPluginStateLock(async () => {
      events.push('second-start')
      return 'second'
    })

    await Promise.resolve()
    expect(events).toEqual(['first-start'])

    rejectFirst(new Error('boom'))

    await expect(first).rejects.toThrow('boom')
    await expect(second).resolves.toBe('second')
    expect(events).toEqual(['first-start', 'second-start'])
  })
})
