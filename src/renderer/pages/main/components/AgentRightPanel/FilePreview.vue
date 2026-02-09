<template>
  <div class="file-preview">
    <!-- Header -->
    <div class="preview-header">
      <span class="preview-filename" :title="preview?.name">{{ preview?.name || '' }}</span>
      <button class="preview-close" @click="$emit('close')">
        <Icon name="close" :size="12" />
      </button>
    </div>

    <!-- Content -->
    <div class="preview-body">
      <!-- Loading -->
      <div v-if="loading" class="preview-placeholder">
        <span>{{ t('common.loading') }}</span>
      </div>

      <!-- Error -->
      <div v-else-if="preview?.error" class="preview-placeholder preview-error">
        <Icon name="warning" :size="16" />
        <span>{{ preview.error }}</span>
      </div>

      <!-- Too Large -->
      <div v-else-if="preview?.tooLarge" class="preview-placeholder">
        <Icon name="fileText" :size="24" />
        <span>{{ t('agent.files.tooLarge') }}</span>
        <span class="preview-meta">{{ formatFileSize(preview.size) }}</span>
      </div>

      <!-- Text -->
      <div v-else-if="preview?.type === 'text'" class="preview-text">
        <pre><code>{{ preview.content }}</code></pre>
      </div>

      <!-- Image -->
      <div v-else-if="preview?.type === 'image'" class="preview-image">
        <img :src="preview.content" :alt="preview.name" />
      </div>

      <!-- Binary -->
      <div v-else-if="preview?.type === 'binary'" class="preview-placeholder">
        <Icon name="fileText" :size="24" />
        <span>{{ t('agent.files.cannotPreview') }}</span>
        <span class="preview-meta">{{ preview.ext }} · {{ formatFileSize(preview.size) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'
import { formatFileSize } from '@composables/useAgentFiles'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

defineProps({
  preview: { type: Object, default: null },
  loading: { type: Boolean, default: false }
})

defineEmits(['close'])
</script>

<style scoped>
.file-preview {
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border-color);
  min-height: 0;
}

.preview-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--bg-color-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.preview-filename {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.preview-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
}

.preview-close:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.preview-body {
  flex: 1;
  overflow: auto;
  min-height: 0;
}

.preview-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.preview-error {
  color: var(--error-color, #e53e3e);
}

.preview-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  opacity: 0.7;
}

.preview-text {
  overflow: auto;
  height: 100%;
}

.preview-text pre {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  line-height: 1.5;
  font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
  white-space: pre;
  overflow-x: auto;
}

.preview-text code {
  color: var(--text-color);
}

.preview-image {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  overflow: auto;
}

.preview-image img {
  max-width: 100%;
  max-height: 300px;
  object-fit: contain;
  border-radius: 4px;
}
</style>
