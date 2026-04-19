const { parseMarketplaceInput } = require('./core/source')
const {
  addMarketplaceSource,
  listMarketplaces,
  refreshMarketplace,
  refreshAllMarketplaces,
  removeMarketplaceSource
} = require('./core/marketplaces')
const {
  installPlugin,
  listAvailablePlugins,
  uninstallPlugin,
  updatePlugin
} = require('./core/plugins')
const { withPluginStateLock } = require('./core/state-lock')

class PluginService {
  async listAvailable() {
    return listAvailablePlugins()
  }

  async install(pluginId) {
    try {
      return await withPluginStateLock(() => installPlugin(pluginId))
    } catch (err) {
      return { success: false, error: err.message || 'Failed to install plugin' }
    }
  }

  async uninstall(pluginId) {
    try {
      return await withPluginStateLock(() => uninstallPlugin(pluginId))
    } catch (err) {
      return { success: false, error: err.message || 'Failed to uninstall plugin' }
    }
  }

  async update(pluginId) {
    try {
      return await withPluginStateLock(() => updatePlugin(pluginId))
    } catch (err) {
      return { success: false, error: err.message || 'Failed to update plugin' }
    }
  }

  async listMarketplaces() {
    return listMarketplaces()
  }

  async addMarketplace(source) {
    if (!source || typeof source !== 'string') {
      return { success: false, error: 'Invalid marketplace source' }
    }

    try {
      const parsed = await parseMarketplaceInput(source)
      if (!parsed) {
        return {
          success: false,
          error: 'Invalid marketplace source format. Try: owner/repo, https://..., or ./path'
        }
      }
      if (parsed.error) {
        return { success: false, error: parsed.error }
      }

      const result = await withPluginStateLock(() => addMarketplaceSource(parsed))
      return {
        success: true,
        message: result.alreadyMaterialized
          ? `Marketplace '${result.name}' already exists`
          : `Marketplace '${result.name}' added successfully`
      }
    } catch (err) {
      return { success: false, error: err.message || 'Failed to add marketplace' }
    }
  }

  async removeMarketplace(name) {
    if (!name || typeof name !== 'string') {
      return { success: false, error: 'Invalid marketplace name' }
    }

    try {
      await withPluginStateLock(() => removeMarketplaceSource(name))
      return { success: true, message: `Marketplace '${name}' removed successfully` }
    } catch (err) {
      return { success: false, error: err.message || 'Failed to remove marketplace' }
    }
  }

  async updateMarketplace(name) {
    try {
      if (name && typeof name === 'string') {
        await withPluginStateLock(() => refreshMarketplace(name))
        return { success: true, message: `Marketplace '${name}' updated successfully` }
      }
      await withPluginStateLock(() => refreshAllMarketplaces())
      return { success: true, message: 'All marketplaces updated successfully' }
    } catch (err) {
      return { success: false, error: err.message || 'Failed to update marketplace' }
    }
  }
}

module.exports = { PluginService }
