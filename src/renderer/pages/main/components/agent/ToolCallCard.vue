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
import { ref, computed } from 'vue'
import Icon from '@components/icons/Icon.vue'

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
 * 将路径转换为当前操作系统友好的显示格式
 * Windows: /c/foo/bar → C:\foo\bar
 * macOS/Linux: 保持原样（Unix 路径不做处理）
 */
const normalizePathForDisplay = (str) => {
  if (!str || typeof str !== 'string') return str
  if (window.electronAPI?.platform === 'win32') {
    // MSYS 格式：/c/foo → C:\foo
    const msys = str.match(/^\/([a-zA-Z])\/(.*)/)
    if (msys) return msys[1].toUpperCase() + ':\\' + msys[2].replace(/\//g, '\\')
    // 正斜杠 Windows 路径：C:/foo → C:\foo
    if (/^[A-Za-z]:\//.test(str)) return str.replace(/\//g, '\\')
  }
  return str
}

/**
 * 截断长文本
 */
const truncate = (str, maxLength) => {
  if (!str || str.length <= maxLength) return str
  return str.slice(0, maxLength) + '...'
}

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
</style>
