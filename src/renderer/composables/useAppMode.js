/**
 * 应用模式管理组合式函数
 * 管理开发者模式和 Agent 模式的切换
 */
import { ref, computed, readonly } from 'vue'

/**
 * 应用模式枚举
 */
export const AppMode = {
  DEVELOPER: 'developer',
  AGENT: 'agent',
  NOTEBOOK: 'notebook'
}

// 全局共享状态（模块级单例）
const appMode = ref(AppMode.AGENT)
const developerModeEnabled = ref(true)
const initialized = ref(false)
let _settingsCleanup = null

const getDeveloperModeEnabled = (config) => config?.settings?.enableDeveloperMode !== false

const normalizeMode = (mode) => {
  if (mode === AppMode.DEVELOPER && !developerModeEnabled.value) {
    return AppMode.AGENT
  }
  return Object.values(AppMode).includes(mode) ? mode : AppMode.AGENT
}

export function useAppMode() {
  const isDeveloperMode = computed(() => appMode.value === AppMode.DEVELOPER)
  const isAgentMode = computed(() => appMode.value === AppMode.AGENT)
  const isNotebookMode = computed(() => appMode.value === AppMode.NOTEBOOK)

  /**
   * 从配置初始化模式
   */
  const initMode = async () => {
    if (initialized.value) return

    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.getConfig()
        developerModeEnabled.value = getDeveloperModeEnabled(config)

        const startupMode = AppMode.AGENT
        appMode.value = startupMode
        await window.electronAPI.setMainWindowTitleByMode(startupMode)

        if (config?.settings?.appMode !== startupMode) {
          await window.electronAPI.updateSettings({ appMode: startupMode })
        }
      }
    } catch (err) {
      console.error('[useAppMode] Failed to load mode from config:', err)
    }

    initialized.value = true
  }

  /**
   * 切换模式
   * @param {string} mode - 目标模式
   */
  const switchMode = async (mode) => {
    if (!Object.values(AppMode).includes(mode)) {
      console.warn('[useAppMode] Invalid mode:', mode)
      return
    }

    const nextMode = normalizeMode(mode)
    if (appMode.value === nextMode) return

    appMode.value = nextMode

    // 持久化到配置
    try {
      if (window.electronAPI) {
        await window.electronAPI.updateSettings({ appMode: nextMode })
        await window.electronAPI.setMainWindowTitleByMode(nextMode)
      }
    } catch (err) {
      console.error('[useAppMode] Failed to save mode to config:', err)
    }
  }

  /**
   * 切换模式（在开发者模式和 Agent 模式之间切换）
   */
  const toggleMode = async () => {
    const nextMode = appMode.value === AppMode.DEVELOPER
      ? AppMode.AGENT
      : developerModeEnabled.value
        ? AppMode.DEVELOPER
        : AppMode.AGENT
    await switchMode(nextMode)
  }

  const listenForChanges = () => {
    if (_settingsCleanup) return
    if (window.electronAPI?.onSettingsChanged) {
      _settingsCleanup = window.electronAPI.onSettingsChanged(async (settings) => {
        if (settings.enableDeveloperMode !== undefined) {
          developerModeEnabled.value = settings.enableDeveloperMode !== false
          if (!developerModeEnabled.value && appMode.value === AppMode.DEVELOPER) {
            appMode.value = AppMode.AGENT
            await window.electronAPI.setMainWindowTitleByMode(AppMode.AGENT)
          }
        }

        if (settings.appMode !== undefined) {
          const nextMode = normalizeMode(settings.appMode)
          if (appMode.value !== nextMode) {
            appMode.value = nextMode
            await window.electronAPI.setMainWindowTitleByMode(nextMode)
          }
        }
      })
    }
  }

  listenForChanges()

  return {
    appMode: readonly(appMode),
    developerModeEnabled: readonly(developerModeEnabled),
    isDeveloperMode,
    isAgentMode,
    isNotebookMode,
    initMode,
    switchMode,
    toggleMode
  }
}
