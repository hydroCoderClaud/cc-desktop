const {
  getInstalledPluginsPath,
  readJsonSafe,
  writeJsonSafe
} = require('./paths')

function normalizeInstallation(entry) {
  if (!entry || typeof entry !== 'object') return null
  if (!entry.installPath || typeof entry.installPath !== 'string') return null

  return {
    scope: typeof entry.scope === 'string' ? entry.scope : 'user',
    installPath: entry.installPath,
    version: typeof entry.version === 'string' ? entry.version : 'unknown',
    installedAt:
      typeof entry.installedAt === 'string' ? entry.installedAt : new Date().toISOString(),
    lastUpdated:
      typeof entry.lastUpdated === 'string' ? entry.lastUpdated : new Date().toISOString(),
    ...(typeof entry.projectPath === 'string' ? { projectPath: entry.projectPath } : {}),
    ...(typeof entry.gitCommitSha === 'string' ? { gitCommitSha: entry.gitCommitSha } : {})
  }
}

function normalizeRegistry(data) {
  const normalized = {
    version: 2,
    plugins: {}
  }

  if (!data || typeof data !== 'object' || !data.plugins || typeof data.plugins !== 'object') {
    return normalized
  }

  for (const [pluginId, entries] of Object.entries(data.plugins)) {
    if (!Array.isArray(entries)) continue
    const installations = entries.map(normalizeInstallation).filter(Boolean)
    if (installations.length > 0) {
      normalized.plugins[pluginId] = installations
    }
  }

  return normalized
}

function readInstalledRegistry() {
  const data = readJsonSafe(getInstalledPluginsPath(), { version: 2, plugins: {} })
  return normalizeRegistry(data)
}

function writeInstalledRegistry(data) {
  writeJsonSafe(getInstalledPluginsPath(), normalizeRegistry(data))
}

function getInstallations(pluginId, data = readInstalledRegistry()) {
  return data.plugins[pluginId] || []
}

function getInstallationByScope(pluginId, scope, data = readInstalledRegistry()) {
  const installations = getInstallations(pluginId, data)
  return installations.find(entry => entry.scope === scope) || null
}

function getPrimaryInstallation(pluginId, data = readInstalledRegistry()) {
  const installations = getInstallations(pluginId, data)
  if (installations.length === 0) return null

  const priority = ['user', 'project', 'local', 'managed']
  const sorted = [...installations].sort((a, b) => {
    const left = priority.indexOf(a.scope)
    const right = priority.indexOf(b.scope)
    const leftScore = left === -1 ? priority.length : left
    const rightScore = right === -1 ? priority.length : right
    return leftScore - rightScore
  })

  return sorted[0] || null
}

function listInstalledPlugins(data = readInstalledRegistry()) {
  return Object.keys(data.plugins)
    .map(pluginId => {
      const primary = getPrimaryInstallation(pluginId, data)
      if (!primary) return null
      return {
        id: pluginId,
        version: primary.version || 'unknown',
        installPath: primary.installPath,
        installedAt: primary.installedAt
      }
    })
    .filter(Boolean)
}

function isInstallPathReferenced(installPath, data = readInstalledRegistry(), ignorePluginId) {
  for (const [pluginId, installations] of Object.entries(data.plugins)) {
    if (ignorePluginId && pluginId === ignorePluginId) continue
    if ((installations || []).some(entry => entry.installPath === installPath)) {
      return true
    }
  }
  return false
}

module.exports = {
  getInstallationByScope,
  getInstallations,
  getPrimaryInstallation,
  isInstallPathReferenced,
  listInstalledPlugins,
  readInstalledRegistry,
  writeInstalledRegistry
}
