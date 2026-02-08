<template>
  <div class="chat-input-area">
    <div class="input-wrapper">
      <textarea
        ref="textareaRef"
        v-model="inputText"
        :placeholder="placeholder"
        :disabled="disabled"
        class="chat-textarea"
        rows="1"
        @input="autoResize"
        @keydown="handleKeyDown"
      />
      <button
        v-if="isStreaming"
        class="stop-btn"
        @click="$emit('cancel')"
        :title="t('agent.stopGeneration')"
      >
        <Icon name="stop" :size="18" />
      </button>
      <button
        v-else
        class="send-btn"
        :disabled="!inputText.trim() || disabled"
        @click="handleSend"
        :title="t('agent.send')"
      >
        <Icon name="send" :size="18" />
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  isStreaming: {
    type: Boolean,
    default: false
  },
  disabled: {
    type: Boolean,
    default: false
  },
  placeholder: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['send', 'cancel'])

const inputText = ref('')
const textareaRef = ref(null)

const autoResize = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      const newHeight = Math.min(textareaRef.value.scrollHeight, 200)
      textareaRef.value.style.height = `${newHeight}px`
    }
  })
}

const handleKeyDown = (event) => {
  // Enter 发送，Shift+Enter 换行
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

const handleSend = () => {
  const text = inputText.value.trim()
  if (!text || props.disabled || props.isStreaming) return

  emit('send', text)
  inputText.value = ''
  nextTick(autoResize)
}

const focus = () => {
  textareaRef.value?.focus()
}

onMounted(() => {
  focus()
})

defineExpose({ focus })
</script>

<style scoped>
.chat-input-area {
  padding: 12px 16px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-color);
}

.input-wrapper {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 8px 12px;
  transition: border-color 0.2s;
}

.input-wrapper:focus-within {
  border-color: var(--primary-color);
}

.chat-textarea {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.5;
  resize: none;
  outline: none;
  max-height: 200px;
  font-family: inherit;
}

.chat-textarea::placeholder {
  color: var(--text-color-muted);
}

.chat-textarea:disabled {
  opacity: 0.5;
}

.send-btn,
.stop-btn {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  flex-shrink: 0;
}

.send-btn {
  background: var(--primary-color);
  color: white;
}

.send-btn:hover:not(:disabled) {
  background: var(--primary-color-hover);
}

.send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.stop-btn {
  background: #ff4d4f;
  color: white;
}

.stop-btn:hover {
  background: #ff7875;
}
</style>
