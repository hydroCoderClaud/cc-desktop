<template>
  <div class="streaming-indicator" v-if="visible">
    <div class="bubble-avatar">
      <Icon name="robot" :size="16" />
    </div>
    <div class="streaming-content">
      <div class="streaming-text" v-if="text" v-html="renderedText"></div>
      <div class="typing-dots" v-else>
        <span></span>
        <span></span>
        <span></span>
        <span v-if="elapsed > 0" class="elapsed-time">{{ elapsed }}s</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  text: {
    type: String,
    default: ''
  },
  elapsed: {
    type: Number,
    default: 0
  }
})

const renderedText = computed(() => {
  let text = props.text || ''
  text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  text = text.replace(/\n/g, '<br>')
  return text + '<span class="cursor-blink">▎</span>'
})
</script>

<style scoped>
.streaming-indicator {
  display: flex;
  gap: 10px;
  padding: 8px 16px;
}

.bubble-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--bg-color-tertiary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: var(--primary-color);
}

.streaming-content {
  max-width: 75%;
  min-width: 0;
}

.streaming-text {
  padding: 10px 14px;
  border-radius: 12px;
  border-top-left-radius: 4px;
  background: var(--bg-color-secondary);
  color: var(--text-color);
  font-size: 14px;
  line-height: 1.6;
  word-wrap: break-word;
}

.streaming-text :deep(.cursor-blink) {
  animation: blink 1s step-end infinite;
  color: var(--primary-color);
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.typing-dots {
  display: flex;
  gap: 4px;
  padding: 14px 18px;
  background: var(--bg-color-secondary);
  border-radius: 12px;
  border-top-left-radius: 4px;
}

.typing-dots span {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-color-muted);
  animation: dotPulse 1.4s infinite;
}

.typing-dots span:nth-child(2) {
  animation-delay: 0.2s;
}

.typing-dots span:nth-child(3) {
  animation-delay: 0.4s;
}

@keyframes dotPulse {
  0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
  40% { opacity: 1; transform: scale(1); }
}

.elapsed-time {
  width: auto !important;
  height: auto !important;
  background: none !important;
  border-radius: 0 !important;
  animation: none !important;
  font-size: 11px;
  color: var(--text-color-muted);
  margin-left: 6px;
  font-variant-numeric: tabular-nums;
}
</style>
