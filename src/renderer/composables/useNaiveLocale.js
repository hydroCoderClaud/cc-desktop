import { computed } from 'vue'
import { dateEnUS, dateZhCN, enUS, zhCN } from 'naive-ui'
import { useLocale } from './useLocale'

const COMMON_LOCALES = {
  'zh-CN': zhCN,
  'en-US': enUS
}

const DATE_LOCALES = {
  'zh-CN': dateZhCN,
  'en-US': dateEnUS
}

export function useNaiveLocale() {
  const { locale, initLocale } = useLocale()

  const naiveLocale = computed(() => COMMON_LOCALES[locale.value] || zhCN)
  const naiveDateLocale = computed(() => DATE_LOCALES[locale.value] || dateZhCN)

  return {
    naiveLocale,
    naiveDateLocale,
    initLocale
  }
}
