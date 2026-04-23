<template>
  <div class="agent-left-content">
    <!-- 新建对话按钮 -->
    <div class="new-session-area">
      <button class="new-session-btn" @click="handleNewConversation">
        <span class="icon">+</span>
        <span>{{ t('agent.newConversation') }}</span>
      </button>
    </div>

    <div class="filter-area">
      <n-select
        v-model:value="selectedSource"
        :options="sourceOptions"
        :placeholder="t('agent.allSources')"
        size="small"
      />
    </div>

    <!-- 目录筛选 -->
    <div class="dir-filter-area" v-if="availableCwds.length > 0">
      <n-select
        v-model:value="selectedCwd"
        :options="cwdOptions"
        :render-label="renderCwdLabel"
        :placeholder="t('agent.allDirectories')"
        size="small"
      />
    </div>

    <!-- 对话列表 -->
    <div class="conversation-list">
      <template v-for="group in conversationGroups" :key="group.key">
        <div class="group-header">
          <span>{{ group.label }}</span>
        </div>
        <div
          v-for="conv in group.items"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: activeSessionId === conv.id, closed: conv.status === 'closed' }"
          @click="$emit('select', conv)"
          @dblclick="startRename(conv)"
        >
          <div class="conv-info">
            <button
              v-if="getConversationSource(conv) === 'scheduled' && conv.taskId"
              class="conv-icon-btn"
              :title="t('rightPanel.tabs.scheduledTasks')"
              @click.stop="openScheduledTaskManager({ taskId: conv.taskId })"
            >
              <Icon :name="getConversationIcon(conv)" :size="12" class="conv-icon interactive" />
            </button>
            <Icon v-else :name="getConversationIcon(conv)" :size="12" class="conv-icon" />
            <input
              v-if="editingId === conv.id"
              class="rename-input"
              :value="editTitle"
              @input="editTitle = $event.target.value"
              @keydown.enter="saveRename"
              @keydown.escape="cancelRename"
              @blur="saveRename"
              @click.stop
              ref="renameInputRef"
            />
            <span v-else class="conv-title">{{ conv.title || t('agent.chat') }}</span>
            <template v-for="profileName in [getProfileName(conv.apiProfileId)]" :key="'p'">
              <span v-if="profileName" class="profile-badge" @click.stop>
                <Icon name="api" :size="10" />
                <span class="profile-tip">{{ profileName }}</span>
              </span>
            </template>
          </div>
          <div class="conv-actions">
            <button class="action-btn rename-btn" :title="t('common.rename')" @click.stop="startRename(conv)">
              <Icon name="edit" :size="12" />
            </button>
            <button v-if="conv.status !== 'closed'" class="action-btn close-btn" :title="t('common.close')" @click.stop="$emit('close', conv)">
              <Icon name="close" :size="12" />
            </button>
            <button class="action-btn delete-btn" :title="t('common.delete')" @click.stop="handleDelete(conv)">
              <Icon name="delete" :size="12" />
            </button>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-if="conversationGroups.length === 0 && !loading" class="empty-hint">
        <Icon name="robot" :size="32" style="margin-bottom: 8px; opacity: 0.5;" />
        <div>{{ t('agent.noConversations') }}</div>
      </div>
    </div>

    <n-modal v-model:show="showScheduledTaskManager" @after-leave="scheduledTaskId = null">
      <div class="scheduled-task-manager-modal">
        <ScheduledTaskDetailPanel
          v-if="showScheduledTaskManager && scheduledTaskId"
          :task-id="scheduledTaskId"
          :current-project="currentProject"
          @close="showScheduledTaskManager = false"
          @updated="loadConversations"
          @deleted="handleScheduledTaskDeleted"
        />
      </div>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, h, nextTick, onMounted, onUnmounted } from 'vue'
import { useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAgentPanel } from '@composables/useAgentPanel'
import Icon from '@components/icons/Icon.vue'
import ScheduledTaskDetailPanel from './ScheduledTaskDetailPanel.vue'

const { t } = useLocale()
const dialog = useDialog()
const props = defineProps({
  activeSessionId: {
    type: String,
    default: null
  },
  currentProject: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['select', 'close', 'created', 'new-conversation-request'])

const {
  conversations,
  loading,
  selectedCwd,
  selectedSource,
  availableCwds,
  groupedConversations,
  loadConversations,
  createConversation,
  closeConversation,
  deleteConversation,
  bumpConversation,
  renameConversation
} = useAgentPanel()

// 下拉选项：第一项"全部"，后跟各目录 basename
const cwdOptions = computed(() => {
  const dirs = availableCwds.value.map(cwd => {
    const basename = cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || cwd
    return { label: basename, value: cwd }
  })
  return [{ label: t('agent.allDirectories'), value: null }, ...dirs]
})

const sourceOptions = computed(() => ([
  { label: t('agent.allSources'), value: 'all' },
  { label: t('agent.sourceManual'), value: 'manual' },
  { label: t('agent.sourceScheduled'), value: 'scheduled' },
  { label: t('agent.sourceDingtalk'), value: 'dingtalk' }
]))

// 渲染选项 label，非"全部"选项加 title 显示完整路径
const renderCwdLabel = (option) => {
  if (!option.value) return h('span', option.label)
  return h('span', { title: option.value }, option.label)
}

// 按时间分组的对话列表（消除模板重复）
const conversationGroups = computed(() => {
  const groups = []
  const g = groupedConversations.value
  if (g.today.length > 0) {
    groups.push({ key: 'today', label: t('common.today'), items: g.today })
  }
  if (g.yesterday.length > 0) {
    groups.push({ key: 'yesterday', label: t('common.yesterday'), items: g.yesterday })
  }
  if (g.older.length > 0) {
    groups.push({ key: 'older', label: t('common.older'), items: g.older })
  }
  return groups
})

// 重命名状态
const editingId = ref(null)
const editTitle = ref('')
const renameInputRef = ref(null)
const showScheduledTaskManager = ref(false)
const scheduledTaskId = ref(null)

// API profiles（用于显示 profile 标记）
const apiProfiles = ref([])

const loadApiProfiles = async () => {
  try {
    const config = await window.electronAPI?.getConfig()
    apiProfiles.value = config?.apiProfiles || []
  } catch {}
}

// 返回 profile 名称，仅当 profileId 存在时显示
const getProfileName = (profileId) => {
  if (!profileId) return null
  const profile = apiProfiles.value.find(p => p.id === profileId)
  return profile?.name || null
}

const getConversationSource = (conv) => (conv.type === 'dingtalk' ? 'dingtalk' : (conv.source || 'manual'))

const getConversationIcon = (conv) => {
  const source = getConversationSource(conv)
  if (source === 'scheduled') return 'clock'
  if (conv.type === 'dingtalk') return 'dingtalk'
  return 'chat'
}

const openScheduledTaskManager = ({ taskId = null } = {}) => {
  if (!taskId) return
  scheduledTaskId.value = taskId
  showScheduledTaskManager.value = true
}

const handleScheduledTaskDeleted = async () => {
  showScheduledTaskManager.value = false
  scheduledTaskId.value = null
  await loadConversations()
}

const handleNewConversation = () => {
  emit('new-conversation-request')
}

const startRename = (conv) => {
  editingId.value = conv.id
  editTitle.value = conv.title || ''
  nextTick(() => {
    // ref 可能是数组（v-for 中的 ref）
    const input = Array.isArray(renameInputRef.value) ? renameInputRef.value[0] : renameInputRef.value
    if (input) input.focus()
  })
}

const saveRename = async () => {
  if (editingId.value && editTitle.value.trim()) {
    await renameConversation(editingId.value, editTitle.value.trim())
  }
  editingId.value = null
  editTitle.value = ''
}

const cancelRename = () => {
  editingId.value = null
  editTitle.value = ''
}

const handleDelete = (conv) => {
  dialog.warning({
    title: t('agent.deleteConfirmTitle'),
    content: t('agent.deleteConfirmContent'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      await deleteConversation(conv.id)
      // 通知父组件关闭对应的 Tab（如果已打开）
      emit('close', conv)
    }
  })
}

// 监听重命名事件（从后端推送）
let cleanupRenamed = null
let cleanupAgentResult = null
let cleanupDingtalkSession = null
let cleanupDingtalkSessionClosed = null
let cleanupAgentStatus = null
let cleanupScheduledTask = null
// 窗口获得焦点时刷新 API profiles（profile 在独立窗口编辑，切回时需同步）
const onWindowFocus = () => {
  loadApiProfiles()
}

onMounted(() => {
  loadConversations()
  loadApiProfiles()

  window.addEventListener('focus', onWindowFocus)

  if (window.electronAPI?.onAgentRenamed) {
    cleanupRenamed = window.electronAPI.onAgentRenamed((data) => {
      const conv = conversations.value.find(c => c.id === data.sessionId)
      if (conv) {
        conv.title = data.title
      }
    })
  }

  // 每轮对话完成时将该会话上浮到列表最前
  if (window.electronAPI?.onAgentResult) {
    cleanupAgentResult = window.electronAPI.onAgentResult((data) => {
      bumpConversation(data.sessionId)
    })
  }

  if (window.electronAPI?.onAgentStatusChange) {
    cleanupAgentStatus = window.electronAPI.onAgentStatusChange((data) => {
      const conv = conversations.value.find(item => item.id === data.sessionId)
      if (conv) {
        conv.status = data.status
        return
      }
      loadConversations()
    })
  }

  // 钉钉会话创建/关闭时自动刷新列表
  if (window.electronAPI?.onDingTalkSessionCreated) {
    cleanupDingtalkSession = window.electronAPI.onDingTalkSessionCreated(() => {
      loadConversations()
    })
  }
  if (window.electronAPI?.onDingTalkSessionClosed) {
    cleanupDingtalkSessionClosed = window.electronAPI.onDingTalkSessionClosed(() => {
      loadConversations()
    })
  }

  if (window.electronAPI?.onScheduledTaskChanged) {
    cleanupScheduledTask = window.electronAPI.onScheduledTaskChanged(() => {
      loadConversations()
    })
  }
})

onUnmounted(() => {
  window.removeEventListener('focus', onWindowFocus)
  if (cleanupRenamed) cleanupRenamed()
  if (cleanupAgentResult) cleanupAgentResult()
  if (cleanupAgentStatus) cleanupAgentStatus()
  if (cleanupDingtalkSession) cleanupDingtalkSession()
  if (cleanupDingtalkSessionClosed) cleanupDingtalkSessionClosed()
  if (cleanupScheduledTask) cleanupScheduledTask()
})

defineExpose({
  loadConversations,
  createConversation,
  closeConversation,
  deleteConversation
})
</script>

<style scoped>
.agent-left-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.new-session-area {
  padding: 12px;
  flex-shrink: 0;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-session-btn:hover {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.new-session-btn .icon {
  font-size: 16px;
  font-weight: bold;
}

.filter-area {
  padding: 0 12px 8px;
  flex-shrink: 0;
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

.dir-filter-area {
  padding: 0 12px 8px;
  flex-shrink: 0;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.group-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  padding: 12px 4px 6px;
}

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.conversation-item:hover {
  background: var(--hover-bg);
}

.conversation-item.active {
  background: var(--warning-bg);
  border: 1px solid var(--primary-color);
}

.conversation-item.closed {
  opacity: 0.55;
}

.conversation-item.closed .conv-icon {
  color: var(--text-color-muted);
}

.conv-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.conv-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.conv-icon.interactive {
  transition: color 0.2s, transform 0.2s;
}

.conv-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}

.conv-icon-btn:hover .conv-icon.interactive {
  color: var(--primary-color-hover);
  transform: scale(1.08);
}

.conv-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-badge {
  padding: 0 6px;
  border-radius: 999px;
  background: rgba(56, 189, 248, 0.14);
  color: #0284c7;
  font-size: 11px;
  line-height: 18px;
}

.rename-input {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--primary-color);
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 13px;
  background: var(--bg-color);
  color: var(--text-color);
  outline: none;
}

.conv-actions {
  display: flex;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.conversation-item:hover .conv-actions {
  opacity: 1;
}

.action-btn {
  width: 20px;
  height: 20px;
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: var(--primary-ghost-hover);
  color: var(--primary-color);
}

.action-btn.delete-btn:hover {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

.profile-badge {
  flex-shrink: 0;
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 3px;
  color: var(--text-color-muted);
  opacity: 0.5;
  cursor: default;
  transition: opacity 0.15s, color 0.15s;
}

.conversation-item:hover .profile-badge {
  opacity: 0.9;
  color: var(--primary-color);
}

.profile-tip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(100% + 6px);
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 100;
  /* 深色主题：白底深字 */
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid rgba(0,0,0,0.12);
  box-shadow: 0 2px 10px rgba(0,0,0,0.25);
}

[data-theme="light"] .profile-tip {
  /* 浅色主题：深底浅字 */
  background: #2d2d2d;
  color: #f5f5f0;
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow: 0 2px 10px rgba(0,0,0,0.15);
}

.profile-badge:hover .profile-tip {
  opacity: 1;
}

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
