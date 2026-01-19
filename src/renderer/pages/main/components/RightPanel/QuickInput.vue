<template>
  <div class="quick-input">
    <div class="input-header">
      <span class="input-label">{{ t('rightPanel.quickInput.label') }}</span>
      <span class="input-hint">
        {{ terminalBusy ? t('rightPanel.quickInput.busy') : t('rightPanel.quickInput.hint') }}
      </span>
    </div>
    <div class="input-row">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        class="input-field"
        :placeholder="t('rightPanel.quickInput.placeholder')"
        rows="4"
        @keydown="handleKeydown"
      />
      <div class="input-actions">
        <button
          class="action-btn queue-btn"
          :disabled="!inputText.trim()"
          :title="t('rightPanel.quickInput.addToQueue') + ' (Enter)'"
          @click="handleAddToQueue"
        >
          📋
        </button>
        <button
          class="action-btn send-btn"
          :disabled="!inputText.trim() || terminalBusy"
          :title="t('rightPanel.quickInput.sendDirect') + ' (Ctrl+Enter)'"
          @click="handleSendDirect"
        >
          ▶
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  terminalBusy: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['add-to-queue', 'send-direct'])

// Refs
const textareaRef = ref(null)
const inputText = ref('')

// Handle keyboard shortcuts
const handleKeydown = (e) => {
  if (e.key === 'Enter') {
    if (e.ctrlKey || e.metaKey) {
      // Ctrl+Enter: Send directly
      e.preventDefault()
      handleSendDirect()
    } else if (!e.shiftKey) {
      // Enter (without Shift): Add to queue
      e.preventDefault()
      handleAddToQueue()
    }
    // Shift+Enter: Allow newline (default behavior)
  } else if (e.key === 'Escape') {
    inputText.value = ''
    textareaRef.value?.blur()
  }
}

// Add to queue
const handleAddToQueue = () => {
  const text = inputText.value.trim()
  if (!text) return

  emit('add-to-queue', text)
  inputText.value = ''
}

// Send directly to terminal
const handleSendDirect = () => {
  const text = inputText.value.trim()
  if (!text || props.terminalBusy) return

  emit('send-direct', text)
  inputText.value = ''
}

// Insert text (called from parent)
const insertText = (text) => {
  inputText.value = text
  textareaRef.value?.focus()
}

// Expose methods
defineExpose({
  insertText,
  focus: () => textareaRef.value?.focus()
})
</script>

<style scoped>
.quick-input {
  border-top: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
  padding: 10px 12px;
  flex-shrink: 0;
}

.input-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.input-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.input-hint {
  font-size: 11px;
  color: var(--text-color-muted);
}

.input-row {
  display: flex;
  gap: 8px;
}

.input-field {
  flex: 1;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  transition: border-color 0.15s ease;
}

.input-field:focus {
  border-color: var(--primary-color);
}

.input-field::placeholder {
  color: var(--text-color-muted);
}

.input-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.action-btn {
  width: 32px;
  height: 24px;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}
</style>
