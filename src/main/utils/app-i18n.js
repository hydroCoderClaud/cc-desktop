const MAIN_I18N = {
  'zh-CN': {
    app: {
      modes: {
        developer: 'Hydro Coder',
        agent: 'Hydro Agent',
        notebook: 'Hydro Notebook'
      },
      windows: {
        main: 'Hydro Desktop',
        profileManager: 'API 配置管理 - Hydro Desktop',
        globalSettings: '全局设置 - Hydro Desktop',
        appearanceSettings: '外观设置 - Hydro Desktop',
        settingsWorkbench: '能力管理 - Hydro Desktop',
        providerManager: '服务商管理 - Hydro Desktop',
        sessionManager: '会话查询 - Hydro Desktop',
        updateManager: '应用更新 - Hydro Desktop',
        dingtalkSettings: '钉钉桥接设置 - Hydro Desktop',
        notebookWorkspace: 'Notebook - Hydro Desktop'
      },
      dialogs: {
        selectProjectFolder: '选择项目文件夹',
        selectDirectory: '选择目录',
        selectFile: '选择文件',
        selectFiles: '选择多个文件',
        exportSession: '导出会话',
        saveImage: '保存图片',
        markdown: 'Markdown',
        json: 'JSON',
        allFiles: '所有文件',
        pngImage: 'PNG 图片'
      },
      probeSessionTitle: 'API 测试探针'
    }
  },
  'en-US': {
    app: {
      modes: {
        developer: 'Hydro Coder',
        agent: 'Hydro Agent',
        notebook: 'Hydro Notebook'
      },
      windows: {
        main: 'Hydro Desktop',
        profileManager: 'API Profile Manager - Hydro Desktop',
        globalSettings: 'Global Settings - Hydro Desktop',
        appearanceSettings: 'Appearance Settings - Hydro Desktop',
        settingsWorkbench: 'Capability Management - Hydro Desktop',
        providerManager: 'Provider Manager - Hydro Desktop',
        sessionManager: 'Session Browser - Hydro Desktop',
        updateManager: 'Application Update - Hydro Desktop',
        dingtalkSettings: 'DingTalk Bridge Settings - Hydro Desktop',
        notebookWorkspace: 'Notebook - Hydro Desktop'
      },
      dialogs: {
        selectProjectFolder: 'Select Project Folder',
        selectDirectory: 'Select Directory',
        selectFile: 'Select File',
        selectFiles: 'Select Files',
        exportSession: 'Export Session',
        saveImage: 'Save Image',
        markdown: 'Markdown',
        json: 'JSON',
        allFiles: 'All Files',
        pngImage: 'PNG Image'
      },
      probeSessionTitle: 'API Test Probe'
    }
  }
}

function getMainLocale(configManager) {
  return configManager?.getConfig?.()?.settings?.locale || 'zh-CN'
}

function resolveKeyPath(target, key) {
  return String(key || '')
    .split('.')
    .reduce((value, part) => (value && typeof value === 'object' ? value[part] : undefined), target)
}

function tMain(configManager, key, params = {}) {
  const locale = getMainLocale(configManager)
  const dict = MAIN_I18N[locale] || MAIN_I18N['zh-CN']
  const fallbackDict = MAIN_I18N['zh-CN']
  const template = resolveKeyPath(dict, key) || resolveKeyPath(fallbackDict, key) || key

  if (typeof template !== 'string') return key

  return template.replace(/\{(\w+)\}/g, (_, name) => (
    params[name] !== undefined ? String(params[name]) : `{${name}}`
  ))
}

module.exports = {
  getMainLocale,
  tMain
}
