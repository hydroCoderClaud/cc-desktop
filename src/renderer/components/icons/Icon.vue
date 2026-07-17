<template>
  <img
    v-if="assetSrc"
    :src="assetSrc"
    :alt="name"
    :width="size"
    :height="size"
    class="icon icon-image"
  />
  <svg
    v-else
    :width="size"
    :height="size"
    :viewBox="viewBox"
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
import { iconAssets, iconDefinitions, iconPaths } from './index.js'

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

const assetSrc = computed(() => iconAssets[props.name] || '')

const iconDefinition = computed(() => iconDefinitions[props.name] || null)

const viewBox = computed(() => iconDefinition.value?.viewBox || '0 0 20 20')

const path = computed(() => {
  const p = iconDefinition.value?.body || iconPaths[props.name]
  if (!p && !assetSrc.value) {
    console.warn(`[Icon] Unknown icon name: ${props.name}`)
    return iconPaths.warning || ''
  }
  return p || ''
})
</script>

<style scoped>
.icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}

.icon-image {
  object-fit: contain;
}
</style>
