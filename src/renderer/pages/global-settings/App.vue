<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <GlobalSettingsContent />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import GlobalSettingsContent from './components/GlobalSettingsContent.vue'

const { naiveTheme, themeOverrides, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
