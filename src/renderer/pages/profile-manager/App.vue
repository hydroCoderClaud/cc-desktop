<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <div class="app-container" :style="cssVars">
            <ProfileManagerContent />
          </div>
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import ProfileManagerContent from './components/ProfileManagerContent.vue'

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
