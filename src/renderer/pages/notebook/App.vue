<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <div class="app-container" :style="cssVars">
          <NotebookWorkspace />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'
import NotebookWorkspace from './components/NotebookWorkspace.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()
const { initLocale } = useLocale()

onMounted(() => {
  initTheme()
  initLocale()
})
</script>

<style>
.app-container {
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
  transition: background-color 0.2s, color 0.2s;
}
</style>
