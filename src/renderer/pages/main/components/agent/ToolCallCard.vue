<template>
  <div class="tool-call-card">
    <div class="tool-header" @click="expanded = !expanded">
      <Icon name="wrench" :size="14" class="tool-icon" />
      <span class="tool-name">{{ message.toolName }}</span>
      <span class="tool-status" :class="{ done: message.output }">
        {{ message.output ? '✓' : '...' }}
      </span>
      <Icon :name="expanded ? 'chevronUp' : 'chevronDown'" :size="12" class="expand-icon" />
    </div>
    <div v-if="expanded" class="tool-body">
      <div v-if="message.input" class="tool-section">
        <div class="section-label">Input</div>
        <pre class="tool-content">{{ formatJson(message.input) }}</pre>
      </div>
      <div v-if="message.output" class="tool-section">
        <div class="section-label">Output</div>
        <pre class="tool-content">{{ formatOutput(message.output) }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const expanded = ref(false)

const formatJson = (obj) => {
  if (typeof obj === 'string') return obj
  try {
    return JSON.stringify(obj, null, 2)
  } catch {
    return String(obj)
  }
}

const formatOutput = (output) => {
  if (typeof output === 'string') return output
  return formatJson(output)
}
</script>

<style scoped>
.tool-call-card {
  margin: 6px 16px 6px 58px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
  background: var(--bg-color-secondary);
}

.tool-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-size: 13px;
}

.tool-header:hover {
  background: var(--hover-bg);
}

.tool-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.tool-name {
  font-weight: 600;
  color: var(--text-color);
  flex: 1;
}

.tool-status {
  font-size: 12px;
  color: var(--text-color-muted);
}

.tool-status.done {
  color: #52c41a;
}

.expand-icon {
  color: var(--text-color-muted);
  flex-shrink: 0;
}

.tool-body {
  border-top: 1px solid var(--border-color);
  padding: 8px 12px;
}

.tool-section {
  margin-bottom: 8px;
}

.tool-section:last-child {
  margin-bottom: 0;
}

.section-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  margin-bottom: 4px;
}

.tool-content {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 12px;
  line-height: 1.5;
  background: var(--bg-color-tertiary);
  padding: 8px;
  border-radius: 4px;
  overflow-x: auto;
  max-height: 200px;
  overflow-y: auto;
  margin: 0;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--text-color);
}
</style>
