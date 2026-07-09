/**
 * Claude Code profile/config paths used by cc-desktop.
 *
 * Project-local `.claude` folders intentionally remain under the project root.
 * These helpers only cover the user/global Claude Code profile that should be
 * isolated from the user's own Claude Code installation.
 */

const os = require('os')
const path = require('path')
const fs = require('fs')

const DEFAULT_CLAUDE_CONFIG_DIR = path.join(os.homedir(), '.hydrocoder', 'agent')

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

function getClaudeConfigDir(configManager = configuredConfigManager) {
  const configuredValue = expandHome(getConfiguredDirValue(configManager))
  return path.resolve(configuredValue || DEFAULT_CLAUDE_CONFIG_DIR)
}

function buildClaudeConfigEnv(configManager = configuredConfigManager) {
  return {
    CLAUDE_CONFIG_DIR: getClaudeConfigDir(configManager)
  }
}

function ensureClaudeConfigDir(configManager = configuredConfigManager) {
  const claudeConfigDir = getClaudeConfigDir(configManager)

  if (fs.existsSync(claudeConfigDir)) {
    const stat = fs.statSync(claudeConfigDir)
    if (!stat.isDirectory()) {
      throw new Error(`HydroAgent config path exists but is not a directory: ${claudeConfigDir}`)
    }
    return claudeConfigDir
  }

  fs.mkdirSync(claudeConfigDir, { recursive: true })
  return claudeConfigDir
}

function getClaudeJsonPath(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), '.claude.json')
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

function getClaudeHistoryPath(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'history.jsonl')
}

function getClaudeProxySupportDir(configManager = configuredConfigManager) {
  return path.join(getClaudeConfigDir(configManager), 'proxy-support')
}

function getClaudeProxySetupPath(configManager = configuredConfigManager) {
  return path.join(getClaudeProxySupportDir(configManager), 'proxy-setup.cjs')
}

module.exports = {
  DEFAULT_CLAUDE_CONFIG_DIR,
  buildClaudeConfigEnv,
  configureClaudeConfigPaths,
  ensureClaudeConfigDir,
  getClaudeAgentsDir,
  getClaudeConfigDir,
  getClaudeHistoryPath,
  getClaudeJsonPath,
  getClaudePluginsDir,
  getClaudeProjectsDir,
  getClaudeProxySetupPath,
  getClaudeProxySupportDir,
  getClaudeSettingsPath,
  getClaudeSkillsDir
}
