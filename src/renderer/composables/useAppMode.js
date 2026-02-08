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
  AGENT: 'agent'
}

// 全局共享状态（模块级单例）
const appMode = ref(AppMode.DEVELOPER)
const initialized = ref(false)

export function useAppMode() {
  const isDeveloperMode = computed(() => appMode.value === AppMode.DEVELOPER)
  const isAgentMode = computed(() => appMode.value === AppMode.AGENT)

  /**
   * 从配置初始化模式
   */
  const initMode = async () => {
    if (initialized.value) return

    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.getConfig()
        const savedMode = config?.settings?.appMode
        if (savedMode && Object.values(AppMode).includes(savedMode)) {
          appMode.value = savedMode
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

    if (appMode.value === mode) return

    appMode.value = mode

    // 持久化到配置
    try {
      if (window.electronAPI) {
        await window.electronAPI.updateSettings({ appMode: mode })
      }
    } catch (err) {
      console.error('[useAppMode] Failed to save mode to config:', err)
    }
  }

  /**
   * 切换模式（在两种模式之间切换）
   */
  const toggleMode = async () => {
    const nextMode = appMode.value === AppMode.DEVELOPER
      ? AppMode.AGENT
      : AppMode.DEVELOPER
    await switchMode(nextMode)
  }

  return {
    appMode: readonly(appMode),
    isDeveloperMode,
    isAgentMode,
    initMode,
    switchMode,
    toggleMode
  }
}
