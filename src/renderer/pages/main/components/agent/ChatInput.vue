<template>
  <div class="chat-input-area">
    <!-- 工具栏：模型选择 -->
    <div class="input-toolbar">
      <div class="model-selector" @click="toggleModelDropdown" ref="selectorRef">
        <Icon name="robot" :size="14" class="model-icon" />
        <span class="model-label">{{ modelDisplayName }}</span>
        <Icon name="chevronDown" :size="12" class="chevron" :class="{ open: showDropdown }" />
      </div>

      <!-- 下拉菜单 -->
      <Transition name="dropdown">
        <div v-if="showDropdown" class="model-dropdown">
          <div
            v-for="m in modelOptions"
            :key="m.value"
            class="model-option"
            :class="{ active: modelValue === m.value }"
            @click="selectModel(m.value)"
          >
            <span class="option-name">{{ m.label }}</span>
            <span class="option-desc">{{ m.desc }}</span>
            <Icon v-if="modelValue === m.value" name="check" :size="14" class="check-icon" />
          </div>
        </div>
      </Transition>
    </div>

    <!-- 输入区域 -->
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
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
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
  },
  modelValue: {
    type: String,
    default: 'sonnet'
  }
})

const emit = defineEmits(['send', 'cancel', 'update:modelValue'])

const modelOptions = [
  { value: 'sonnet', label: 'Sonnet', desc: t('agent.modelBalanced') },
  { value: 'opus', label: 'Opus', desc: t('agent.modelPowerful') },
  { value: 'haiku', label: 'Haiku', desc: t('agent.modelFast') }
]

const modelDisplayName = computed(() => {
  const found = modelOptions.find(m => m.value === props.modelValue)
  return found ? found.label : 'Sonnet'
})

const showDropdown = ref(false)
const selectorRef = ref(null)

const toggleModelDropdown = () => {
  showDropdown.value = !showDropdown.value
}

const selectModel = (value) => {
  emit('update:modelValue', value)
  showDropdown.value = false
}

// 点击外部关闭下拉
const handleClickOutside = (e) => {
  if (selectorRef.value && !selectorRef.value.contains(e.target)) {
    showDropdown.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  focus()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

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

defineExpose({ focus })
</script>

<style scoped>
.chat-input-area {
  padding: 8px 16px 12px;
  border-top: 1px solid var(--border-color);
  background: var(--bg-color);
}

/* Toolbar */
.input-toolbar {
  display: flex;
  align-items: center;
  margin-bottom: 6px;
  position: relative;
}

.model-selector {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 3px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}

.model-selector:hover {
  background: var(--hover-bg);
}

.model-icon {
  color: var(--primary-color);
}

.model-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
}

.chevron {
  color: var(--text-color-muted);
  transition: transform 0.2s;
}

.chevron.open {
  transform: rotate(180deg);
}

/* Dropdown */
.model-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 4px;
  min-width: 220px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.model-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.15s;
}

.model-option:hover {
  background: var(--hover-bg);
}

.model-option.active {
  background: var(--hover-bg);
}

.option-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
}

.option-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  flex: 1;
}

.check-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

/* Dropdown transition */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(4px);
}

/* Input wrapper */
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
