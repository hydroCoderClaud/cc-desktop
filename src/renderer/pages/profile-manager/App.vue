<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <ProfileManagerContent />
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { onMounted } from 'vue'
import { useTheme } from '@composables/useTheme'
import ProfileManagerContent from './components/ProfileManagerContent.vue'

const { naiveTheme, themeOverrides, initTheme } = useTheme()

onMounted(() => {
  initTheme()
})
</script>
