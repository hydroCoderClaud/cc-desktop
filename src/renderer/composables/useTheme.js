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

// 同步 DOM 主题属性
const syncDOMTheme = (dark) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.style.backgroundColor = dark ? '#1a1a1a' : '#f5f5f0'
  }
}

// 监听主题变化，自动同步 DOM
watch(isDark, (dark) => {
  syncDOMTheme(dark)
}, { immediate: false })

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
   * 保存主题到配置并广播
   */
  const saveTheme = async () => {
    try {
      if (window.electronAPI) {
        const theme = isDark.value ? 'dark' : 'light'
        await window.electronAPI.updateSettings({ theme })
        // 广播到所有窗口
        window.electronAPI.broadcastSettings({ theme })
      }
    } catch (err) {
      console.error('[useTheme] Failed to save theme:', err)
    }
  }

  /**
   * 监听其他窗口的主题变更
   */
  const listenForChanges = () => {
    if (window.electronAPI?.onSettingsChanged) {
      window.electronAPI.onSettingsChanged((settings) => {
        if (settings.theme !== undefined) {
          const newDark = settings.theme === 'dark'
          if (isDark.value !== newDark) {
            isDark.value = newDark
          }
        }
      })
    }
  }

  // 自动开始监听
  listenForChanges()

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
        // 背景色
        '--bg-color': '#1a1a1a',
        '--bg-color-secondary': '#242424',
        '--bg-color-tertiary': '#2d2d2d',
        // 文字色
        '--text-color': '#e8e8e8',
        '--text-color-secondary': '#d0d0d0',
        '--text-color-muted': '#8c8c8c',
        // 边框色
        '--border-color': '#333333',
        '--border-color-light': '#404040',
        // 主题色
        '--primary-color': '#FF6B35',
        '--primary-color-hover': '#FF5722',
        // 阴影
        '--shadow-color': 'rgba(0, 0, 0, 0.3)',
        // 滚动条
        '--scrollbar-thumb': '#444444',
        // 警告框
        '--warning-bg': '#3a3a1a',
        '--warning-text': '#f4d03f',
        // 悬停
        '--hover-bg': '#333333'
      }
    }
    return {
      // 背景色
      '--bg-color': '#f5f5f0',
      '--bg-color-secondary': '#ffffff',
      '--bg-color-tertiary': '#f8f8f5',
      // 文字色
      '--text-color': '#2d2d2d',
      '--text-color-secondary': '#4a4a4a',
      '--text-color-muted': '#8c8c8c',
      // 边框色
      '--border-color': '#e5e5e0',
      '--border-color-light': '#e0e0e0',
      // 主题色
      '--primary-color': '#FF6B35',
      '--primary-color-hover': '#FF5722',
      // 阴影
      '--shadow-color': 'rgba(0, 0, 0, 0.08)',
      // 滚动条
      '--scrollbar-thumb': '#d0d0c8',
      // 警告框
      '--warning-bg': '#fef9e7',
      '--warning-text': '#856404',
      // 悬停
      '--hover-bg': '#f0f0eb'
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
