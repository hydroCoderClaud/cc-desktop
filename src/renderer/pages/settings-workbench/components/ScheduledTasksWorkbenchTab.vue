<template>
  <div class="scheduled-workbench">
    <div class="header-row">
      <div>
        <div class="title-line">{{ t('rightPanel.tabs.scheduledTasks') }}</div>
        <div class="subtitle">{{ t('rightPanel.scheduledTasks.taskCount', { count: tasks.length }) }}</div>
      </div>
      <n-button size="small" secondary :loading="loading" @click="loadTasks">
        <template #icon><Icon name="refresh" :size="14" /></template>
        {{ t('common.refresh') }}
      </n-button>
    </div>

    <div v-if="loading && !tasks.length" class="state-box">
      <Icon name="clock" :size="18" class="spin" />
      <span>{{ t('common.loading') }}</span>
    </div>

    <div v-else-if="!tasks.length" class="state-box">
      <Icon name="clock" :size="24" />
      <span>{{ t('rightPanel.scheduledTasks.empty') }}</span>
    </div>

    <div v-else class="task-list">
      <div v-for="task in tasks" :key="task.id" class="task-row">
        <div class="task-main">
          <span class="status-dot" :class="{ enabled: task.enabled }"></span>
          <div class="task-copy">
            <span class="task-name">{{ task.name || t('rightPanel.scheduledTasks.createTask') }}</span>
            <span class="task-schedule">{{ describeSchedule(task) }}</span>
          </div>
        </div>

        <div class="task-actions">
          <button class="text-btn" :disabled="runningTaskId === task.id" @click="runNow(task)">
            {{ t('rightPanel.scheduledTasks.runNow') }}
          </button>
          <button class="text-btn" @click="toggleEnabled(task)">
            {{ task.enabled ? t('rightPanel.scheduledTasks.disabled') : t('rightPanel.scheduledTasks.enabled') }}
          </button>
          <button class="text-btn primary" @click="openEditor(task)">
            {{ t('common.edit') }}
          </button>
        </div>
      </div>
    </div>

    <n-modal v-model:show="showEditor" @after-leave="editingTaskId = null">
      <div class="scheduled-task-manager-modal">
        <ScheduledTaskDetailPanel
          v-if="showEditor && editingTaskId"
          :task-id="editingTaskId"
          :current-project="currentProject"
          @close="showEditor = false"
          @updated="handleTaskChanged"
          @deleted="handleTaskDeleted"
        />
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { NButton, NModal, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import ScheduledTaskDetailPanel from '@/pages/main/components/agent/ScheduledTaskDetailPanel.vue'
import { buildWeeklyDayOptions, describeScheduledTask } from '@utils/scheduled-task-meta'

const props = defineProps({
  currentProject: {
    type: Object,
    default: null
  }
})

const { t } = useLocale()
const message = useMessage()
const weeklyDayOptions = buildWeeklyDayOptions(t)

const tasks = ref([])
const loading = ref(false)
const runningTaskId = ref(null)
const showEditor = ref(false)
const editingTaskId = ref(null)
let cleanupTaskChanged = null

const loadTasks = async () => {
  if (!window.electronAPI?.listScheduledTasks) return
  loading.value = true
  try {
    const result = await window.electronAPI.listScheduledTasks()
    tasks.value = Array.isArray(result) ? result : []
  } catch (err) {
    console.error('[ScheduledTasksWorkbenchTab] loadTasks failed:', err)
    message.error(err.message || t('rightPanel.scheduledTasks.runFailed'))
  } finally {
    loading.value = false
  }
}

const describeSchedule = (task) => {
  return describeScheduledTask(task, t, weeklyDayOptions)
}

const runNow = async (task) => {
  runningTaskId.value = task.id
  try {
    const result = await window.electronAPI.runScheduledTaskNow(task.id)
    if (result?.error) throw new Error(result.error)
    message.success(t('rightPanel.scheduledTasks.runQueued'))
    await loadTasks()
  } catch (err) {
    message.error(err.message || t('rightPanel.scheduledTasks.runFailed'))
  } finally {
    runningTaskId.value = null
  }
}

const toggleEnabled = async (task) => {
  const result = await window.electronAPI.updateScheduledTask({
    taskId: task.id,
    updates: { enabled: !task.enabled }
  })
  if (result?.error) {
    message.error(result.error)
    return
  }
  await loadTasks()
}

const openEditor = (task) => {
  editingTaskId.value = task.id
  showEditor.value = true
}

const handleTaskChanged = async () => {
  await loadTasks()
}

const handleTaskDeleted = async () => {
  showEditor.value = false
  await loadTasks()
}

watch(() => props.currentProject?.path, () => {
  if (showEditor.value) return
  loadTasks()
})

onMounted(() => {
  loadTasks()
  if (window.electronAPI?.onScheduledTaskChanged) {
    cleanupTaskChanged = window.electronAPI.onScheduledTaskChanged(() => {
      loadTasks()
    })
  }
})

onUnmounted(() => {
  if (cleanupTaskChanged) cleanupTaskChanged()
})
</script>

<style scoped>
.scheduled-workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  height: 100%;
  overflow: auto;
}

.header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title-line {
  color: var(--text-color);
  font-size: 16px;
  font-weight: 700;
}

.subtitle {
  margin-top: 2px;
  color: var(--text-color-muted);
  font-size: 12px;
}

.state-box {
  min-height: 180px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-color-muted);
  border: 1px dashed var(--border-color);
  border-radius: 12px;
}

.task-list {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  background: var(--card-bg);
}

.task-row {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
  gap: 12px;
  align-items: center;
  min-height: 48px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.task-row:last-child {
  border-bottom: none;
}

.task-main {
  display: flex;
  align-items: center;
  min-width: 0;
  gap: 10px;
}

.task-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.task-actions {
  display: flex;
  align-items: center;
}

.task-actions {
  gap: 10px;
  justify-content: flex-end;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--text-color-muted);
  flex-shrink: 0;
}

.status-dot.enabled {
  background: var(--success-color, #16a34a);
}

.task-name {
  color: var(--text-color);
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-schedule {
  color: var(--text-color-muted);
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-btn {
  padding: 0;
  border: none;
  background: transparent;
  color: var(--text-color-muted);
  font-size: 12px;
  cursor: pointer;
}

.text-btn:hover {
  color: var(--text-color);
}

.text-btn.primary {
  color: var(--primary-color);
}

.text-btn:disabled {
  cursor: default;
  opacity: 0.5;
}

.scheduled-task-manager-modal {
  width: min(1180px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  overflow: auto;
  margin: 24px auto;
  border-radius: 16px;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.18);
}

.spin {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

@media (max-width: 980px) {
  .task-row {
    grid-template-columns: 1fr;
  }

  .task-actions {
    flex-wrap: wrap;
    justify-content: flex-start;
  }
}
</style>
