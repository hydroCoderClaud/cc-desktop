import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('plugin-runtime installed registry helpers', () => {
  let getInstallationByScope
  let getPrimaryInstallation
  let isInstallPathReferenced
  let listInstalledPlugins

  beforeEach(async () => {
    vi.resetModules()
    ;({
      getInstallationByScope,
      getPrimaryInstallation,
      isInstallPathReferenced,
      listInstalledPlugins
    } = await import('../../src/main/plugin-runtime/core/installed-registry.js'))
  })

  it('prefers user scope over project, local, and managed installations', () => {
    const registry = {
      version: 2,
      plugins: {
        'demo@market': [
          { scope: 'managed', installPath: '/managed/demo', version: '0.9.0', installedAt: '1', lastUpdated: '1' },
          { scope: 'project', installPath: '/project/demo', version: '1.0.0', installedAt: '1', lastUpdated: '1' },
          { scope: 'user', installPath: '/user/demo', version: '1.1.0', installedAt: '1', lastUpdated: '1' },
          { scope: 'local', installPath: '/local/demo', version: '1.0.5', installedAt: '1', lastUpdated: '1' }
        ]
      }
    }

    expect(getPrimaryInstallation('demo@market', registry)).toMatchObject({
      scope: 'user',
      installPath: '/user/demo',
      version: '1.1.0'
    })
    expect(getInstallationByScope('demo@market', 'project', registry)).toMatchObject({
      scope: 'project',
      installPath: '/project/demo'
    })
  })

  it('falls back to known scopes before unknown ones when user scope is absent', () => {
    const registry = {
      version: 2,
      plugins: {
        'demo@market': [
          { scope: 'custom', installPath: '/custom/demo', version: '9.9.9', installedAt: '1', lastUpdated: '1' },
          { scope: 'local', installPath: '/local/demo', version: '1.0.0', installedAt: '1', lastUpdated: '1' }
        ]
      }
    }

    expect(getPrimaryInstallation('demo@market', registry)).toMatchObject({
      scope: 'local',
      installPath: '/local/demo'
    })
  })

  it('lists installed plugins using the chosen primary installation', () => {
    const registry = {
      version: 2,
      plugins: {
        'demo@market': [
          { scope: 'project', installPath: '/project/demo', version: '1.0.0', installedAt: '2026-04-19T00:00:00.000Z', lastUpdated: '2026-04-19T00:00:00.000Z' },
          { scope: 'user', installPath: '/user/demo', version: '1.2.0', installedAt: '2026-04-20T00:00:00.000Z', lastUpdated: '2026-04-20T00:00:00.000Z' }
        ],
        'tool@market': [
          { scope: 'managed', installPath: '/managed/tool', version: '0.3.0', installedAt: '2026-04-18T00:00:00.000Z', lastUpdated: '2026-04-18T00:00:00.000Z' }
        ]
      }
    }

    expect(listInstalledPlugins(registry)).toEqual([
      {
        id: 'demo@market',
        version: '1.2.0',
        installPath: '/user/demo',
        installedAt: '2026-04-20T00:00:00.000Z'
      },
      {
        id: 'tool@market',
        version: '0.3.0',
        installPath: '/managed/tool',
        installedAt: '2026-04-18T00:00:00.000Z'
      }
    ])
  })

  it('can ignore the current plugin when checking orphaned install paths', () => {
    const registry = {
      version: 2,
      plugins: {
        'demo@market': [
          { scope: 'user', installPath: '/shared/cache/demo', version: '1.0.0', installedAt: '1', lastUpdated: '1' }
        ],
        'other@market': [
          { scope: 'user', installPath: '/shared/cache/other', version: '1.0.0', installedAt: '1', lastUpdated: '1' }
        ]
      }
    }

    expect(isInstallPathReferenced('/shared/cache/demo', registry)).toBe(true)
    expect(isInstallPathReferenced('/shared/cache/demo', registry, 'demo@market')).toBe(false)
    expect(isInstallPathReferenced('/shared/cache/other', registry, 'demo@market')).toBe(true)
  })
})
