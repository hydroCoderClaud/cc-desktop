/**
 * 全局语言管理 Composable
 * 提供统一的多语言支持
 */
import { ref, computed } from 'vue'
import { locales, localeNames, defaultLocale } from '@/locales'

// 从 preload 注入的 data-locale 读取初始语言
const getInitialLocale = () => {
  if (typeof document !== 'undefined') {
    return document.documentElement.getAttribute('data-locale') || defaultLocale
  }
  return defaultLocale
}

// 全局语言状态（跨组件共享）
const currentLocale = ref(getInitialLocale())
const isInitialized = ref(false)

/**
 * 语言管理 Hook
 */
export function useLocale() {
  /**
   * 初始化语言（从配置加载）
   */
  const initLocale = async () => {
    if (isInitialized.value) return

    try {
      if (window.electronAPI) {
        const config = await window.electronAPI.getConfig()
        if (config?.settings?.locale && locales[config.settings.locale]) {
          currentLocale.value = config.settings.locale
        }
      }
    } catch (err) {
      console.error('[useLocale] Failed to load locale config:', err)
    }

    isInitialized.value = true
  }

  /**
   * 设置语言并广播
   */
  const setLocale = async (newLocale) => {
    if (!locales[newLocale]) {
      console.warn(`[useLocale] Unknown locale: ${newLocale}`)
      return
    }

    currentLocale.value = newLocale
    document.documentElement.setAttribute('data-locale', newLocale)
    document.documentElement.setAttribute('lang', newLocale === 'en-US' ? 'en' : 'zh-CN')

    try {
      if (window.electronAPI) {
        await window.electronAPI.updateSettings({ locale: newLocale })
        // 广播到所有窗口
        window.electronAPI.broadcastSettings({ locale: newLocale })
      }
    } catch (err) {
      console.error('[useLocale] Failed to save locale:', err)
    }
  }

  /**
   * 监听其他窗口的语言变更
   */
  const listenForChanges = () => {
    if (window.electronAPI?.onSettingsChanged) {
      window.electronAPI.onSettingsChanged((settings) => {
        if (settings.locale !== undefined && locales[settings.locale]) {
          if (currentLocale.value !== settings.locale) {
            currentLocale.value = settings.locale
            document.documentElement.setAttribute('data-locale', settings.locale)
            document.documentElement.setAttribute('lang', settings.locale === 'en-US' ? 'en' : 'zh-CN')
          }
        }
      })
    }
  }

  // 自动开始监听
  listenForChanges()

  /**
   * 获取当前语言包
   */
  const messages = computed(() => {
    return locales[currentLocale.value] || locales[defaultLocale]
  })

  /**
   * 翻译函数
   * @param {string} key - 翻译键，支持点号分隔，如 'common.save'
   * @param {object} params - 可选的插值参数
   * @returns {string}
   */
  const t = (key, params = {}) => {
    const keys = key.split('.')
    let value = messages.value

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k]
      } else {
        console.warn(`[useLocale] Missing translation: ${key}`)
        return key
      }
    }

    if (typeof value !== 'string') {
      console.warn(`[useLocale] Invalid translation value for: ${key}`)
      return key
    }

    // 简单的参数替换 {name} -> params.name
    return value.replace(/\{(\w+)\}/g, (_, name) => {
      return params[name] !== undefined ? params[name] : `{${name}}`
    })
  }

  /**
   * 可用的语言列表
   */
  const availableLocales = computed(() => {
    return Object.entries(localeNames).map(([value, label]) => ({
      value,
      label
    }))
  })

  /**
   * 当前语言名称
   */
  const currentLocaleName = computed(() => {
    return localeNames[currentLocale.value] || currentLocale.value
  })

  return {
    locale: currentLocale,
    messages,
    availableLocales,
    currentLocaleName,
    initLocale,
    setLocale,
    t
  }
}
