const fs = require('fs')
const os = require('os')
const path = require('path')
const { fetch } = require('undici')
const { atomicWriteJson } = require('../../utils/path-utils')
const { runGit } = require('../adapters/process')
const { formatMarketplaceSource } = require('./source')

function getClaudeDir() {
  return path.join(os.homedir(), '.claude')
}

function getPluginsDir() {
  return path.join(getClaudeDir(), 'plugins')
}

function getMarketplacesCacheDir() {
  return path.join(getPluginsDir(), 'marketplaces')
}

function getKnownMarketplacesPath() {
  return path.join(getPluginsDir(), 'known_marketplaces.json')
}

function getInstalledPluginsPath() {
  return path.join(getPluginsDir(), 'installed_plugins.json')
}

function getSettingsPath() {
  return path.join(getClaudeDir(), 'settings.json')
}

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function readJsonSafe(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
  } catch {
    return fallback
  }
}

function writeJsonSafe(filePath, data) {
  ensureDir(path.dirname(filePath))
  atomicWriteJson(filePath, data)
}

function normalizeSource(source) {
  if (!source) return source
  if ((source.source === 'file' || source.source === 'directory') && source.path) {
    return { ...source, path: path.resolve(source.path) }
  }
  return source
}

function getKnownMarketplaces() {
  return readJsonSafe(getKnownMarketplacesPath(), {})
}

function saveKnownMarketplaces(config) {
  writeJsonSafe(getKnownMarketplacesPath(), config)
}

function readMarketplaceManifest(installLocation) {
  const nestedPath = path.join(installLocation, '.claude-plugin', 'marketplace.json')
  const directPath = installLocation

  for (const candidate of [nestedPath, directPath]) {
    try {
      if (!fs.existsSync(candidate)) continue
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8'))
      validateMarketplaceManifest(parsed, candidate)
      return parsed
    } catch {
      // Try next candidate.
    }
  }

  throw new Error(`marketplace.json not found or invalid at ${installLocation}`)
}

function validateMarketplaceManifest(data, sourcePath = 'marketplace.json') {
  if (!data || typeof data !== 'object') {
    throw new Error(`Invalid marketplace manifest at ${sourcePath}: expected object`)
  }
  if (typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error(`Invalid marketplace manifest at ${sourcePath}: missing name`)
  }
  if (!Array.isArray(data.plugins)) {
    throw new Error(`Invalid marketplace manifest at ${sourcePath}: plugins must be an array`)
  }
  return data
}

async function cloneMarketplaceRepo(gitUrl, targetPath, ref) {
  ensureDir(path.dirname(targetPath))
  await runGit(['clone', '--depth', '1', gitUrl, targetPath], { timeout: 120000 })
  if (ref) {
    await runGit(['fetch', '--depth', '1', 'origin', ref], { cwd: targetPath, timeout: 120000 })
    await runGit(['checkout', ref], { cwd: targetPath, timeout: 120000 })
  }
}

async function pullMarketplaceRepo(targetPath, ref) {
  if (ref) {
    await runGit(['fetch', 'origin', ref], { cwd: targetPath, timeout: 120000 })
    await runGit(['checkout', ref], { cwd: targetPath, timeout: 120000 })
    await runGit(['pull', 'origin', ref], { cwd: targetPath, timeout: 120000 })
    return
  }
  await runGit(['pull'], { cwd: targetPath, timeout: 120000 })
}

async function fetchMarketplaceJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json,text/plain;q=0.9,*/*;q=0.8' }
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch marketplace: ${response.status} ${response.statusText}`)
  }
  const text = await response.text()
  const parsed = JSON.parse(text)
  validateMarketplaceManifest(parsed, url)
  return parsed
}

function managedCachePathForName(name, sourceType) {
  return sourceType === 'url'
    ? path.join(getMarketplacesCacheDir(), `${name}.json`)
    : path.join(getMarketplacesCacheDir(), name)
}

function samePath(left, right) {
  if (!left || !right) return false
  return path.resolve(left) === path.resolve(right)
}

function getUniqueManagedCachePath(name, sourceType) {
  const basePath = managedCachePathForName(name, sourceType)
  if (!fs.existsSync(basePath)) {
    return basePath
  }

  const ext = sourceType === 'url' ? '.json' : ''
  const baseName = sourceType === 'url' ? basePath.slice(0, -ext.length) : basePath
  for (let index = 1; index < 1000; index += 1) {
    const candidate = `${baseName}-${index}${ext}`
    if (!fs.existsSync(candidate)) {
      return candidate
    }
  }

  return `${baseName}-${Date.now()}${ext}`
}

function persistManagedDirectory(tempDir, marketplaceName, sourceType) {
  const desiredPath = managedCachePathForName(marketplaceName, sourceType)

  try {
    if (fs.existsSync(desiredPath) && !samePath(tempDir, desiredPath)) {
      fs.rmSync(desiredPath, { recursive: true, force: true })
    }
    if (!samePath(tempDir, desiredPath)) {
      fs.renameSync(tempDir, desiredPath)
    }
    return desiredPath
  } catch (originalError) {
    const fallbackPath = getUniqueManagedCachePath(marketplaceName, sourceType)
    try {
      if (!samePath(tempDir, fallbackPath)) {
        fs.renameSync(tempDir, fallbackPath)
      }
      return fallbackPath
    } catch {
      try {
        fs.cpSync(tempDir, fallbackPath, { recursive: true, force: true })
        fs.rmSync(tempDir, { recursive: true, force: true })
        return fallbackPath
      } catch {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch {
          // no-op
        }
        throw originalError
      }
    }
  }
}

function cleanupManagedMarketplace(entry) {
  if (!entry || !entry.source) return
  const sourceType = entry.source.source
  if (!['github', 'git', 'url'].includes(sourceType)) return
  const target = entry.installLocation
  if (!target) return

  try {
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true })
    }
  } catch {
    // Best effort cleanup only.
  }
}

async function materializeMarketplace(source) {
  const normalized = normalizeSource(source)
  ensureDir(getMarketplacesCacheDir())

  switch (normalized.source) {
    case 'directory': {
      const manifest = readMarketplaceManifest(normalized.path)
      return {
        marketplace: manifest,
        installLocation: normalized.path,
        resolvedSource: normalized
      }
    }
    case 'file': {
      const manifest = validateMarketplaceManifest(
        JSON.parse(fs.readFileSync(normalized.path, 'utf-8')),
        normalized.path
      )
      return {
        marketplace: manifest,
        installLocation: normalized.path,
        resolvedSource: normalized
      }
    }
    case 'url': {
      const marketplace = await fetchMarketplaceJson(normalized.url)
      const installLocation = managedCachePathForName(marketplace.name, 'url')
      writeJsonSafe(installLocation, marketplace)
      return { marketplace, installLocation, resolvedSource: normalized }
    }
    case 'github':
    case 'git': {
      const tempDir = path.join(
        getMarketplacesCacheDir(),
        `.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`
      )
      const gitUrl =
        normalized.source === 'github'
          ? `https://github.com/${normalized.repo}.git`
          : normalized.url

      await cloneMarketplaceRepo(gitUrl, tempDir, normalized.ref)
      const marketplace = readMarketplaceManifest(tempDir)
      try {
        const finalPath = persistManagedDirectory(tempDir, marketplace.name, normalized.source)
        return {
          marketplace,
          installLocation: finalPath,
          resolvedSource: normalized
        }
      } catch (err) {
        try {
          fs.rmSync(tempDir, { recursive: true, force: true })
        } catch {
          // no-op
        }
        throw err
      }
    }
    default:
      throw new Error(`Unsupported marketplace source type: ${normalized.source}`)
  }
}

function updateSettingsForMarketplaceAdd(name, source) {
  const settingsPath = getSettingsPath()
  const settings = readJsonSafe(settingsPath, {})
  const extraKnownMarketplaces = { ...(settings.extraKnownMarketplaces || {}) }
  extraKnownMarketplaces[name] = { source }
  settings.extraKnownMarketplaces = extraKnownMarketplaces
  writeJsonSafe(settingsPath, settings)
}

function updateSettingsForMarketplaceRemoval(name) {
  const settingsPath = getSettingsPath()
  const settings = readJsonSafe(settingsPath, {})

  if (settings.extraKnownMarketplaces && settings.extraKnownMarketplaces[name]) {
    delete settings.extraKnownMarketplaces[name]
    if (Object.keys(settings.extraKnownMarketplaces).length === 0) {
      delete settings.extraKnownMarketplaces
    }
  }

  if (settings.enabledPlugins) {
    const suffix = `@${name}`
    for (const pluginId of Object.keys(settings.enabledPlugins)) {
      if (pluginId.endsWith(suffix)) {
        delete settings.enabledPlugins[pluginId]
      }
    }
    if (Object.keys(settings.enabledPlugins).length === 0) {
      delete settings.enabledPlugins
    }
  }

  writeJsonSafe(settingsPath, settings)
}

function sanitizePluginId(pluginId) {
  return pluginId.replace(/[^a-zA-Z0-9\-_]/g, '-')
}

function removeMarketplacePluginsFromRegistry(name) {
  const installedPath = getInstalledPluginsPath()
  const installed = readJsonSafe(installedPath, { version: 2, plugins: {} })
  const suffix = `@${name}`
  const orphanedPaths = new Set()
  const removedPluginIds = []

  for (const pluginId of Object.keys(installed.plugins || {})) {
    if (!pluginId.endsWith(suffix)) continue
    for (const entry of installed.plugins[pluginId] || []) {
      if (entry.installPath) orphanedPaths.add(entry.installPath)
    }
    delete installed.plugins[pluginId]
    removedPluginIds.push(pluginId)
  }

  writeJsonSafe(installedPath, installed)

  for (const installPath of orphanedPaths) {
    let stillReferenced = false
    for (const installations of Object.values(installed.plugins || {})) {
      if ((installations || []).some(entry => entry.installPath === installPath)) {
        stillReferenced = true
        break
      }
    }
    if (!stillReferenced && installPath && installPath.startsWith(getPluginsDir())) {
      try {
        fs.rmSync(installPath, { recursive: true, force: true })
      } catch {
        // Best effort cleanup.
      }
    }
  }

  for (const pluginId of removedPluginIds) {
    const dataDir = path.join(getPluginsDir(), 'data', sanitizePluginId(pluginId))
    try {
      fs.rmSync(dataDir, { recursive: true, force: true })
    } catch {
      // Best effort cleanup.
    }
  }
}

async function addMarketplaceSource(source) {
  const resolvedSource = normalizeSource(source)
  const config = getKnownMarketplaces()

  for (const [existingName, entry] of Object.entries(config)) {
    if (JSON.stringify(entry.source) === JSON.stringify(resolvedSource)) {
      return {
        name: existingName,
        alreadyMaterialized: true,
        resolvedSource
      }
    }
  }

  const { marketplace, installLocation } = await materializeMarketplace(resolvedSource)
  const previousEntry = config[marketplace.name]
  if (previousEntry) {
    if (!samePath(previousEntry.installLocation, installLocation)) {
      cleanupManagedMarketplace(previousEntry)
    }
  }

  config[marketplace.name] = {
    source: resolvedSource,
    installLocation,
    lastUpdated: new Date().toISOString()
  }
  saveKnownMarketplaces(config)
  updateSettingsForMarketplaceAdd(marketplace.name, resolvedSource)

  return {
    name: marketplace.name,
    alreadyMaterialized: false,
    resolvedSource
  }
}

function listMarketplaces() {
  const config = getKnownMarketplaces()
  return Object.entries(config).map(([name, entry]) => ({
    name,
    source: formatMarketplaceSource(entry.source),
    repo: entry.source?.repo,
    type: entry.source?.source,
    installLocation: entry.installLocation,
    lastUpdated: entry.lastUpdated
  }))
}

async function refreshMarketplace(name) {
  const config = getKnownMarketplaces()
  const entry = config[name]
  if (!entry) {
    throw new Error(`Marketplace '${name}' not found`)
  }

  if (entry.source.source === 'directory') {
    readMarketplaceManifest(entry.source.path)
    config[name] = { ...entry, lastUpdated: new Date().toISOString() }
    saveKnownMarketplaces(config)
    return
  }

  if (entry.source.source === 'file') {
    validateMarketplaceManifest(
      JSON.parse(fs.readFileSync(entry.source.path, 'utf-8')),
      entry.source.path
    )
    config[name] = { ...entry, lastUpdated: new Date().toISOString() }
    saveKnownMarketplaces(config)
    return
  }

  if (entry.source.source === 'url') {
    const marketplace = await fetchMarketplaceJson(entry.source.url)
    const installLocation = managedCachePathForName(marketplace.name, 'url')
    writeJsonSafe(installLocation, marketplace)
    if (marketplace.name !== name) {
      delete config[name]
    }
    config[marketplace.name] = {
      source: entry.source,
      installLocation,
      lastUpdated: new Date().toISOString()
    }
    saveKnownMarketplaces(config)
    return
  }

  const targetPath = entry.installLocation
  if (!targetPath || !fs.existsSync(targetPath)) {
    const { marketplace, installLocation } = await materializeMarketplace(entry.source)
    if (marketplace.name !== name) {
      delete config[name]
    }
    config[marketplace.name] = {
      source: entry.source,
      installLocation,
      lastUpdated: new Date().toISOString()
    }
    saveKnownMarketplaces(config)
    return
  }

  await pullMarketplaceRepo(targetPath, entry.source.ref)
  const marketplace = readMarketplaceManifest(targetPath)
  if (marketplace.name !== name) {
    const newPath = managedCachePathForName(marketplace.name, entry.source.source)
    if (!samePath(newPath, targetPath)) {
      if (fs.existsSync(newPath)) {
        fs.rmSync(newPath, { recursive: true, force: true })
      }
      fs.renameSync(targetPath, newPath)
      delete config[name]
      config[marketplace.name] = {
        source: entry.source,
        installLocation: newPath,
        lastUpdated: new Date().toISOString()
      }
      saveKnownMarketplaces(config)
      return
    }
  }

  config[name] = {
    ...entry,
    lastUpdated: new Date().toISOString()
  }
  saveKnownMarketplaces(config)
}

async function refreshAllMarketplaces() {
  const marketplaces = listMarketplaces()
  for (const marketplace of marketplaces) {
    await refreshMarketplace(marketplace.name)
  }
}

async function removeMarketplaceSource(name) {
  const config = getKnownMarketplaces()
  const entry = config[name]
  if (!entry) {
    throw new Error(`Marketplace '${name}' not found`)
  }

  delete config[name]
  saveKnownMarketplaces(config)

  cleanupManagedMarketplace(entry)
  updateSettingsForMarketplaceRemoval(name)
  removeMarketplacePluginsFromRegistry(name)
}

module.exports = {
  addMarketplaceSource,
  readMarketplaceManifest,
  listMarketplaces,
  refreshMarketplace,
  refreshAllMarketplaces,
  removeMarketplaceSource,
  getKnownMarketplaces,
  validateMarketplaceManifest
}
