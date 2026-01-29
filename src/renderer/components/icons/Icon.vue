<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 20 20"
    fill="none"
    :stroke="color"
    :stroke-width="strokeWidth"
    stroke-linecap="round"
    stroke-linejoin="round"
    class="icon"
    v-html="path"
  />
</template>

<script setup>
import { computed } from 'vue'
import { iconPaths } from './index.js'

const props = defineProps({
  name: {
    type: String,
    required: true
  },
  size: {
    type: [Number, String],
    default: 20
  },
  color: {
    type: String,
    default: 'currentColor'
  },
  strokeWidth: {
    type: [Number, String],
    default: 2
  }
})

const path = computed(() => {
  const p = iconPaths[props.name]
  if (!p) {
    console.warn(`[Icon] Unknown icon name: ${props.name}`)
    return iconPaths.warning || ''
  }
  return p
})
</script>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
