const BOOTSTRAP_I18N = {
  'zh-CN': {
    app: {
      windowTitles: {
        main: 'JSHP Desktop',
        modelSettings: '模型配置 - JSHP Desktop',
        profileManager: 'API 配置管理 - JSHP Desktop',
        globalSettings: '全局设置 - JSHP Desktop',
        appearanceSettings: '外观设置 - JSHP Desktop',
        hydrologyWorkbench: '水文站工作台 - JSHP Desktop',
        channelSettings: '渠道配置 - JSHP Desktop',
        dingtalkSettings: '钉钉桥接设置 - JSHP Desktop',
        providerManager: '服务商管理 - JSHP Desktop',
        sessionManager: '会话查询 - JSHP Desktop',
        settingsWorkbench: '能力管理 - JSHP Desktop',
        updateManager: '应用更新 - JSHP Desktop'
      }
    },
    bootstrap: {
      vueError: 'Vue 错误',
      initializationError: '初始化错误'
    }
  },
  'en-US': {
    app: {
      windowTitles: {
        main: 'JSHP Desktop',
        modelSettings: 'Model Settings - JSHP Desktop',
        profileManager: 'API Profile Manager - JSHP Desktop',
        globalSettings: 'Global Settings - JSHP Desktop',
        appearanceSettings: 'Appearance Settings - JSHP Desktop',
        hydrologyWorkbench: 'Hydrology Workbench - JSHP Desktop',
        channelSettings: 'Channel Settings - JSHP Desktop',
        dingtalkSettings: 'DingTalk Bridge Settings - JSHP Desktop',
        providerManager: 'Provider Manager - JSHP Desktop',
        sessionManager: 'Session Browser - JSHP Desktop',
        settingsWorkbench: 'Capability Management - JSHP Desktop',
        updateManager: 'Application Update - JSHP Desktop'
      }
    },
    bootstrap: {
      vueError: 'Vue Error',
      initializationError: 'Initialization Error'
    }
  }
}

const DEFAULT_LOCALE = 'en-US'

const readLocale = () => {
  if (typeof document === 'undefined') return DEFAULT_LOCALE
  return document.documentElement.getAttribute('data-locale') || DEFAULT_LOCALE
}

const resolveKeyPath = (target, key) => (
  String(key || '')
    .split('.')
    .reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), target)
)

const translate = (key, params = {}) => {
  const locale = readLocale()
  const messages = BOOTSTRAP_I18N[locale] || BOOTSTRAP_I18N[DEFAULT_LOCALE]
  const fallbackMessages = BOOTSTRAP_I18N[DEFAULT_LOCALE]
  const template = resolveKeyPath(messages, key) || resolveKeyPath(fallbackMessages, key) || key

  if (typeof template !== 'string') return key

  return template.replace(/\{(\w+)\}/g, (_, name) => (
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  ))
}

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;')

export function setPageTitle(pageKey) {
  if (typeof document === 'undefined') return
  document.title = translate(`app.windowTitles.${pageKey}`)
}

export function renderBootstrapError(errorType, err) {
  if (typeof document === 'undefined') return

  const appRoot = document.getElementById('app')
  if (!appRoot) return

  const errorTitleKey = errorType === 'vue' ? 'bootstrap.vueError' : 'bootstrap.initializationError'
  const errorTitle = translate(errorTitleKey)
  const message = err?.message || String(err || '')
  const stack = err?.stack || ''
  const content = [message, stack].filter(Boolean).join('\n')

  appRoot.innerHTML = `
    <div style="padding: 20px; color: red;">
      <h2>${escapeHtml(errorTitle)}</h2>
      <pre>${escapeHtml(content)}</pre>
    </div>
  `
}
