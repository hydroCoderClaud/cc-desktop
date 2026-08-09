<template>
  <div class="model-page" :class="{ embedded: props.embedded }" :style="cssVars">
    <EmbeddedProfileManager />
  </div>
</template>

<script setup>
import { useTheme } from '@composables/useTheme'
import EmbeddedProfileManager from './EmbeddedProfileManager.vue'

const { cssVars } = useTheme()
const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})
</script>

<style scoped>
.model-page { min-height: 100vh; }
.model-page.embedded { min-height: 100%; height: 100%; overflow: auto; }
</style>
