<template>
  <div class="tool-call-card">
    <div class="tool-header" @click="handleHeaderClick">
      <Icon name="wrench" :size="14" class="tool-icon" />
      <span class="tool-name">{{ message.toolName }}</span>
      <span v-if="toolSummary" class="tool-summary">: {{ toolSummary }}</span>
      <span class="tool-status" :class="{ done: message.output }">
        {{ message.output ? '✓' : '...' }}
      </span>
      <Icon :name="expanded ? 'chevronUp' : 'chevronDown'" :size="12" class="expand-icon" />
    </div>
    <div v-if="expanded" class="tool-body">
      <div v-if="message.input" class="tool-section">
        <div class="section-label">Input</div>
        <pre class="tool-content" v-html="renderToolContent(message.input)" @click="handleToolContentClick"></pre>
      </div>
      <div v-if="message.output" class="tool-section">
        <div class="section-label">Output</div>
        <pre class="tool-content" v-html="renderToolContent(message.output)" @click="handleToolContentClick"></pre>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { normalizePathForDisplay, renderPlainTextWithLinks } from '@utils/message-render-utils'

const props = defineProps({
  message: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['preview-path'])

const expanded = ref(false)

/**
 * 提取工具调用中的文件路径（用于预览）
 */
const filePath = computed(() => {
  const input = props.message.input
  if (!input) return null
  // Read / Write / Edit 等工具的 file_path 或 filePath
  return input.file_path || input.filePath || null
})

/**
 * 点击工具标题：展开详情 + 如果有文件路径则触发预览
 */
const handleHeaderClick = () => {
  expanded.value = !expanded.value
  // 仅展开时触发预览，收起时不触发
  if (expanded.value && filePath.value) {
    emit('preview-path', filePath.value)
  }
}

const handleToolContentClick = (event) => {
  const link = event.target?.closest?.('.clickable-link')
  if (!link || link.dataset?.linkType !== 'path') return

  const href = link.dataset?.href
  if (!href) return

  event.preventDefault()
  event.stopPropagation()
  emit('preview-path', href)
}

/**
 * 获取工具调用的摘要信息
 * 优先级：description > command > 第一个参数值
 */
const toolSummary = computed(() => {
  const input = props.message.input
  if (!input) return ''

  // 优先使用 description（如果存在）
  if (input.description) {
    return truncate(input.description, 60)
  }

  // Bash 工具：显示 command
  if (props.message.toolName === 'Bash' && input.command) {
    return truncate(input.command, 60)
  }

  // 其他工具：尝试显示第一个有意义的字符串值（路径按平台规范化显示）
  const values = Object.values(input)
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return truncate(normalizePathForDisplay(value), 60)
    }
  }

  return ''
})

/**
 * 截断长文本
 */
const truncate = (str, maxLength) => {
  if (!str || str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

const normalizeDisplayValue = (value) => {
  const platform = window.electronAPI?.platform || 'win32'

  if (typeof value === 'string') {
    return normalizePathForDisplay(value, platform)
  }
  if (Array.isArray(value)) {
    return value.map(item => normalizeDisplayValue(item))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, normalizeDisplayValue(item)])
    )
  }
  return value
}

const formatJson = (obj) => {
  if (typeof obj === 'string') return normalizeDisplayValue(obj)
  try {
    return JSON.stringify(normalizeDisplayValue(obj), null, 2)
  } catch {
    return String(obj)
  }
}

const formatOutput = (output) => {
  if (typeof output === 'string') return normalizeDisplayValue(output)
  return formatJson(output)
}

const renderToolContent = (value) => {
  return renderPlainTextWithLinks(formatOutput(value), {
    platform: window.electronAPI?.platform || 'win32'
  })
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
  flex-shrink: 0;
}

.tool-summary {
  color: var(--text-color-secondary);
  font-weight: 400;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tool-status {
  font-size: 12px;
  color: var(--text-color-muted);
  flex-shrink: 0;
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

.tool-content :deep(.clickable-link) {
  color: var(--primary-color);
  text-decoration: underline;
  text-decoration-style: dashed;
  text-underline-offset: 2px;
  cursor: pointer;
}
</style>
