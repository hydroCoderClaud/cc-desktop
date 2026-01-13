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
   * 设置语言
   */
  const setLocale = async (locale) => {
    if (!locales[locale]) {
      console.warn(`[useLocale] Unknown locale: ${locale}`)
      return
    }

    currentLocale.value = locale
    document.documentElement.setAttribute('data-locale', locale)

    try {
      if (window.electronAPI) {
        await window.electronAPI.updateSettings({ locale })
      }
    } catch (err) {
      console.error('[useLocale] Failed to save locale:', err)
    }
  }

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
