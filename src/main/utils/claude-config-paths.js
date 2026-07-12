/**
 * Claude Code profile/config paths used by cc-desktop.
 *
 * Project-local `.claude` folders intentionally remain under the project root.
 * These helpers only cover the user/global Claude Code profile. An empty app
 * setting preserves Claude Code defaults; a non-empty setting isolates it.
 */

const os = require('os')
const path = require('path')
const fs = require('fs')

const DEFAULT_CLAUDE_CONFIG_DIR = ''
const LEGACY_CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.claude')
const LEGACY_CLAUDE_JSON_PATH = path.join(os.homedir(), '.claude.json')
const SUGGESTED_CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.hydrocoder', 'agent')

let configuredConfigManager = null

function configureClaudeConfigPaths({ configManager } = {}) {
  configuredConfigManager = configManager || null
}

function expandHome(inputPath) {
  if (typeof inputPath !== 'string') return ''
  const value = inputPath.trim()
  if (!value) return ''
  if (value === '~') return os.homedir()
  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/') || value.startsWith('~\\')) {
    return path.join(os.homedir(), value.slice(2))
  }
  return value
}

function getConfiguredDirValue(configManager = configuredConfigManager) {
  try {
    return configManager?.getConfig?.()?.settings?.agent?.claudeConfigDir
  } catch {
    return ''
  }
}

function getConfiguredClaudeConfigDir(configManager = configuredConfigManager) {
  const configuredValue = expandHome(getConfiguredDirValue(configManager))
  return configuredValue ? path.resolve(configuredValue) : ''
}

function validateClaudeConfigDirValue(inputPath, options = {}) {
  const configuredValue = typeof inputPath === 'string' ? inputPath.trim() : ''
  const resolvedDir = configuredValue ? path.resolve(expandHome(configuredValue)) : ''
  if (!resolvedDir) {
    return { configuredValue: '', resolvedDir: '' }
  }

  const create = options.create !== false
  const checkWritable = options.checkWritable !== false

  if (fs.existsSync(resolvedDir)) {
    const stat = fs.statSync(resolvedDir)
    if (!stat.isDirectory()) {
      throw new Error(`HydroAgent config path exists but is not a directory: ${resolvedDir}`)
    }
  } else if (create) {
    fs.mkdirSync(resolvedDir, { recursive: true })
  }

  if (checkWritable) {
    const probePath = path.join(
      resolvedDir,
      `.hydro-agent-write-test-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    )
    try {
      fs.writeFileSync(probePath, 'ok', { flag: 'wx' })
    } catch (error) {
      throw new Error(`HydroAgent config directory is not writable: ${resolvedDir} (${error.message})`)
    } finally {
      try {
        if (fs.existsSync(probePath)) {
          fs.unlinkSync(probePath)
        }
      } catch {
        // Best effort cleanup for the write probe.
      }
    }
  }

  return { configuredValue, resolvedDir }
}

function isClaudeConfigIsolated(configManager = configuredConfigManager) {
  return Boolean(getConfiguredClaudeConfigDir(configManager))
}

function getClaudeConfigDir(configManager = configuredConfigManager) {
  return getConfiguredClaudeConfigDir(configManager) || LEGACY_CLAUDE_CONFIG_DIR
}

function buildClaudeConfigEnv(configManager = configuredConfigManager) {
  const configuredDir = getConfiguredClaudeConfigDir(configManager)
  return configuredDir ? { CLAUDE_CONFIG_DIR: configuredDir } : {}
}

function ensureClaudeConfigDir(configManager = configuredConfigManager) {
  const { resolvedDir } = validateClaudeConfigDirValue(getConfiguredDirValue(configManager), {
    create: true,
    checkWritable: false
  })
  if (!resolvedDir) {
    return null
  }
  return resolvedDir
}

function getClaudeJsonPath(configManager = configuredConfigManager) {
  const configuredDir = getConfiguredClaudeConfigDir(configManager)
  return configuredDir ? path.join(configuredDir, '.claude.json') : LEGACY_CLAUDE_JSON_PATH
}

function getClaudeSettingsPath(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'settings.json')
}

function getClaudePluginsDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'plugins')
}

function getClaudeSkillsDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'skills')
}

function getClaudeAgentsDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'agents')
}

function getClaudeProjectsDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'projects')
}

function getClaudeProxySupportDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'proxy-support')
}

function getClaudeProxySetupPath(configManager = configuredConfigManager) {
  return path.join(getClaudeProxySupportDir(configManager), 'proxy-setup.cjs')
}

module.exports = {
  DEFAULT_CLAUDE_CONFIG_DIR,
  LEGACY_CLAUDE_CONFIG_DIR,
  LEGACY_CLAUDE_JSON_PATH,
  SUGGESTED_CLAUDE_CONFIG_DIR,
  buildClaudeConfigEnv,
  configureClaudeConfigPaths,
  ensureClaudeConfigDir,
  getClaudeAgentsDir,
  getClaudeConfigDir,
  getConfiguredClaudeConfigDir,
  getClaudeJsonPath,
  getClaudePluginsDir,
  getClaudeProjectsDir,
  getClaudeProxySetupPath,
  getClaudeProxySupportDir,
  getClaudeSettingsPath,
  getClaudeSkillsDir,
  isClaudeConfigIsolated,
  validateClaudeConfigDirValue
}
