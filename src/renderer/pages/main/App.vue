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
import MainContent from './components/MainContent.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()

let cleanupFunctions = []

onMounted(() => {
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
  const cleanup = window.electronAPI.onUpdateAvailable(() => {
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
