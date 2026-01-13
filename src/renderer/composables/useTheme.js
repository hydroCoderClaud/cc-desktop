/**
 * 全局主题管理 Composable
 * 提供统一的深浅色主题切换功能
 */
import { ref, computed, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import { claudeTheme, claudeDarkTheme } from '@theme/claude-theme'

// 从 preload 注入的 data-theme 读取初始主题（同步，避免闪白）
const getInitialTheme = () => {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }
  return false
}

// 全局主题状态（跨组件共享）
const isDark = ref(getInitialTheme())
const isInitialized = ref(false)

/**
 * 主题管理 Hook
 */
export function useTheme() {
  /**
   * 初始化主题（从配置加载）
   */
  const initTheme = async () => {
    if (isInitialized.value) return

    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.getConfig()
        isDark.value = config?.settings?.theme === 'dark'
      }
    } catch (err) {
      console.error('[useTheme] Failed to load theme config:', err)
    }

    isInitialized.value = true
  }

  /**
   * 切换主题
   */
  const toggleTheme = async () => {
    isDark.value = !isDark.value
    await saveTheme()
  }

  /**
   * 设置主题
   */
  const setTheme = async (dark) => {
    isDark.value = dark
    await saveTheme()
  }

  /**
   * 保存主题到配置
   */
  const saveTheme = async () => {
    try {
      if (window.electronAPI) {
        await window.electronAPI.updateSettings({
          theme: isDark.value ? 'dark' : 'light'
        })
      }
    } catch (err) {
      console.error('[useTheme] Failed to save theme:', err)
    }
  }

  /**
   * Naive UI 主题对象
   */
  const naiveTheme = computed(() => {
    return isDark.value ? darkTheme : null
  })

  /**
   * Naive UI 主题覆盖配置
   */
  const themeOverrides = computed(() => {
    return isDark.value ? claudeDarkTheme : claudeTheme
  })

  /**
   * 主题 CSS 变量（用于自定义样式）
   */
  const cssVars = computed(() => {
    if (isDark.value) {
      return {
        '--bg-color': '#1a1a1a',
        '--bg-color-secondary': '#242424',
        '--bg-color-tertiary': '#2d2d2d',
        '--text-color': '#f5f5f0',
        '--text-color-secondary': '#d0d0d0',
        '--text-color-muted': '#8c8c8c',
        '--border-color': '#404040',
        '--primary-color': '#FF6B35',
        '--primary-color-hover': '#FF5722',
        '--shadow-color': 'rgba(0, 0, 0, 0.3)'
      }
    }
    return {
      '--bg-color': '#f5f5f0',
      '--bg-color-secondary': '#ffffff',
      '--bg-color-tertiary': '#f8f8f5',
      '--text-color': '#2d2d2d',
      '--text-color-secondary': '#4a4a4a',
      '--text-color-muted': '#8c8c8c',
      '--border-color': '#e5e5e0',
      '--primary-color': '#FF6B35',
      '--primary-color-hover': '#FF5722',
      '--shadow-color': 'rgba(0, 0, 0, 0.08)'
    }
  })

  return {
    isDark,
    naiveTheme,
    themeOverrides,
    cssVars,
    initTheme,
    toggleTheme,
    setTheme
  }
}
