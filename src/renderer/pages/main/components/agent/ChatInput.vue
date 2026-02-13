<template>
  <div class="chat-input-area">
    <!-- 工具栏：模型选择 + token -->
    <div class="input-toolbar">
      <div class="toolbar-left">
        <div class="model-selector" @click="toggleModelDropdown" ref="selectorRef">
          <Icon name="robot" :size="14" class="model-icon" />
          <span class="model-label">{{ modelDisplayName }}</span>
          <Icon name="chevronDown" :size="12" class="chevron" :class="{ open: showDropdown }" />
        </div>

        <!-- 模型下拉菜单 -->
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

        <!-- 能力快捷使用 -->
        <div class="cap-quick-access" ref="capSelectorRef">
          <div
            class="cap-trigger"
            :class="{ active: showCapDropdown }"
            :title="t('agent.capabilityManagement')"
            @click="toggleCapDropdown"
          >
            <Icon name="zap" :size="13" class="cap-zap-icon" />
          </div>
          <Transition name="dropdown">
            <div v-if="showCapDropdown" class="cap-dropdown">
              <div v-if="capLoading" class="cap-loading">{{ t('common.loading') }}...</div>
              <template v-else>
                <div
                  v-for="cap in capList"
                  :key="cap.id"
                  class="cap-item"
                  @click="useCapability(cap)"
                >
                  <span class="cap-type-dot" :class="'dot-' + cap.type"></span>
                  <span class="cap-type-label" :class="'label-' + cap.type">{{ cap.type === 'agent' ? t('agent.capTypeAgent') : t('agent.capTypeSkill') }}</span>
                  <span class="cap-item-name">{{ cap.name }}</span>
                  <span class="cap-item-desc">{{ cap.description }}</span>
                </div>
                <div v-if="capList.length === 0" class="cap-empty">{{ t('agent.noCapabilities') }}</div>
              </template>
            </div>
          </Transition>
        </div>

        <!-- 队列开关 -->
        <div
          class="queue-toggle"
          :class="{ enabled: queueEnabled }"
          :title="queueEnabled ? t('agent.queueToggleOn') : t('agent.queueToggleOff')"
          @click="$emit('update:queueEnabled', !queueEnabled)"
        >
          <Icon name="queue" :size="13" class="queue-toggle-icon" />
        </div>
      </div>

      <div class="toolbar-right">
        <span v-if="activeModel" class="active-model" :title="activeModel">{{ activeModel }}</span>
        <span v-if="contextTokens > 0" class="token-count" :title="t('agent.contextTokensHint')">
          {{ formatTokens(contextTokens) }} tokens
        </span>
      </div>
    </div>

    <!-- 输入区域 -->
    <div class="input-wrapper" ref="inputWrapperRef">
      <!-- Slash 命令面板 -->
      <Transition name="slash-panel">
        <div v-if="showSlashPanel" class="slash-panel">
          <div class="slash-panel-header">
            <Icon name="zap" :size="12" />
            <span>{{ t('agent.slashTitle') }}</span>
          </div>
          <div
            v-for="(cmd, index) in filteredCommands"
            :key="cmd.name"
            class="slash-item"
            :class="{ active: slashActiveIndex === index }"
            @click="selectSlashCommand(cmd)"
            @mouseenter="slashActiveIndex = index"
          >
            <Icon :name="cmd.icon" :size="14" class="slash-item-icon" />
            <div class="slash-item-info">
              <span class="slash-item-name">{{ cmd.name }}</span>
              <span class="slash-item-desc">{{ cmd.desc }}</span>
            </div>
          </div>
          <div v-if="filteredCommands.length === 0" class="slash-empty">
            {{ t('agent.slashNoMatch') }}
          </div>
        </div>
      </Transition>

      <textarea
        ref="textareaRef"
        v-model="inputText"
        :placeholder="placeholder"
        :disabled="disabled"
        class="chat-textarea"
        rows="1"
        @input="handleInput"
        @keydown="handleKeyDown"
      />
      <!-- 队列徽章（独立显示，只要有消息就显示，不管队列是否启用） -->
      <div v-if="messageQueue.length > 0" class="queue-wrapper" ref="queueWrapperRef">
        <span class="queue-badge" @click="showQueuePanel = !showQueuePanel">
          {{ messageQueue.length }}
        </span>
        <Transition name="dropdown">
          <div v-if="showQueuePanel" class="queue-panel">
            <div class="queue-panel-header">
              <span>{{ t('agent.queueTitle') }}</span>
              <span class="queue-panel-count">{{ messageQueue.length }}</span>
            </div>
            <div class="queue-panel-list">
              <div
                v-for="(msg, idx) in messageQueue"
                :key="msg.id"
                class="queue-item"
                :class="{ editing: editingId === msg.id, dragging: draggingId === msg.id }"
                draggable="true"
                @dragstart="handleDragStart(idx, $event)"
                @dragover.prevent="handleDragOver(idx, $event)"
                @drop="handleDrop(idx, $event)"
                @dragend="handleDragEnd"
              >
                <Icon name="menu" :size="14" class="queue-item-drag-handle" />
                <span class="queue-item-index">{{ idx + 1 }}</span>

                <!-- 编辑模式 -->
                <input
                  v-if="editingId === msg.id"
                  v-model="editingText"
                  class="queue-item-input"
                  @keydown.enter="saveEdit(idx)"
                  @keydown.esc="cancelEdit"
                  @blur="saveEdit(idx)"
                  ref="editInputRef"
                />
                <!-- 查看模式 -->
                <span
                  v-else
                  class="queue-item-text"
                  @click="startEdit(msg)"
                >
                  {{ msg.text }}
                </span>

                <button class="queue-item-del" @click="removeFromQueue(idx)" :title="t('common.delete')">
                  <Icon name="close" :size="12" />
                </button>
              </div>
            </div>
            <button v-if="messageQueue.length > 1" class="queue-clear-btn" @click="clearQueue(); showQueuePanel = false">
              {{ t('agent.queueClearAll') }}
            </button>
          </div>
        </Transition>
      </div>
      <!-- 停止/发送按钮 -->
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
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
  },
  contextTokens: {
    type: Number,
    default: 0
  },
  slashCommands: {
    type: Array,
    default: () => []
  },
  activeModel: {
    type: String,
    default: ''
  },
  queueEnabled: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['send', 'cancel', 'update:modelValue', 'update:queueEnabled', 'enqueue'])

// ============================
// Token 格式化
// ============================
const formatTokens = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`
  return `${n}`
}

// ============================
// 模型选择
// ============================
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
  showCapDropdown.value = false
}

const selectModel = (value) => {
  emit('update:modelValue', value)
  showDropdown.value = false
}

// ============================
// 能力快捷使用
// ============================
const showCapDropdown = ref(false)
const capSelectorRef = ref(null)
const capList = ref([])
const capLoading = ref(false)
const capLoaded = ref(false)

const toggleCapDropdown = () => {
  showCapDropdown.value = !showCapDropdown.value
  showDropdown.value = false
  if (showCapDropdown.value && !capLoaded.value) {
    loadCapabilities()
  }
}

const loadCapabilities = async () => {
  if (!window.electronAPI?.fetchCapabilities) return
  capLoading.value = true
  try {
    const result = await window.electronAPI.fetchCapabilities()
    if (!result.success) return

    const items = []
    const pluginsToExpand = []

    for (const cap of result.capabilities) {
      if (!cap.installed || cap.disabled) continue

      if (cap.type === 'skill' || cap.type === 'agent') {
        items.push({
          id: cap.componentId || cap.id,
          name: cap.name,
          description: cap.description || '',
          type: cap.type
        })
      } else if (cap.type === 'plugin') {
        pluginsToExpand.push(cap)
      }
    }

    // 展开 plugin 内部的 skill/agent 子组件
    if (pluginsToExpand.length > 0 && window.electronAPI.getPluginDetails) {
      const details = await Promise.all(
        pluginsToExpand.map(cap =>
          window.electronAPI.getPluginDetails(cap.componentId).catch(() => null)
        )
      )
      for (let i = 0; i < details.length; i++) {
        const detail = details[i]
        if (!detail?.components) continue
        const pluginShort = pluginsToExpand[i].componentId.split('@')[0]
        for (const s of (detail.components.skills || [])) {
          items.push({
            id: `${pluginShort}:${s.id}`,
            name: s.name || s.id,
            description: s.description || '',
            type: 'skill'
          })
        }
        for (const a of (detail.components.agents || [])) {
          items.push({
            id: `${pluginShort}:${a.name}`,
            name: a.name,
            description: a.description || '',
            type: 'agent'
          })
        }
      }
    }

    capList.value = items
  } catch (err) {
    console.error('[ChatInput] loadCapabilities error:', err)
  } finally {
    capLoading.value = false
    capLoaded.value = true
  }
}

const useCapability = (cap) => {
  showCapDropdown.value = false
  if (props.isStreaming && !props.queueEnabled) return
  const prefix = cap.type === 'agent' ? '@' : '/'
  const text = `${prefix}${cap.id}`
  if (props.isStreaming) {
    if (messageQueue.value.length >= MAX_QUEUE_SIZE) return
    messageQueue.value.push({ id: ++queueIdCounter, text })
    emit('enqueue', text)
  } else {
    emit('send', text)
  }
}

// ============================
// Slash 命令面板
// ============================

// 内置命令描述（带图标和中文说明）
const builtinCommands = computed(() => [
  { name: '/compact', icon: 'compress', desc: t('agent.cmdCompact') },
  { name: '/cost', icon: 'info', desc: t('agent.cmdCost') },
  { name: '/status', icon: 'terminal', desc: t('agent.cmdStatus') },
  { name: '/help', icon: 'info', desc: t('agent.cmdHelp') },
  { name: '/clear', icon: 'close', desc: t('agent.cmdClear') }
])

// 合并内置 + SDK 动态命令（去重，SDK 的排后面）
const allCommands = computed(() => {
  const builtinNames = new Set(builtinCommands.value.map(c => c.name))
  const extra = (props.slashCommands || [])
    .filter(name => !builtinNames.has(name))
    .map(name => ({ name, icon: 'zap', desc: '' }))
  return [...builtinCommands.value, ...extra]
})

const showSlashPanel = ref(false)
const slashActiveIndex = ref(0)
const slashFilter = ref('')

const filteredCommands = computed(() => {
  if (!slashFilter.value) return allCommands.value
  const q = slashFilter.value.toLowerCase()
  return allCommands.value.filter(c => c.name.toLowerCase().includes(q))
})

// 监听 filteredCommands 变化，重置索引
watch(filteredCommands, () => {
  slashActiveIndex.value = 0
})

const selectSlashCommand = (cmd) => {
  inputText.value = cmd.name
  showSlashPanel.value = false
  handleSend()
}

// ============================
// 输入与发送
// ============================
const inputText = ref('')
const textareaRef = ref(null)
const inputWrapperRef = ref(null)

const autoResize = () => {
  nextTick(() => {
    if (textareaRef.value) {
      textareaRef.value.style.height = 'auto'
      const newHeight = Math.min(textareaRef.value.scrollHeight, 200)
      textareaRef.value.style.height = `${newHeight}px`
    }
  })
}

const handleInput = () => {
  autoResize()

  // 检测 slash 命令
  const text = inputText.value
  if (text.startsWith('/') && !text.includes(' ')) {
    showSlashPanel.value = true
    slashFilter.value = text
  } else {
    showSlashPanel.value = false
    slashFilter.value = ''
  }
}

const handleKeyDown = (event) => {
  // Slash 面板激活时的键盘导航
  if (showSlashPanel.value) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      slashActiveIndex.value = Math.min(slashActiveIndex.value + 1, filteredCommands.value.length - 1)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      slashActiveIndex.value = Math.max(slashActiveIndex.value - 1, 0)
      return
    }
    if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
      if (filteredCommands.value.length > 0) {
        event.preventDefault()
        selectSlashCommand(filteredCommands.value[slashActiveIndex.value])
        return
      }
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      showSlashPanel.value = false
      return
    }
  }

  // 普通模式：Enter 发送，Shift+Enter 换行
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

// 消息队列（流式输出期间暂存）
const messageQueue = ref([])
const showQueuePanel = ref(false)
const queueWrapperRef = ref(null)
const MAX_QUEUE_SIZE = 10
let queueIdCounter = 0

const clearQueue = () => {
  messageQueue.value = []
  showQueuePanel.value = false
}

const dequeue = () => {
  if (messageQueue.value.length === 0) return null
  const item = messageQueue.value.shift()
  if (messageQueue.value.length === 0) {
    showQueuePanel.value = false
  }
  return item.text
}

const removeFromQueue = (index) => {
  messageQueue.value.splice(index, 1)
  if (messageQueue.value.length === 0) {
    showQueuePanel.value = false
  }
}

// ============================
// 队列项编辑
// ============================
const editingId = ref(null)
const editingText = ref('')
const editInputRef = ref(null)

const startEdit = (msg) => {
  editingId.value = msg.id
  editingText.value = msg.text
  nextTick(() => {
    if (editInputRef.value) {
      editInputRef.value.focus()
      editInputRef.value.select()
    }
  })
}

const saveEdit = (index) => {
  if (editingId.value === null) return
  const text = editingText.value.trim()
  if (text) {
    messageQueue.value[index].text = text
  }
  editingId.value = null
  editingText.value = ''
}

const cancelEdit = () => {
  editingId.value = null
  editingText.value = ''
}

// ============================
// 队列拖拽排序
// ============================
const draggingId = ref(null)
let dragStartIndex = null

const handleDragStart = (index, event) => {
  draggingId.value = messageQueue.value[index].id
  dragStartIndex = index
  event.dataTransfer.effectAllowed = 'move'
}

const handleDragOver = (index, event) => {
  event.dataTransfer.dropEffect = 'move'
}

const handleDrop = (dropIndex, event) => {
  event.preventDefault()
  if (dragStartIndex === null || dragStartIndex === dropIndex) return

  const item = messageQueue.value.splice(dragStartIndex, 1)[0]
  messageQueue.value.splice(dropIndex, 0, item)

  dragStartIndex = null
}

const handleDragEnd = () => {
  draggingId.value = null
  dragStartIndex = null
}

const handleSend = () => {
  const text = inputText.value.trim()
  if (!text || props.disabled) return
  // 队列关闭时，流式输出中禁止发送
  if (props.isStreaming && !props.queueEnabled) return

  showSlashPanel.value = false

  if (props.isStreaming) {
    // 流式输出中 → 加入队列（上限 MAX_QUEUE_SIZE 条）
    if (messageQueue.value.length >= MAX_QUEUE_SIZE) return
    messageQueue.value.push({ id: ++queueIdCounter, text })
    emit('enqueue', text)
  } else {
    emit('send', text)
  }
  inputText.value = ''
  nextTick(autoResize)
}

// ============================
// 点击外部关闭
// ============================
const handleClickOutside = (e) => {
  if (selectorRef.value && !selectorRef.value.contains(e.target)) {
    showDropdown.value = false
  }
  if (capSelectorRef.value && !capSelectorRef.value.contains(e.target)) {
    showCapDropdown.value = false
  }
  if (inputWrapperRef.value && !inputWrapperRef.value.contains(e.target)) {
    showSlashPanel.value = false
  }
  if (queueWrapperRef.value && !queueWrapperRef.value.contains(e.target)) {
    showQueuePanel.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  focus()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})

const focus = () => {
  textareaRef.value?.focus()
}

defineExpose({ focus, messageQueue, dequeue, clearQueue })
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
  justify-content: space-between;
  margin-bottom: 6px;
  position: relative;
}

.toolbar-left {
  display: flex;
  align-items: center;
  position: relative;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.active-model {
  font-size: 11px;
  color: var(--text-color-muted);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.token-count {
  font-size: 11px;
  color: var(--text-color-muted);
  font-variant-numeric: tabular-nums;
  user-select: none;
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

/* Model Dropdown */
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

/* Queue Toggle */
.queue-toggle {
  display: flex;
  align-items: center;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
  margin-left: 4px;
}

.queue-toggle:hover {
  background: var(--hover-bg);
}

.queue-toggle-icon {
  color: var(--text-color-muted);
  opacity: 0.4;
  transition: all 0.2s;
}

.queue-toggle.enabled .queue-toggle-icon {
  color: var(--primary-color);
  opacity: 1;
}

/* Capability Quick Access */
.cap-quick-access {
  position: relative;
  margin-left: 4px;
}

.cap-trigger {
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 3px 6px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.2s;
  user-select: none;
}

.cap-trigger:hover,
.cap-trigger.active {
  background: var(--hover-bg);
}

.cap-zap-icon {
  color: var(--text-color-muted);
  transition: color 0.2s;
}

.cap-trigger:hover .cap-zap-icon,
.cap-trigger.active .cap-zap-icon {
  color: var(--primary-color);
}

.cap-dropdown {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 4px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 6px;
  min-width: 260px;
  max-height: 320px;
  overflow-y: auto;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.cap-loading {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
}

.cap-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.1s;
}

.cap-item:hover {
  background: var(--hover-bg);
}

.cap-type-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.cap-type-dot.dot-skill {
  background: #1890ff;
}

.cap-type-dot.dot-agent {
  background: #722ed1;
}

.cap-type-dot.dot-plugin {
  background: #52c41a;
}

.cap-type-label {
  font-size: 10px;
  flex-shrink: 0;
  opacity: 0.7;
}

.cap-type-label.label-skill {
  color: #1890ff;
}

.cap-type-label.label-agent {
  color: #722ed1;
}

.cap-item-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-color);
  white-space: nowrap;
  flex-shrink: 0;
}

.cap-item-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cap-empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-color-muted);
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
  position: relative;
}

.input-wrapper:focus-within {
  border-color: var(--primary-color);
}

/* Slash Command Panel */
.slash-panel {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
  max-height: 240px;
  overflow-y: auto;
}

.slash-panel-header {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.slash-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 7px;
  cursor: pointer;
  transition: background 0.1s;
}

.slash-item:hover,
.slash-item.active {
  background: var(--hover-bg);
}

.slash-item-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.slash-item-info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.slash-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  font-family: 'SF Mono', 'Fira Code', monospace;
}

.slash-item-desc {
  font-size: 11px;
  color: var(--text-color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slash-empty {
  padding: 12px 10px;
  font-size: 12px;
  color: var(--text-color-muted);
  text-align: center;
}

/* Slash panel transition */
.slash-panel-enter-active,
.slash-panel-leave-active {
  transition: opacity 0.12s, transform 0.12s;
}

.slash-panel-enter-from,
.slash-panel-leave-to {
  opacity: 0;
  transform: translateY(4px);
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

.queue-wrapper {
  position: relative;
}

.queue-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 5px;
  border-radius: 10px;
  background: var(--primary-color);
  color: white;
  font-size: 11px;
  font-weight: 600;
  line-height: 1;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
  transition: background 0.15s;
}

.queue-badge:hover {
  background: var(--primary-color-hover, var(--primary-color));
  transform: scale(1.1);
}

/* 队列面板 */
.queue-panel {
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 8px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 6px;
  min-width: 280px;
  max-width: 380px;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  z-index: 100;
}

.queue-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.queue-panel-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--primary-color);
  color: white;
  font-size: 10px;
  font-weight: 600;
}

.queue-panel-list {
  overflow-y: auto;
  flex: 1;
}

.queue-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 7px;
  transition: background 0.1s;
  cursor: grab;
}

.queue-item:hover {
  background: var(--hover-bg);
}

.queue-item.editing {
  background: var(--hover-bg);
}

.queue-item.dragging {
  opacity: 0.5;
  cursor: grabbing;
}

.queue-item-index {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 9px;
  background: var(--border-color);
  color: var(--text-color-muted);
  font-size: 10px;
  font-weight: 600;
  flex-shrink: 0;
}

.queue-item-drag-handle {
  color: var(--text-color-muted);
  opacity: 0.3;
  flex-shrink: 0;
  cursor: grab;
  transition: opacity 0.2s;
}

.queue-item:hover .queue-item-drag-handle {
  opacity: 0.6;
}

.queue-item-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: text;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background 0.15s;
}

.queue-item-text:hover {
  background: rgba(0, 0, 0, 0.03);
}

.queue-item-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-color);
  background: var(--bg-color);
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  padding: 3px 6px;
  outline: none;
  font-family: inherit;
}

.queue-item-del {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s;
}

.queue-item:hover .queue-item-del {
  opacity: 1;
}

.queue-item-del:hover {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

.queue-clear-btn {
  margin-top: 4px;
  padding: 5px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #ff4d4f;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}

.queue-clear-btn:hover {
  background: rgba(255, 77, 79, 0.08);
}

.stop-btn {
  background: #ff4d4f;
  color: white;
}

.stop-btn:hover {
  background: #ff7875;
}
</style>
