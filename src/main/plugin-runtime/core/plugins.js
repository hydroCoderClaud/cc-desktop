const fs = require('fs')
const path = require('path')
const {
  getInstallationByScope,
  getInstallations,
  isInstallPathReferenced,
  listInstalledPlugins,
  readInstalledRegistry,
  writeInstalledRegistry
} = require('./installed-registry')
const {
  getPluginTempDir,
  getPluginsDir,
  getSettingsPath,
  getVersionedCachePath,
  ensureDir,
  readJsonSafe,
  shortSha,
  splitPluginId,
  writeJsonSafe
} = require('./paths')
const { getKnownMarketplaces, readMarketplaceManifest } = require('./marketplaces')
const { runGit } = require('../adapters/process')

function parsePluginId(pluginId) {
  const parsed = splitPluginId(pluginId)
  if (!parsed.name || !parsed.marketplace) {
    throw new Error('Plugin ID must be in the format "plugin@marketplace"')
  }
  return parsed
}

function readSettings() {
  return readJsonSafe(getSettingsPath(), {})
}

function writeSettings(settings) {
  writeJsonSafe(getSettingsPath(), settings || {})
}

function setPluginEnabled(pluginId, enabled) {
  const settings = readSettings()
  const enabledPlugins = { ...(settings.enabledPlugins || {}) }

  if (enabled === undefined) {
    delete enabledPlugins[pluginId]
  } else {
    enabledPlugins[pluginId] = enabled
  }

  if (Object.keys(enabledPlugins).length > 0) {
    settings.enabledPlugins = enabledPlugins
  } else {
    delete settings.enabledPlugins
  }

  writeSettings(settings)
}

function createTempDir(prefix = 'plugin') {
  ensureDir(getPluginTempDir())
  return fs.mkdtempSync(path.join(getPluginTempDir(), `${prefix}-`))
}

function cleanupPath(targetPath) {
  if (!targetPath) return
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } catch {
    // Best effort cleanup only.
  }
}

function resolveMarketplaceBasePath(installLocation) {
  const stats = fs.statSync(installLocation)
  return stats.isDirectory() ? installLocation : path.dirname(installLocation)
}

function resolvePathWithinBase(basePath, relativePath) {
  const resolvedPath = path.resolve(basePath, relativePath)
  const normalizedBase = path.resolve(basePath) + path.sep
  if (
    !resolvedPath.startsWith(normalizedBase) &&
    resolvedPath !== path.resolve(basePath)
  ) {
    throw new Error(`Plugin source escapes marketplace directory: ${relativePath}`)
  }
  return resolvedPath
}

function readPluginManifest(pluginPath) {
  const manifestPath = path.join(pluginPath, '.claude-plugin', 'plugin.json')
  if (!fs.existsSync(manifestPath)) return null
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
  } catch {
    return null
  }
}

async function getGitCommitSha(cwd) {
  try {
    const result = await runGit(['rev-parse', 'HEAD'], { cwd, timeout: 20000 })
    return result.stdout.trim() || undefined
  } catch {
    return undefined
  }
}

async function checkoutRepository(repoPath, { ref, sha }) {
  const targetRef = sha || ref
  if (!targetRef) return

  try {
    await runGit(['fetch', '--depth', '1', 'origin', targetRef], {
      cwd: repoPath,
      timeout: 120000
    })
  } catch {
    // Some remotes do not support shallow fetch by arbitrary ref/sha.
  }

  await runGit(['checkout', targetRef], { cwd: repoPath, timeout: 120000 })
}

async function cloneRepository(gitUrl, options = {}) {
  const tempDir = createTempDir('plugin-repo')
  await runGit(['clone', '--depth', '1', gitUrl, tempDir], { timeout: 120000 })
  await checkoutRepository(tempDir, options)
  return tempDir
}

function deriveVersion(entry, manifest, gitCommitSha, sourceSha) {
  if (manifest?.version && typeof manifest.version === 'string') {
    return manifest.version.trim()
  }

  if (entry?.version && typeof entry.version === 'string') {
    return entry.version.trim()
  }

  if (sourceSha) {
    return shortSha(sourceSha)
  }

  if (gitCommitSha) {
    return shortSha(gitCommitSha)
  }

  return 'unknown'
}

async function getAvailableVersion(entry, marketplaceInstallLocation) {
  if (typeof entry?.source === 'string') {
    try {
      const basePath = resolveMarketplaceBasePath(marketplaceInstallLocation)
      const pluginPath = resolvePathWithinBase(basePath, entry.source)
      const manifest = readPluginManifest(pluginPath)
      const gitCommitSha = await getGitCommitSha(pluginPath)
      return deriveVersion(entry, manifest, gitCommitSha)
    } catch {
      return entry?.version || 'unknown'
    }
  }

  const source = entry?.source || {}
  return deriveVersion(entry, null, undefined, source.sha)
}

async function resolvePlugin(pluginId) {
  const { name, marketplace } = parsePluginId(pluginId)
  const knownMarketplaces = getKnownMarketplaces()
  const marketplaceConfig = knownMarketplaces[marketplace]

  if (!marketplaceConfig) {
    throw new Error(`Marketplace "${marketplace}" is not registered`)
  }

  const manifest = readMarketplaceManifest(marketplaceConfig.installLocation)
  const entry = (manifest.plugins || []).find(plugin => plugin?.name === name)

  if (!entry) {
    throw new Error(`Plugin "${name}" not found in marketplace "${marketplace}"`)
  }

  return {
    pluginId,
    pluginName: name,
    marketplaceName: marketplace,
    entry,
    marketplaceInstallLocation: marketplaceConfig.installLocation,
    marketplaceManifest: manifest
  }
}

async function preparePluginSource(entry, marketplaceInstallLocation) {
  let tempDir

  try {
    if (typeof entry.source === 'string') {
      const basePath = resolveMarketplaceBasePath(marketplaceInstallLocation)
      const pluginPath = resolvePathWithinBase(basePath, entry.source)
      if (!fs.existsSync(pluginPath) || !fs.statSync(pluginPath).isDirectory()) {
        throw new Error(`Plugin source not found: ${pluginPath}`)
      }

      const manifest = readPluginManifest(pluginPath)
      const gitCommitSha = await getGitCommitSha(pluginPath)

      return {
        pluginPath,
        cleanup: null,
        manifest,
        gitCommitSha,
        version: deriveVersion(entry, manifest, gitCommitSha)
      }
    }

    const source = entry.source || {}
    if (source.source === 'github') {
      tempDir = await cloneRepository(`https://github.com/${source.repo}.git`, source)
      const manifest = readPluginManifest(tempDir)
      const gitCommitSha = (await getGitCommitSha(tempDir)) || source.sha
      return {
        pluginPath: tempDir,
        cleanup: tempDir,
        manifest,
        gitCommitSha,
        version: deriveVersion(entry, manifest, gitCommitSha, source.sha)
      }
    }

    if (source.source === 'url' || source.source === 'git') {
      tempDir = await cloneRepository(source.url, source)
      const manifest = readPluginManifest(tempDir)
      const gitCommitSha = (await getGitCommitSha(tempDir)) || source.sha
      return {
        pluginPath: tempDir,
        cleanup: tempDir,
        manifest,
        gitCommitSha,
        version: deriveVersion(entry, manifest, gitCommitSha, source.sha)
      }
    }

    if (source.source === 'git-subdir') {
      tempDir = await cloneRepository(source.url, source)
      const pluginPath = resolvePathWithinBase(tempDir, source.path || '.')
      if (!fs.existsSync(pluginPath) || !fs.statSync(pluginPath).isDirectory()) {
        throw new Error(`Plugin subdirectory not found: ${source.path}`)
      }
      const manifest = readPluginManifest(pluginPath)
      const gitCommitSha = (await getGitCommitSha(tempDir)) || source.sha
      return {
        pluginPath,
        cleanup: tempDir,
        manifest,
        gitCommitSha,
        version: deriveVersion(entry, manifest, gitCommitSha, source.sha)
      }
    }

    if (source.source === 'directory') {
      if (!fs.existsSync(source.path) || !fs.statSync(source.path).isDirectory()) {
        throw new Error(`Plugin directory not found: ${source.path}`)
      }
      const manifest = readPluginManifest(source.path)
      const gitCommitSha = await getGitCommitSha(source.path)
      return {
        pluginPath: source.path,
        cleanup: null,
        manifest,
        gitCommitSha,
        version: deriveVersion(entry, manifest, gitCommitSha, source.sha)
      }
    }

    throw new Error(`Unsupported plugin source type: ${source.source || 'unknown'}`)
  } catch (error) {
    if (tempDir) {
      cleanupPath(tempDir)
    }
    throw error
  }
}

function copyPluginDirectory(sourcePath, targetPath) {
  if (!fs.existsSync(sourcePath) || !fs.statSync(sourcePath).isDirectory()) {
    throw new Error(`Plugin directory not found: ${sourcePath}`)
  }

  ensureDir(path.dirname(targetPath))
  cleanupPath(targetPath)
  fs.cpSync(sourcePath, targetPath, {
    recursive: true,
    force: true,
    filter: currentPath => path.basename(currentPath) !== '.git'
  })
}

function removeOrphanedInstallPaths(paths, registry, ignorePluginId) {
  const uniquePaths = [...new Set((paths || []).filter(Boolean))]
  const pluginsDir = getPluginsDir()

  for (const installPath of uniquePaths) {
    if (!installPath.startsWith(pluginsDir)) continue
    if (isInstallPathReferenced(installPath, registry, ignorePluginId)) continue
    cleanupPath(installPath)
  }
}

function cleanupPluginData(pluginId) {
  const dataDir = path.join(getPluginsDir(), 'data', String(pluginId).replace(/[^a-zA-Z0-9\-_]/g, '-'))
  cleanupPath(dataDir)
}

async function listAvailablePlugins() {
  try {
    const knownMarketplaces = getKnownMarketplaces()
    const available = []

    for (const [marketplaceName, config] of Object.entries(knownMarketplaces)) {
      try {
        const manifest = readMarketplaceManifest(config.installLocation)
        for (const entry of manifest.plugins || []) {
          if (!entry || typeof entry.name !== 'string' || !entry.name.trim()) continue
          const version = await getAvailableVersion(entry, config.installLocation)
          available.push({
            pluginId: `${entry.name}@${marketplaceName}`,
            name: entry.name,
            description: entry.description || '',
            marketplaceName,
            version: version === 'unknown' ? '' : version,
            installCount: typeof entry.installCount === 'number' ? entry.installCount : undefined
          })
        }
      } catch (error) {
        console.warn(
          `[PluginService] Failed to read marketplace "${marketplaceName}":`,
          error.message
        )
      }
    }

    available.sort((a, b) => a.name.localeCompare(b.name))

    return {
      success: true,
      installed: listInstalledPlugins(),
      available
    }
  } catch (error) {
    return {
      success: false,
      error: error.message || 'Failed to list available plugins',
      installed: [],
      available: []
    }
  }
}

async function installPlugin(pluginId) {
  const resolved = await resolvePlugin(pluginId)
  const source = await preparePluginSource(
    resolved.entry,
    resolved.marketplaceInstallLocation
  )

  try {
    const registry = readInstalledRegistry()
    const previousInstallations = getInstallations(pluginId, registry)
    const previousUserInstallation =
      previousInstallations.find(entry => entry.scope === 'user') || null
    const otherInstallations = previousInstallations.filter(entry => entry.scope !== 'user')
    const targetPath = getVersionedCachePath(pluginId, source.version)

    if (!fs.existsSync(targetPath)) {
      copyPluginDirectory(source.pluginPath, targetPath)
    }

    const now = new Date().toISOString()
    registry.plugins[pluginId] = [
      {
        scope: 'user',
        installPath: targetPath,
        version: source.version,
        installedAt: previousUserInstallation?.installedAt || now,
        lastUpdated: now,
        ...(source.gitCommitSha ? { gitCommitSha: source.gitCommitSha } : {})
      },
      ...otherInstallations
    ]

    writeInstalledRegistry(registry)
    setPluginEnabled(pluginId, true)

    if (
      previousUserInstallation &&
      previousUserInstallation.installPath &&
      previousUserInstallation.installPath !== targetPath
    ) {
      removeOrphanedInstallPaths([previousUserInstallation.installPath], registry)
    }

    return {
      success: true,
      message: previousUserInstallation
        ? `Plugin "${pluginId}" installed and enabled`
        : `Plugin "${pluginId}" installed successfully`
    }
  } finally {
    cleanupPath(source.cleanup)
  }
}

async function uninstallPlugin(pluginId) {
  parsePluginId(pluginId)

  const registry = readInstalledRegistry()
  const installations = getInstallations(pluginId, registry)
  const userInstallation = getInstallationByScope(pluginId, 'user', registry)
  if (installations.length === 0 || !userInstallation) {
    return {
      success: false,
      error: `Plugin "${pluginId}" is not installed in user scope`
    }
  }

  const remainingInstallations = installations.filter(entry => entry.scope !== 'user')
  if (remainingInstallations.length > 0) {
    registry.plugins[pluginId] = remainingInstallations
  } else {
    delete registry.plugins[pluginId]
  }
  writeInstalledRegistry(registry)
  setPluginEnabled(pluginId, undefined)
  removeOrphanedInstallPaths([userInstallation.installPath], registry)
  if (!registry.plugins[pluginId] || registry.plugins[pluginId].length === 0) {
    cleanupPluginData(pluginId)
  }

  return {
    success: true,
    message: `Plugin "${pluginId}" uninstalled successfully`
  }
}

async function updatePlugin(pluginId) {
  const registry = readInstalledRegistry()
  const installations = getInstallations(pluginId, registry)
  const userInstallation = getInstallationByScope(pluginId, 'user', registry)
  if (installations.length === 0 || !userInstallation) {
    return {
      success: false,
      error: `Plugin "${pluginId}" is not installed in user scope`
    }
  }

  const resolved = await resolvePlugin(pluginId)
  const source = await preparePluginSource(
    resolved.entry,
    resolved.marketplaceInstallLocation
  )

  try {
    const targetPath = getVersionedCachePath(pluginId, source.version)
    const alreadyUpToDate =
      userInstallation.version === source.version &&
      userInstallation.installPath === targetPath &&
      fs.existsSync(userInstallation.installPath)

    if (alreadyUpToDate) {
      return {
        success: true,
        message: `Plugin "${pluginId}" is already up to date`
      }
    }

    if (!fs.existsSync(targetPath)) {
      copyPluginDirectory(source.pluginPath, targetPath)
    }

    const now = new Date().toISOString()
    const oldPaths = [userInstallation.installPath].filter(Boolean)
    registry.plugins[pluginId] = installations.map(entry => ({
      ...entry,
      ...(entry.scope === 'user'
        ? {
            installPath: targetPath,
            version: source.version,
            lastUpdated: now,
            ...(source.gitCommitSha ? { gitCommitSha: source.gitCommitSha } : {})
          }
        : {})
    }))

    writeInstalledRegistry(registry)
    removeOrphanedInstallPaths(oldPaths.filter(item => item !== targetPath), registry)

    return {
      success: true,
      message: `Plugin "${pluginId}" updated successfully`
    }
  } finally {
    cleanupPath(source.cleanup)
  }
}

module.exports = {
  installPlugin,
  listAvailablePlugins,
  uninstallPlugin,
  updatePlugin
}
