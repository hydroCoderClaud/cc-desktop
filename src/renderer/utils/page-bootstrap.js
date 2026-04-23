const BOOTSTRAP_I18N = {
  'zh-CN': {
    app: {
      windowTitles: {
        main: 'Hydro Desktop',
        profileManager: 'API 配置管理 - Hydro Desktop',
        globalSettings: '全局设置 - Hydro Desktop',
        appearanceSettings: '外观设置 - Hydro Desktop',
        customModels: '自定义模型 - Hydro Desktop',
        dingtalkSettings: '钉钉桥接设置 - Hydro Desktop',
        providerManager: '服务商管理 - Hydro Desktop',
        sessionManager: '会话查询 - Hydro Desktop',
        settingsWorkbench: '能力管理 - Hydro Desktop',
        updateManager: '应用更新 - Hydro Desktop'
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
        main: 'Hydro Desktop',
        profileManager: 'API Profile Manager - Hydro Desktop',
        globalSettings: 'Global Settings - Hydro Desktop',
        appearanceSettings: 'Appearance Settings - Hydro Desktop',
        customModels: 'Custom Models - Hydro Desktop',
        dingtalkSettings: 'DingTalk Bridge Settings - Hydro Desktop',
        providerManager: 'Provider Manager - Hydro Desktop',
        sessionManager: 'Session Browser - Hydro Desktop',
        settingsWorkbench: 'Capability Management - Hydro Desktop',
        updateManager: 'Application Update - Hydro Desktop'
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
