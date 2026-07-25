const MAIN_I18N = {
  'zh-CN': {
    app: {
      modes: {
        developer: 'Hydro Coder',
        agent: 'JSHP Agent',
        notebook: 'Hydro Notebook'
      },
      windows: {
        main: 'JSHP Desktop',
        modelSettings: '模型配置 - JSHP Desktop',
        profileManager: 'API 配置管理 - JSHP Desktop',
        globalSettings: '全局设置 - JSHP Desktop',
        appearanceSettings: '外观设置 - JSHP Desktop',
        hydrologyWorkbench: '水文站工作台 - JSHP Desktop',
        channelSettings: '渠道配置 - JSHP Desktop',
        settingsWorkbench: '能力管理 - JSHP Desktop',
        providerManager: '服务商管理 - JSHP Desktop',
        sessionManager: '会话查询 - JSHP Desktop',
        updateManager: '应用更新 - JSHP Desktop',
        dingtalkSettings: '钉钉桥接设置 - JSHP Desktop',
        notebookWorkspace: 'Notebook - JSHP Desktop'
      },
      tray: {
        tooltip: 'JSHP Desktop',
        show: '显示主窗口',
        hide: '隐藏主窗口',
        quit: '退出'
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
      probeSessionTitle: 'API 测试探针',
      defaultAgentSessionTitle: '对话'
    },
    embeddedApps: {
      hydrologyWorkbenchTitle: '水文站工作台'
    }
  },
  'en-US': {
    app: {
      modes: {
        developer: 'Hydro Coder',
        agent: 'JSHP Agent',
        notebook: 'Hydro Notebook'
      },
      windows: {
        main: 'JSHP Desktop',
        modelSettings: 'Model Settings - JSHP Desktop',
        profileManager: 'API Profile Manager - JSHP Desktop',
        globalSettings: 'Global Settings - JSHP Desktop',
        appearanceSettings: 'Appearance Settings - JSHP Desktop',
        hydrologyWorkbench: 'Hydrology Workbench - JSHP Desktop',
        channelSettings: 'Channel Settings - JSHP Desktop',
        settingsWorkbench: 'Capability Management - JSHP Desktop',
        providerManager: 'Provider Manager - JSHP Desktop',
        sessionManager: 'Session Browser - JSHP Desktop',
        updateManager: 'Application Update - JSHP Desktop',
        dingtalkSettings: 'DingTalk Bridge Settings - JSHP Desktop',
        notebookWorkspace: 'Notebook - JSHP Desktop'
      },
      tray: {
        tooltip: 'JSHP Desktop',
        show: 'Show Main Window',
        hide: 'Hide Main Window',
        quit: 'Quit'
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
      probeSessionTitle: 'API Test Probe',
      defaultAgentSessionTitle: 'Chat'
    },
    embeddedApps: {
      hydrologyWorkbenchTitle: 'Hydrology Workbench'
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
