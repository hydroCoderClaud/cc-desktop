<template>
  <div class="quick-input">
    <div class="input-header">
      <div class="input-label-group">
        <span class="input-label">{{ t('rightPanel.quickInput.label') }}</span>
        <button
          v-if="inputText.trim()"
          class="clear-btn"
          :title="t('common.clear')"
          @click="inputText = ''"
        >
          <Icon name="close" :size="12" />
        </button>
      </div>
      <span class="input-hint">{{ t('rightPanel.quickInput.hint') }}</span>
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
          class="action-btn send-btn"
          :disabled="!inputText.trim()"
          :title="t('rightPanel.quickInput.send')"
          @click="handleSendToTerminal"
        >
          <Icon name="play" :size="16" />
        </button>
        <button
          class="action-btn"
          :disabled="!inputText.trim()"
          :title="t('rightPanel.quickInput.addToQueue')"
          @click="handleAddToQueue"
        >
          <Icon name="add" :size="16" />
        </button>
        <button
          class="action-btn create-prompt-btn"
          :disabled="!inputText.trim()"
          :title="t('rightPanel.quickInput.createPrompt')"
          @click="handleCreatePrompt"
        >
          <Icon name="message" :size="16" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const emit = defineEmits(['add-to-queue', 'send-to-terminal', 'create-prompt'])

// Refs
const textareaRef = ref(null)
const inputText = ref('')

// Handle keyboard shortcuts
const handleKeydown = (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    // Enter: Send to terminal, focus terminal
    e.preventDefault()
    handleSendToTerminal()
  } else if (e.key === 'Escape') {
    inputText.value = ''
    textareaRef.value?.blur()
  }
  // Shift+Enter: Allow newline (default behavior)
}

// Add to queue
const handleAddToQueue = () => {
  const text = inputText.value.trim()
  if (!text) return

  emit('add-to-queue', text)
  inputText.value = ''
}

// Send to terminal
const handleSendToTerminal = () => {
  const text = inputText.value.trim()
  if (!text) return

  emit('send-to-terminal', text)
  inputText.value = ''
}

// Create prompt from current input
const handleCreatePrompt = () => {
  const text = inputText.value.trim()
  if (!text) return

  emit('create-prompt', text)
  // Don't clear input - user might want to continue editing
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

.input-label-group {
  display: flex;
  align-items: center;
  gap: 6px;
}

.input-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color);
}

.clear-btn {
  width: 20px;
  height: 20px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.clear-btn:hover {
  background: #ff4d4f;
  color: white;
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
  height: 100%;
  border-radius: 4px;
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color-muted);
  transition: all 0.15s ease;
}

.action-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
