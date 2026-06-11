const DEFAULT_DESKTOP_INTERVENTION_LABEL = '桌面端介入'

function normalizeDesktopInterventionLabel(value) {
  if (typeof value !== 'string') return ''
  return value
    .trim()
    .replace(/[\s:：>＞]+$/g, '')
}

function resolveDesktopInterventionLabel(configOrManager = null) {
  let config = configOrManager
  if (configOrManager && typeof configOrManager.getConfig === 'function') {
    config = configOrManager.getConfig()
  }
  const configuredLabel = normalizeDesktopInterventionLabel(
    config?.imCommon?.desktopInterventionLabel
  )
  return configuredLabel || DEFAULT_DESKTOP_INTERVENTION_LABEL
}

function buildDesktopInterventionText(configOrManager = null, {
  userContent = '',
  fullText = '',
} = {}) {
  const label = resolveDesktopInterventionLabel(configOrManager)
  const lines = [`${label}：`]
  if (userContent) {
    lines.push(String(userContent).split('\n').map(line => `> ${line}`).join('\n'))
  }
  if (fullText) {
    lines.push('')
    lines.push(fullText)
  }
  return lines.join('\n')
}

module.exports = {
  DEFAULT_DESKTOP_INTERVENTION_LABEL,
  normalizeDesktopInterventionLabel,
  resolveDesktopInterventionLabel,
  buildDesktopInterventionText,
}
