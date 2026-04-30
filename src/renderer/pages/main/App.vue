<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
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
import { useNaiveLocale } from '@composables/useNaiveLocale'
import { useTheme } from '@composables/useTheme'
import MainContent from './components/MainContent.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { naiveLocale, naiveDateLocale, initLocale } = useNaiveLocale()

let cleanupFunctions = []

onMounted(() => {
  initLocale()
  initTheme()
  setupUpdateListeners()
})

onUnmounted(() => {
  cleanupFunctions.forEach(fn => fn())
  cleanupFunctions = []
})

const setupUpdateListeners = () => {
  if (!window.electronAPI?.onUpdateAvailable) return

  // 发现新版本：打开更新窗口（主进程已保证不重复创建）
  // 注意：App.vue 本身是 NMessageProvider，无法在此调用 useMessage()
  // toast 通知由 MainContent 内的子组件处理
  const cleanup1 = window.electronAPI.onUpdateAvailable(() => {
    window.electronAPI.openUpdateManager?.()
  })
  cleanupFunctions.push(cleanup1)

  // macOS 上次安装失败：打开更新窗口让用户重试
  if (window.electronAPI?.onUpdateInstallFailed) {
    const cleanup2 = window.electronAPI.onUpdateInstallFailed(() => {
      window.electronAPI.openUpdateManager?.()
    })
    cleanupFunctions.push(cleanup2)
  }
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
