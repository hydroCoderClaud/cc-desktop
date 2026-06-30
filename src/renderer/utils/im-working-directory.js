const DEFAULT_AGENT_OUTPUT_DIR_NAME = 'cc-desktop-agent-output'
const SESSION_APP_WORKSPACE_SUBDIR = 'sessionapp'

const IM_WORKSPACE_SUBDIRS = {
  dingtalk: 'dingtalk',
  feishu: 'feishu',
  enterpriseWeixin: 'enterpriseweixin',
  'enterprise-weixin': 'enterpriseweixin',
  weixin: 'weixin',
}

function normalizeSlashes(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/\/+$/, '')
}

export function getDefaultAgentOutputBaseDir(homeDir = '~') {
  const normalizedHome = normalizeSlashes(homeDir || '~') || '~'
  return `${normalizedHome}/${DEFAULT_AGENT_OUTPUT_DIR_NAME}`
}

export function getImWorkspaceSubdir(imKey) {
  return IM_WORKSPACE_SUBDIRS[imKey] || String(imKey || 'desktop')
}

export function joinDisplayPath(baseDir, subDir) {
  const normalizedBase = normalizeSlashes(baseDir || '')
  const normalizedSub = normalizeSlashes(subDir || '')
  if (!normalizedBase) return normalizedSub
  if (!normalizedSub) return normalizedBase
  return `${normalizedBase}/${normalizedSub}`
}

export function getImDefaultWorkspaceRoot(config = {}, imKey, configKey = imKey) {
  const configuredDir = String(config?.[configKey]?.defaultCwd || '').trim()
  if (configuredDir) {
    return configuredDir
  }
  const outputBaseDir = String(config?.settings?.agent?.outputBaseDir || '').trim()
    || getDefaultAgentOutputBaseDir(window.electronAPI?.getHomedir?.() || '~')
  return joinDisplayPath(outputBaseDir, getImWorkspaceSubdir(imKey))
}

export function getSessionAppDefaultWorkspaceRoot(config = {}) {
  const outputBaseDir = String(config?.settings?.agent?.outputBaseDir || '').trim()
    || getDefaultAgentOutputBaseDir(window.electronAPI?.getHomedir?.() || '~')
  return joinDisplayPath(outputBaseDir, SESSION_APP_WORKSPACE_SUBDIR)
}
