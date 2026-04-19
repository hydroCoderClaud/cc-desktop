const fs = require('fs')
const os = require('os')
const path = require('path')
const { atomicWriteJson } = require('../../utils/path-utils')

function getClaudeDir() {
  return path.join(os.homedir(), '.claude')
}

function getPluginsDir() {
  return path.join(getClaudeDir(), 'plugins')
}

function getPluginCacheDir() {
  return path.join(getPluginsDir(), 'cache')
}

function getPluginTempDir() {
  return path.join(getPluginsDir(), '.tmp')
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

function sanitizePluginId(pluginId) {
  return String(pluginId || '').replace(/[^a-zA-Z0-9\-_]/g, '-')
}

function sanitizePathSegment(value, fallback = 'unknown') {
  const sanitized = String(value || '')
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '-')
    .replace(/\s+/g, '-')
  return sanitized || fallback
}

function splitPluginId(pluginId) {
  const atIndex = String(pluginId || '').lastIndexOf('@')
  if (atIndex <= 0) {
    return {
      name: String(pluginId || ''),
      marketplace: ''
    }
  }

  return {
    name: pluginId.slice(0, atIndex),
    marketplace: pluginId.slice(atIndex + 1)
  }
}

function getVersionedCachePath(pluginId, version) {
  const { name, marketplace } = splitPluginId(pluginId)
  return path.join(
    getPluginCacheDir(),
    sanitizePathSegment(marketplace || 'unknown-marketplace'),
    sanitizePathSegment(name || 'unknown-plugin'),
    sanitizePathSegment(version || 'unknown')
  )
}

function shortSha(value) {
  const trimmed = String(value || '').trim()
  if (!trimmed) return ''
  return trimmed.slice(0, 12)
}

module.exports = {
  ensureDir,
  getClaudeDir,
  getPluginCacheDir,
  getPluginTempDir,
  getPluginsDir,
  getInstalledPluginsPath,
  getSettingsPath,
  getVersionedCachePath,
  readJsonSafe,
  sanitizePathSegment,
  sanitizePluginId,
  shortSha,
  splitPluginId,
  writeJsonSafe
}
