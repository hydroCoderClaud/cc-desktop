<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <div class="app-container" :style="cssVars">
        <GlobalSettingsContent />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import GlobalSettingsContent from './components/GlobalSettingsContent.vue'

const { naiveTheme, themeOverrides, cssVars, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>

<style>
.app-container {
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
  
}
</style>
