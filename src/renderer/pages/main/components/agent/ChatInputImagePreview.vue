<template>
  <div v-if="images.length > 0" class="image-preview-area">
    <div
      v-for="(img, index) in images"
      :key="img.id"
      class="image-preview-item"
      :class="{ warning: img.warning }"
    >
      <img :src="`data:${img.mediaType};base64,${img.base64}`" class="preview-thumbnail" />
      <button class="preview-remove-btn" :title="t('common.delete')" @click="emit('remove', index)">
        <Icon name="close" :size="12" />
      </button>
      <div class="preview-size">{{ img.sizeText }}</div>
      <div v-if="img.warning" class="preview-warning" :title="t('agent.imageTooLarge')">
        <Icon name="warning" :size="12" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

defineProps({
  images: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['remove'])
const { t } = useLocale()
</script>

<style scoped>
.image-preview-area {
  display: flex;
  gap: 10px;
  margin-bottom: 10px;
  overflow-x: auto;
  padding-bottom: 2px;
}

.image-preview-item {
  position: relative;
  flex: 0 0 auto;
  width: 84px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  padding: 6px;
}

.image-preview-item.warning {
  border-color: var(--warning-color, #f59e0b);
}

.preview-thumbnail {
  width: 100%;
  height: 60px;
  object-fit: cover;
  border-radius: 8px;
  display: block;
}

.preview-remove-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: rgb(0 0 0 / 55%);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.preview-size {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-3);
}

.preview-warning {
  position: absolute;
  left: 6px;
  bottom: 24px;
  color: var(--warning-color, #f59e0b);
}
</style>
