<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-container" :style="cssVars">
          <MainContent />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted, onUnmounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import MainContent from './components/MainContent.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { t } = useLocale()

let message = null
let cleanupFunctions = []

onMounted(async () => {
  initTheme()

  try {
    const { useMessage } = await import('naive-ui')
    message = useMessage()
  } catch (error) {
    console.warn('[Update] Failed to get message API:', error)
  }

  setupUpdateListeners()
})

onUnmounted(() => {
  cleanupFunctions.forEach(fn => fn())
  cleanupFunctions = []
})

const setupUpdateListeners = () => {
  if (!window.electronAPI?.onUpdateAvailable) return

  // 发现新版本：显示通知 + 打开更新窗口（主进程已保证不重复创建）
  const cleanup = window.electronAPI.onUpdateAvailable((info) => {
    console.log('[Update] Update available:', info.version)

    if (message) {
      message.info(`${t('update.newVersionAvailable')}: ${info.version}`, {
        duration: 5000,
        closable: true
      })
    }

    window.electronAPI.openUpdateManager?.()
  })
  cleanupFunctions.push(cleanup)
}
</script>

<style>
.app-container {
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.2s, color 0.2s;
}
</style>
