<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <MainContent />
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import MainContent from './components/MainContent.vue'

const { naiveTheme, themeOverrides, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
