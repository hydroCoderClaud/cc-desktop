<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.queue') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.queue.import')" @click="handleImport">
          📥
        </button>
        <button class="icon-btn" :title="t('rightPanel.queue.settings')" @click="showSettings = true">
          ⚙️
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <span class="mode-label">{{ t('rightPanel.queue.mode') }}:</span>
      <n-select
        v-model:value="mode"
        :options="modeOptions"
        size="small"
        style="width: 120px;"
      />
    </div>

    <div class="tab-content">
      <!-- Empty State -->
      <div v-if="queue.length === 0" class="empty-state">
        <div class="empty-icon">📋</div>
        <div class="empty-text">{{ t('rightPanel.queue.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.queue.emptyHint') }}</div>
      </div>

      <!-- Queue List -->
      <div v-else class="queue-list">
        <div
          v-for="(item, index) in queue"
          :key="item.id"
          class="queue-item"
        >
          <div class="item-index">{{ index + 1 }}</div>
          <div class="item-content">{{ item.command }}</div>
          <div class="item-actions">
            <button
              class="icon-btn small"
              :disabled="terminalBusy"
              :title="t('rightPanel.queue.send')"
              @click="handleSend(item)"
            >
              ▶
            </button>
            <button
              class="icon-btn small"
              :title="t('rightPanel.queue.remove')"
              @click="handleRemove(item)"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- History Section -->
    <div class="history-section" v-if="history.length > 0">
      <div class="section-header" @click="showHistory = !showHistory">
        <span>📜 {{ t('rightPanel.queue.history') }} ({{ history.length }})</span>
        <span class="toggle-icon">{{ showHistory ? '▼' : '▶' }}</span>
      </div>
      <div v-if="showHistory" class="history-list">
        <div
          v-for="item in history.slice(0, 5)"
          :key="item.id"
          class="history-item"
          @click="handleReuse(item)"
        >
          <span class="history-text">{{ item.command }}</span>
          <span class="history-time">{{ formatTime(item.executedAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NSelect } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  currentProject: Object,
  terminalBusy: Boolean
})

const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const mode = ref('manual')
const queue = ref([])
const history = ref([])
const showHistory = ref(false)
const showSettings = ref(false)

// Mode options
const modeOptions = computed(() => [
  { label: t('rightPanel.queue.modeManual'), value: 'manual' },
  { label: t('rightPanel.queue.modeSemiAuto'), value: 'semi-auto' },
  { label: t('rightPanel.queue.modeAuto'), value: 'auto' }
])

// Methods
const handleImport = () => {
  // TODO: Open import modal
  console.log('Import commands')
}

const handleSend = (item) => {
  if (props.terminalBusy) return
  emit('send-command', item.command)
  // Move to history
  history.value.unshift({
    ...item,
    executedAt: new Date()
  })
  queue.value = queue.value.filter(q => q.id !== item.id)
}

const handleRemove = (item) => {
  queue.value = queue.value.filter(q => q.id !== item.id)
}

const handleReuse = (item) => {
  emit('insert-to-input', item.command)
}

const formatTime = (date) => {
  if (!date) return ''
  const d = new Date(date)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Add command to queue (called from parent via QuickInput)
const addCommand = (command) => {
  queue.value.push({
    id: Date.now().toString(),
    command,
    addedAt: new Date()
  })
}

// Expose methods
defineExpose({
  addCommand
})
</script>

<style scoped>
.tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.icon-btn.small {
  width: 24px;
  height: 24px;
  font-size: 12px;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.tab-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--bg-color-tertiary);
}

.mode-label {
  font-size: 12px;
  color: var(--text-color-muted);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
}

/* Queue List */
.queue-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.queue-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.item-index {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--primary-color);
  color: white;
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.item-content {
  flex: 1;
  font-size: 13px;
  color: var(--text-color);
  word-break: break-word;
  line-height: 1.4;
}

.item-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
}

/* History Section */
.history-section {
  border-top: 1px solid var(--border-color);
  margin-top: auto;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  font-size: 12px;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: background 0.15s ease;
}

.section-header:hover {
  background: var(--hover-bg);
}

.toggle-icon {
  font-size: 10px;
}

.history-list {
  padding: 0 12px 12px;
}

.history-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  font-size: 12px;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.history-item:hover {
  background: var(--hover-bg);
}

.history-text {
  flex: 1;
  color: var(--text-color);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.history-time {
  color: var(--text-color-muted);
  font-size: 11px;
  margin-left: 8px;
}
</style>
