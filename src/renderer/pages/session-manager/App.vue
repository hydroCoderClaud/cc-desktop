<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider placement="top-right" :container-style="{ top: '60px' }">
      <n-dialog-provider>
        <div class="app-container" :style="cssVars">
          <SessionManagerContent />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import SessionManagerContent from './components/SessionManagerContent.vue'

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
  transition: background-color 0.2s, color 0.2s;
}
</style>
