<template>
  <div class="text-renderer">
    <div v-if="editable" class="text-toolbar">
      <div class="text-toolbar-left">
        <button
          class="toolbar-text-btn primary"
          @click="$emit('save')"
          :disabled="!dirty || saving"
        >
          {{ t('common.save') }}
        </button>
        <button
          class="toolbar-text-btn"
          @click="$emit('cancel')"
          :disabled="saving"
        >
          {{ t('common.cancel') }}
        </button>
        <span v-if="dirty" class="toolbar-status">{{ t('notebook.textEditor.unsaved') }}</span>
        <span v-else-if="saveSuccess" class="toolbar-status success">{{ t('notebook.textEditor.saved') }}</span>
      </div>
      <span class="toolbar-tips">{{ t('notebook.textEditor.shortcutHint') }}</span>
    </div>

    <textarea
      v-if="editable"
      :value="content"
      class="text-editor"
      spellcheck="false"
      @input="$emit('update:content', $event.target.value)"
      @keydown="handleKeyDown"
    />

    <pre
      v-else
      class="detail-raw-text"
      :class="{ 'detail-markdown': isMarkdown }"
    >{{ content || t('notebook.studio.empty') }}</pre>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'

const props = defineProps({
  content: { type: String, default: '' },
  type: { type: String, default: 'text' },
  editable: { type: Boolean, default: false },
  dirty: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  saveSuccess: { type: Boolean, default: false }
})

const emit = defineEmits(['update:content', 'save', 'cancel'])

const { t } = useLocale()
const isMarkdown = computed(() => props.type === 'markdown')

const handleKeyDown = (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    emit('save')
  }
  if (event.key === 'Escape') {
    emit('cancel')
  }
}
</script>

<style scoped>
@import '../../notebook-shared.css';

.text-renderer {
  width: 100%;
  height: 100%;
  position: relative;
}

.text-toolbar {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: color-mix(in srgb, var(--bg-color-secondary) 92%, transparent);
  backdrop-filter: blur(4px);
}

.text-toolbar-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-text-btn {
  min-width: 56px;
  height: 28px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  cursor: pointer;
  padding: 0 10px;
  font-size: 12px;
}

.toolbar-text-btn.primary {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.toolbar-text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.toolbar-status {
  font-size: 12px;
  color: var(--text-color-muted);
}

.toolbar-status.success {
  color: var(--primary-color);
}

.toolbar-tips {
  font-size: 12px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

.text-editor {
  width: 100%;
  height: 100%;
  min-height: 520px;
  border: none;
  outline: none;
  resize: none;
  padding: 60px 16px 16px;
  background: transparent;
  color: var(--text-color);
  font-family: inherit;
  font-size: 13px;
  line-height: 1.6;
  box-sizing: border-box;
}
</style>
