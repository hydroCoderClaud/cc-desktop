<template>
  <div v-if="attachments.length > 0" class="attachment-preview-area">
    <div
      v-for="(attachment, index) in attachments"
      :key="attachment.id || attachment.localPath || index"
      class="attachment-preview-item"
      :title="attachment.localPath || attachment.filename"
    >
      <Icon name="fileText" :size="18" class="attachment-icon" />
      <div class="attachment-info">
        <div class="attachment-name">{{ attachment.filename || 'attachment' }}</div>
        <div class="attachment-size">{{ attachment.sizeText || formatBytes(attachment.sizeBytes) }}</div>
      </div>
      <button class="attachment-remove-btn" :title="t('common.delete')" @click="emit('remove', index)">
        <Icon name="close" :size="11" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

defineProps({
  attachments: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['remove'])
const { t } = useLocale()

const formatBytes = (bytes) => {
  const value = Number(bytes) || 0
  if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`
  if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${value} B`
}
</script>

<style scoped>
.attachment-preview-area {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.attachment-preview-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: min(320px, 100%);
  padding: 7px 8px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--input-bg);
  color: var(--text-color);
}

.attachment-icon {
  color: var(--primary-color);
}

.attachment-info {
  min-width: 0;
}

.attachment-name {
  max-width: 220px;
  overflow: hidden;
  color: var(--text-color);
  font-size: 12px;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-size {
  margin-top: 2px;
  color: var(--text-color-3);
  font-size: 11px;
}

.attachment-remove-btn {
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 999px;
  background: var(--hover-bg);
  color: var(--text-color-3);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.attachment-remove-btn:hover {
  color: #ff4d4f;
}
</style>
