<template>
  <div class="quick-input">
    <div class="input-header">
      <div class="input-label-group">
        <span class="input-label">{{ t('rightPanel.quickInput.label') }}</span>
        <button
          class="header-action-btn"
          :disabled="!inputText.trim()"
          :title="t('rightPanel.quickInput.addToQueue')"
          @click="handleAddToQueue"
        >
          <Icon name="add" :size="14" />
        </button>
        <button
          class="header-action-btn"
          :title="t('rightPanel.quickInput.createPrompt')"
          @click="handleCreatePrompt"
        >
          <Icon name="message" :size="14" />
        </button>
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
    <textarea
      ref="textareaRef"
      v-model="inputText"
      class="input-field"
      :placeholder="t('rightPanel.quickInput.placeholder')"
      rows="4"
      @keydown="handleKeydown"
    />
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

.header-action-btn {
  width: 22px;
  height: 22px;
  border-radius: 3px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.header-action-btn:hover:not(:disabled) {
  background: var(--primary-ghost-hover);
  color: var(--primary-color);
}

.header-action-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.input-hint {
  font-size: 11px;
  color: var(--text-color-muted);
}

.input-field {
  width: 100%;
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
</style>
