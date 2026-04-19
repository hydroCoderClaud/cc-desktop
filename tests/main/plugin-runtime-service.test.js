import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const servicePath = require.resolve('../../src/main/plugin-runtime/PluginService.js')
const sourcePath = require.resolve('../../src/main/plugin-runtime/core/source.js')
const marketplacesPath = require.resolve('../../src/main/plugin-runtime/core/marketplaces.js')
const pluginsPath = require.resolve('../../src/main/plugin-runtime/core/plugins.js')
const stateLockPath = require.resolve('../../src/main/plugin-runtime/core/state-lock.js')

describe('PluginService', () => {
  let originalCache
  let mocks

  function setModuleCache(modulePath, exports) {
    originalCache.set(modulePath, require.cache[modulePath])
    require.cache[modulePath] = {
      id: modulePath,
      filename: modulePath,
      loaded: true,
      exports
    }
  }

  function restoreModuleCache(modulePath) {
    const original = originalCache.get(modulePath)
    if (original) {
      require.cache[modulePath] = original
    } else {
      delete require.cache[modulePath]
    }
  }

  function createService() {
    delete require.cache[servicePath]
    const { PluginService } = require(servicePath)
    return new PluginService()
  }

  beforeEach(() => {
    originalCache = new Map()
    mocks = {
      parseMarketplaceInput: vi.fn(),
      addMarketplaceSource: vi.fn(),
      listMarketplaces: vi.fn(() => [{ name: 'demo' }]),
      refreshMarketplace: vi.fn(),
      refreshAllMarketplaces: vi.fn(),
      removeMarketplaceSource: vi.fn(),
      installPlugin: vi.fn(),
      listAvailablePlugins: vi.fn(() => ({ success: true, installed: [], available: [] })),
      uninstallPlugin: vi.fn(),
      updatePlugin: vi.fn(),
      withPluginStateLock: vi.fn(task => task())
    }

    setModuleCache(sourcePath, {
      parseMarketplaceInput: mocks.parseMarketplaceInput
    })
    setModuleCache(marketplacesPath, {
      addMarketplaceSource: mocks.addMarketplaceSource,
      listMarketplaces: mocks.listMarketplaces,
      refreshMarketplace: mocks.refreshMarketplace,
      refreshAllMarketplaces: mocks.refreshAllMarketplaces,
      removeMarketplaceSource: mocks.removeMarketplaceSource
    })
    setModuleCache(pluginsPath, {
      installPlugin: mocks.installPlugin,
      listAvailablePlugins: mocks.listAvailablePlugins,
      uninstallPlugin: mocks.uninstallPlugin,
      updatePlugin: mocks.updatePlugin
    })
    setModuleCache(stateLockPath, {
      withPluginStateLock: mocks.withPluginStateLock
    })
  })

  afterEach(() => {
    delete require.cache[servicePath]
    restoreModuleCache(sourcePath)
    restoreModuleCache(marketplacesPath)
    restoreModuleCache(pluginsPath)
    restoreModuleCache(stateLockPath)
  })

  it('rejects invalid marketplace input before parsing', async () => {
    const service = createService()

    await expect(service.addMarketplace('')).resolves.toEqual({
      success: false,
      error: 'Invalid marketplace source'
    })

    expect(mocks.parseMarketplaceInput).not.toHaveBeenCalled()
  })

  it('returns a friendly error when marketplace input cannot be parsed', async () => {
    mocks.parseMarketplaceInput.mockResolvedValueOnce(null)
    const service = createService()

    await expect(service.addMarketplace('bad-source')).resolves.toEqual({
      success: false,
      error: 'Invalid marketplace source format. Try: owner/repo, https://..., or ./path'
    })
    expect(mocks.addMarketplaceSource).not.toHaveBeenCalled()
  })

  it('passes parser errors through unchanged', async () => {
    mocks.parseMarketplaceInput.mockResolvedValueOnce({
      error: 'Path does not exist: C:/missing-marketplace'
    })
    const service = createService()

    await expect(service.addMarketplace('C:/missing-marketplace')).resolves.toEqual({
      success: false,
      error: 'Path does not exist: C:/missing-marketplace'
    })
  })

  it('reports already materialized marketplaces without treating them as failures', async () => {
    mocks.parseMarketplaceInput.mockResolvedValueOnce({
      source: 'github',
      repo: 'openai/codex-plugin-cc'
    })
    mocks.addMarketplaceSource.mockResolvedValueOnce({
      name: 'openai-codex',
      alreadyMaterialized: true
    })
    const service = createService()

    await expect(service.addMarketplace('openai/codex-plugin-cc')).resolves.toEqual({
      success: true,
      message: "Marketplace 'openai-codex' already exists"
    })
    expect(mocks.withPluginStateLock).toHaveBeenCalledTimes(1)
  })

  it('updates a specific marketplace or all marketplaces depending on input', async () => {
    const service = createService()

    await expect(service.updateMarketplace('openai-codex')).resolves.toEqual({
      success: true,
      message: "Marketplace 'openai-codex' updated successfully"
    })
    await expect(service.updateMarketplace()).resolves.toEqual({
      success: true,
      message: 'All marketplaces updated successfully'
    })

    expect(mocks.refreshMarketplace).toHaveBeenCalledWith('openai-codex')
    expect(mocks.refreshAllMarketplaces).toHaveBeenCalledTimes(1)
    expect(mocks.withPluginStateLock).toHaveBeenCalledTimes(2)
  })

  it('wraps install failures into service-level error payloads', async () => {
    mocks.installPlugin.mockRejectedValueOnce(new Error('install failed'))
    const service = createService()

    await expect(service.install('demo@market')).resolves.toEqual({
      success: false,
      error: 'install failed'
    })
  })
})
