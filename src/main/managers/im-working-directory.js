const os = require('os')
const path = require('path')

const DEFAULT_AGENT_OUTPUT_DIR_NAME = 'cc-desktop-agent-output'

const IM_WORKSPACE_SUBDIRS = {
  dingtalk: 'dingtalk',
  feishu: 'feishu',
  'enterprise-weixin': 'enterpriseweixin',
  enterpriseWeixin: 'enterpriseweixin',
  weixin: 'weixin',
}

const SESSION_APP_WORKSPACE_SUBDIR = 'sessionapp'

function getAgentOutputBaseDir(config = {}) {
  const configuredDir = typeof config?.settings?.agent?.outputBaseDir === 'string'
    ? config.settings.agent.outputBaseDir.trim()
    : ''
  if (configuredDir) {
    return configuredDir
  }
  return path.join(os.homedir(), DEFAULT_AGENT_OUTPUT_DIR_NAME)
}

function getImWorkspaceSubdir(imKey) {
  return IM_WORKSPACE_SUBDIRS[imKey] || String(imKey || 'desktop').trim() || 'desktop'
}

function getImDefaultWorkspaceRoot(config = {}, imKey, configKey = imKey) {
  const configuredDir = typeof config?.[configKey]?.defaultCwd === 'string'
    ? config[configKey].defaultCwd.trim()
    : ''
  if (configuredDir) {
    return configuredDir
  }
  return path.join(getAgentOutputBaseDir(config), getImWorkspaceSubdir(imKey))
}

function getSessionAppDefaultWorkspaceRoot(config = {}) {
  return path.join(getAgentOutputBaseDir(config), SESSION_APP_WORKSPACE_SUBDIR)
}

module.exports = {
  DEFAULT_AGENT_OUTPUT_DIR_NAME,
  IM_WORKSPACE_SUBDIRS,
  SESSION_APP_WORKSPACE_SUBDIR,
  getAgentOutputBaseDir,
  getImWorkspaceSubdir,
  getImDefaultWorkspaceRoot,
  getSessionAppDefaultWorkspaceRoot,
}
