/**
 * 全局主题管理 Composable
 * 提供统一的深浅色主题切换功能和多配色方案支持
 */
import { ref, computed, watch } from 'vue'
import { darkTheme } from 'naive-ui'
import { claudeTheme, claudeDarkTheme } from '@theme/claude-theme'

// ========== 配色方案定义 ==========

/**
 * 6 套主题配色方案
 * 每套包含 light 和 dark 两种模式
 */
const COLOR_SCHEMES = {
  // Claude - 官方品牌色（赤陶/珊瑚色）
  claude: {
    name: 'Claude',
    icon: '✦',
    light: {
      primary: '#DA7756',
      primaryHover: '#C96A4B',
      ghost: 'rgba(218, 119, 86, 0.08)',
      ghostHover: 'rgba(218, 119, 86, 0.15)',
    },
    dark: {
      primary: '#E08B6D',
      primaryHover: '#DA7756',
      ghost: 'rgba(224, 139, 109, 0.12)',
      ghostHover: 'rgba(224, 139, 109, 0.22)',
    }
  },
  // Ember - 橙色
  ember: {
    name: 'Ember',
    icon: '🔥',
    light: {
      primary: '#FF6B35',
      primaryHover: '#FF5722',
      ghost: 'rgba(255, 107, 53, 0.08)',
      ghostHover: 'rgba(255, 107, 53, 0.15)',
    },
    dark: {
      primary: '#FF6B35',
      primaryHover: '#FF5722',
      ghost: 'rgba(255, 107, 53, 0.12)',
      ghostHover: 'rgba(255, 107, 53, 0.22)',
    }
  },
  // Ocean - 蓝色
  ocean: {
    name: 'Ocean',
    icon: '🌊',
    light: {
      primary: '#0369A1',
      primaryHover: '#075985',
      ghost: 'rgba(3, 105, 161, 0.08)',
      ghostHover: 'rgba(3, 105, 161, 0.15)',
    },
    dark: {
      primary: '#0284C7',
      primaryHover: '#0369A1',
      ghost: 'rgba(2, 132, 199, 0.12)',
      ghostHover: 'rgba(2, 132, 199, 0.22)',
    }
  },
  // Forest - 绿色
  forest: {
    name: 'Forest',
    icon: '🌲',
    light: {
      primary: '#10B981',
      primaryHover: '#059669',
      ghost: 'rgba(16, 185, 129, 0.08)',
      ghostHover: 'rgba(16, 185, 129, 0.15)',
    },
    dark: {
      primary: '#34D399',
      primaryHover: '#10B981',
      ghost: 'rgba(52, 211, 153, 0.12)',
      ghostHover: 'rgba(52, 211, 153, 0.22)',
    }
  },
  // Violet - 紫色
  violet: {
    name: 'Violet',
    icon: '💜',
    light: {
      primary: '#8B5CF6',
      primaryHover: '#7C3AED',
      ghost: 'rgba(139, 92, 246, 0.08)',
      ghostHover: 'rgba(139, 92, 246, 0.15)',
    },
    dark: {
      primary: '#A78BFA',
      primaryHover: '#8B5CF6',
      ghost: 'rgba(167, 139, 250, 0.12)',
      ghostHover: 'rgba(167, 139, 250, 0.22)',
    }
  },
  // Graphite - 灰色
  graphite: {
    name: 'Graphite',
    icon: '⚫',
    light: {
      primary: '#6B7280',
      primaryHover: '#4B5563',
      ghost: 'rgba(107, 114, 128, 0.08)',
      ghostHover: 'rgba(107, 114, 128, 0.15)',
    },
    dark: {
      primary: '#9CA3AF',
      primaryHover: '#6B7280',
      ghost: 'rgba(156, 163, 175, 0.12)',
      ghostHover: 'rgba(156, 163, 175, 0.22)',
    }
  }
}

// 导出配色方案列表供 UI 使用
export const colorSchemeList = Object.entries(COLOR_SCHEMES).map(([key, value]) => ({
  key,
  name: value.name,
  icon: value.icon,
  primaryLight: value.light.primary,
  primaryDark: value.dark.primary
}))

// ========== 全局状态 ==========

// 从 preload 注入的 data-theme 读取初始主题（同步，避免闪白）
const getInitialTheme = () => {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-theme') === 'dark'
  }
  return false
}

// 全局主题状态（跨组件共享）
const isDark = ref(getInitialTheme())
const colorScheme = ref('claude') // 当前配色方案（默认 Claude 官方色）
const isInitialized = ref(false)

// 同步 DOM 主题属性
const syncDOMTheme = (dark) => {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
    document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    document.body.style.backgroundColor = dark ? '#1a1a1a' : '#f5f5f0'
  }
}

/**
 * 构建 CSS 变量对象
 * 提取为独立函数，供 cssVars computed 和 syncCSSVarsToRoot 共用
 */
const buildCSSVars = (dark, colors) => {
  const fontMono = '"JetBrains Mono", "Cascadia Code", "SF Mono", "Consolas", "Monaco", "Ubuntu Mono", monospace'
  const fontLogo = '"Crimson Pro", "Georgia", "Times New Roman", serif'

  if (dark) {
    return {
      '--font-mono': fontMono,
      '--font-logo': fontLogo,
      '--bg-color': '#1a1a1a',
      '--bg-color-secondary': '#242424',
      '--bg-color-tertiary': '#2d2d2d',
      '--text-color': '#e8e8e8',
      '--text-color-secondary': '#d0d0d0',
      '--text-color-muted': '#8c8c8c',
      '--border-color': '#333333',
      '--border-color-light': '#404040',
      '--primary-color': colors.primary,
      '--primary-color-hover': colors.primaryHover,
      '--primary-ghost': colors.ghost,
      '--primary-ghost-hover': colors.ghostHover,
      '--danger-color': '#F87171',
      '--success-color': '#34D399',
      '--warning-color': '#FBBF24',
      '--info-color': '#60A5FA',
      '--shadow-color': 'rgba(0, 0, 0, 0.3)',
      '--scrollbar-thumb': '#444444',
      '--warning-bg': '#3a3a1a',
      '--warning-text': '#f4d03f',
      '--hover-bg': '#333333'
    }
  }
  return {
    '--font-mono': fontMono,
    '--font-logo': fontLogo,
    '--bg-color': '#f5f5f0',
    '--bg-color-secondary': '#ffffff',
    '--bg-color-tertiary': '#f8f8f5',
    '--text-color': '#2d2d2d',
    '--text-color-secondary': '#4a4a4a',
    '--text-color-muted': '#8c8c8c',
    '--border-color': '#e5e5e0',
    '--border-color-light': '#e0e0e0',
    '--primary-color': colors.primary,
    '--primary-color-hover': colors.primaryHover,
    '--primary-ghost': colors.ghost,
    '--primary-ghost-hover': colors.ghostHover,
    '--danger-color': '#DC2626',
    '--success-color': '#2E9E5E',
    '--warning-color': '#D97706',
    '--info-color': '#2563EB',
    '--shadow-color': 'rgba(0, 0, 0, 0.08)',
    '--scrollbar-thumb': '#d0d0c8',
    '--warning-bg': '#fef9e7',
    '--warning-text': '#856404',
    '--hover-bg': '#f0f0eb'
  }
}

/**
 * 将 CSS 变量同步到 :root (document.documentElement)
 * 解决 n-modal 等 teleport 到 body 的组件无法访问 .app-container CSS 变量的问题
 */
const syncCSSVarsToRoot = () => {
  if (typeof document === 'undefined') return
  const scheme = COLOR_SCHEMES[colorScheme.value] || COLOR_SCHEMES.claude
  const colors = isDark.value ? scheme.dark : scheme.light
  const vars = buildCSSVars(isDark.value, colors)
  const root = document.documentElement
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }
}

// 监听主题变化，自动同步 DOM
watch(isDark, (dark) => {
  syncDOMTheme(dark)
  syncCSSVarsToRoot()
}, { immediate: false })

// 监听配色方案变化，同步 CSS 变量
watch(colorScheme, () => {
  syncCSSVarsToRoot()
})

// 初始同步
syncCSSVarsToRoot()

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
        // 加载配色方案
        if (config?.settings?.colorScheme && COLOR_SCHEMES[config.settings.colorScheme]) {
          colorScheme.value = config.settings.colorScheme
        }
      }
    } catch (err) {
      console.error('[useTheme] Failed to load theme config:', err)
    }

    isInitialized.value = true
  }

  /**
   * 切换深浅模式
   */
  const toggleTheme = async () => {
    isDark.value = !isDark.value
    await saveTheme()
  }

  /**
   * 设置深浅模式
   */
  const setTheme = async (dark) => {
    isDark.value = dark
    await saveTheme()
  }

  /**
   * 设置配色方案
   */
  const setColorScheme = async (scheme) => {
    if (COLOR_SCHEMES[scheme]) {
      colorScheme.value = scheme
      await saveTheme()
    }
  }

  /**
   * 保存主题到配置并广播
   */
  const saveTheme = async () => {
    try {
      if (window.electronAPI) {
        const theme = isDark.value ? 'dark' : 'light'
        await window.electronAPI.updateSettings({
          theme,
          colorScheme: colorScheme.value
        })
        // 广播到所有窗口
        window.electronAPI.broadcastSettings({
          theme,
          colorScheme: colorScheme.value
        })
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
        if (settings.colorScheme !== undefined && COLOR_SCHEMES[settings.colorScheme]) {
          if (colorScheme.value !== settings.colorScheme) {
            colorScheme.value = settings.colorScheme
          }
        }
      })
    }
  }

  // 自动开始监听
  listenForChanges()

  /**
   * 当前配色方案的颜色
   */
  const currentColors = computed(() => {
    const scheme = COLOR_SCHEMES[colorScheme.value] || COLOR_SCHEMES.ember
    return isDark.value ? scheme.dark : scheme.light
  })

  /**
   * Naive UI 主题对象
   */
  const naiveTheme = computed(() => {
    return isDark.value ? darkTheme : null
  })

  /**
   * Naive UI 主题覆盖配置（动态更新主色）
   */
  const themeOverrides = computed(() => {
    const baseTheme = isDark.value ? claudeDarkTheme : claudeTheme
    const colors = currentColors.value

    // 深度合并，覆盖所有用到主色的地方
    return {
      ...baseTheme,
      common: {
        ...baseTheme.common,
        primaryColor: colors.primary,
        primaryColorHover: colors.primaryHover,
        primaryColorPressed: colors.primaryHover,
        primaryColorSuppl: colors.primary
      },
      Button: {
        ...baseTheme.Button,
        colorPrimary: colors.primary,
        colorHoverPrimary: colors.primaryHover,
        colorPressedPrimary: colors.primaryHover,
        // Warning 按钮跟随主题主色
        colorWarning: colors.primary,
        colorHoverWarning: colors.primaryHover,
        colorPressedWarning: colors.primaryHover,
        borderWarning: `1px solid ${colors.primary}`,
        borderHoverWarning: `1px solid ${colors.primaryHover}`,
        borderPressedWarning: `1px solid ${colors.primaryHover}`,
        borderFocusWarning: `1px solid ${colors.primaryHover}`
      },
      Input: {
        ...baseTheme.Input,
        borderHover: `1px solid ${colors.primary}`,
        borderFocus: `1px solid ${colors.primary}`,
        boxShadowFocus: `0 0 0 3px ${colors.ghost}`
      },
      Switch: {
        ...baseTheme.Switch,
        railColorActive: colors.primary
      },
      Spin: {
        ...baseTheme.Spin,
        color: colors.primary
      },
      Dialog: {
        ...baseTheme.Dialog,
        iconColorWarning: colors.primary
      },
      Message: {
        ...baseTheme.Message,
        iconColorSuccess: colors.primary,
        iconColorWarning: colors.primary,
        iconColorError: colors.primary,
        iconColorInfo: colors.primary,
        iconColorLoading: colors.primary
      },
      Notification: {
        ...baseTheme.Notification,
        iconColorSuccess: colors.primary,
        iconColorWarning: colors.primary,
        iconColorError: colors.primary,
        iconColorInfo: colors.primary
      }
    }
  })

  /**
   * 主题 CSS 变量（用于自定义样式）
   */
  const cssVars = computed(() => {
    return buildCSSVars(isDark.value, currentColors.value)
  })

  return {
    isDark,
    colorScheme,
    colorSchemeList,
    currentColors,
    naiveTheme,
    themeOverrides,
    cssVars,
    initTheme,
    toggleTheme,
    setTheme,
    setColorScheme
  }
}
