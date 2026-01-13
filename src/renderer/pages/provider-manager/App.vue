<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <ProviderManagerContent />
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import ProviderManagerContent from './components/ProviderManagerContent.vue'

const { naiveTheme, themeOverrides, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
