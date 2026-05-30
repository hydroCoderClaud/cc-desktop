<template>
  <div class="agent-left-content">
    <!-- 新建对话按钮 -->
    <div class="new-session-area">
      <button class="new-session-btn" @click="handleNewConversation">
        <span class="icon">+</span>
        <span>{{ t('agent.newConversation') }}</span>
      </button>
    </div>

    <div class="filter-toolbar">
      <!-- 目录筛选 -->
      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="cwdMenuOptions"
        :render-label="renderCwdMenuLabel"
        @select="handleCwdSelect"
      >
        <button
          type="button"
          class="filter-trigger-btn"
          :class="{ active: !!selectedCwd }"
          :title="cwdFilterTitle"
          :aria-label="cwdFilterTitle"
        >
          <Icon :name="cwdFilterIcon" :size="16" class="filter-trigger-icon" />
        </button>
      </n-dropdown>

      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="sourceMenuOptions"
        :render-label="renderSourceMenuLabel"
        @select="handleSourceSelect"
      >
        <button
          type="button"
          class="filter-trigger-btn"
          :class="{ active: selectedSource !== 'all' }"
          :title="sourceFilterTitle"
          :aria-label="sourceFilterTitle"
        >
          <Icon :name="sourceFilterIcon" :size="16" class="filter-trigger-icon" />
        </button>
      </n-dropdown>

      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="taskMenuOptions"
        :render-label="renderTaskMenuLabel"
        @select="handleTaskSelect"
      >
        <button
          type="button"
          class="filter-trigger-btn"
          :class="{ active: selectedTaskFilter !== 'all' }"
          :title="taskFilterTitle"
          :aria-label="taskFilterTitle"
        >
          <Icon :name="taskFilterIcon" :size="16" class="filter-trigger-icon" />
        </button>
      </n-dropdown>
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
            <div class="conv-icon-group">
              <Icon :name="getConversationBaseIcon(conv)" :size="12" class="conv-icon" />
              <button
                v-if="hasConversationTask(conv)"
                class="conv-icon-btn"
                :title="t('rightPanel.tabs.scheduledTasks')"
                @click.stop="openScheduledTaskManager({ taskId: conv.taskId })"
              >
                <Icon name="clock" :size="12" class="conv-icon interactive task-icon" />
              </button>
            </div>
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
              <span
                v-if="profileName"
                class="profile-badge"
                :title="profileName"
              >
                <Icon name="api" :size="10" />
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
import {
  getSessionImChannel,
  getExternalImMeta
} from '@shared/external-im-meta'

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
  selectedTaskFilter,
  availableCwds,
  selectCwd,
  groupedConversations,
  loadConversations,
  createConversation,
  closeConversation,
  deleteConversation,
  bumpConversation,
  renameConversation
} = useAgentPanel()

const externalSourceLabelKeys = {
  dingtalk: 'agent.sourceDingtalk',
  weixin: 'agent.sourceWeixin',
  feishu: 'agent.sourceFeishu',
  'enterprise-weixin': 'agent.sourceEnterpriseWeixin'
}

const sourceMenuTypes = ['feishu', 'dingtalk', 'weixin', 'enterprise-weixin']

const sourceIconMap = {
  all: 'chat',
  'no-im': 'xCircle',
  dingtalk: 'dingtalk',
  weixin: 'weixin',
  feishu: 'feishu',
  'enterprise-weixin': 'wecom'
}

const taskIconMap = {
  all: 'clock',
  'with-task': 'history',
  'without-task': 'xCircle'
}

const resolveExternalSourceLabel = (type) => {
  const labelKey = externalSourceLabelKeys[type]
  if (labelKey) {
    const translated = t(labelKey)
    if (translated && translated !== labelKey) return translated
  }
  return getExternalImMeta(type)?.label?.['zh-CN'] || type
}

const getConversationBaseIcon = (conv) => {
  const imChannel = getSessionImChannel(conv)
  if (imChannel) {
    return getExternalImMeta(imChannel)?.icon || imChannel
  }
  return 'chat'
}

const hasConversationTask = (conv) => Boolean(conv?.taskId)

const getCwdDisplayName = (cwd) => {
  if (!cwd) return t('agent.allDirectories')
  return cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || cwd
}

const createFilterOptionLabel = (option, selectedValue) => {
  const isSelected = option.key === selectedValue
  return h('div', {
    class: 'filter-option-label',
    style: {
      display: 'flex',
      alignItems: 'center',
      width: '100%',
      minWidth: 0,
      fontSize: '13px',
      lineHeight: '1.4',
      paddingTop: option.extraTopGap ? '6px' : 0
    }
  }, [
    h(Icon, {
      name: option.iconName,
      size: 14,
      class: 'filter-option-icon',
      style: { flexShrink: 0, marginRight: '8px', color: 'var(--text-color-secondary)' }
    }),
    h('span', {
      class: 'filter-option-text',
      title: option.title || option.label,
      style: { minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
    }, option.label),
    isSelected
      ? h(Icon, {
        name: 'check',
        size: 12,
        class: 'filter-option-check',
        style: { flexShrink: 0, marginLeft: '6px', color: 'var(--primary-color)' }
      })
      : null
  ])
}

const cwdMenuOptions = computed(() => {
  const dirs = availableCwds.value.map(cwd => ({
    label: getCwdDisplayName(cwd),
    title: cwd,
    key: cwd,
    iconName: 'folder'
  }))
  return [{
    label: t('agent.allDirectories'),
    title: t('agent.allDirectories'),
    key: 'all',
    iconName: 'folderOpen'
  }, ...dirs, {
    type: 'divider',
    key: 'cwd-divider'
  }, {
    label: t('agent.openDirectory'),
    title: t('agent.openDirectory'),
    key: 'open-directory',
    iconName: 'folderOpen',
    extraTopGap: true
  }]
})

const sourceMenuOptions = computed(() => ([
  { label: t('agent.allSources'), title: t('agent.allSources'), key: 'all', iconName: sourceIconMap.all },
  ...sourceMenuTypes.map(type => ({
    label: resolveExternalSourceLabel(type),
    title: resolveExternalSourceLabel(type),
    key: type,
    iconName: sourceIconMap[type] || getExternalImMeta(type)?.icon || 'chat'
  })),
  { label: t('agent.sourceNoIm'), title: t('agent.sourceNoIm'), key: 'no-im', iconName: sourceIconMap['no-im'] }
]))

const taskMenuOptions = computed(() => ([
  { label: t('agent.taskFilterAll'), title: t('agent.taskFilterAll'), key: 'all', iconName: taskIconMap.all },
  { label: t('agent.taskFilterWithTask'), title: t('agent.taskFilterWithTask'), key: 'with-task', iconName: taskIconMap['with-task'] },
  { label: t('agent.taskFilterWithoutTask'), title: t('agent.taskFilterWithoutTask'), key: 'without-task', iconName: taskIconMap['without-task'] }
]))

const renderCwdMenuLabel = (option) => createFilterOptionLabel(option, selectedCwd.value || 'all')

const renderSourceMenuLabel = (option) => createFilterOptionLabel(option, selectedSource.value)

const renderTaskMenuLabel = (option) => createFilterOptionLabel(option, selectedTaskFilter.value)

const handleCwdSelect = async (key) => {
  if (key === 'open-directory') {
    const folder = await window.electronAPI?.selectFolder?.()
    if (folder) selectCwd(folder)
    return
  }

  if (key === 'all') {
    selectedCwd.value = null
    return
  }

  selectCwd(key)
}

const handleSourceSelect = (key) => {
  selectedSource.value = key
}

const handleTaskSelect = (key) => {
  selectedTaskFilter.value = key
}

const cwdFilterIcon = computed(() => (selectedCwd.value ? 'folderOpen' : 'folder'))

const sourceFilterIcon = computed(() => {
  if (selectedSource.value === 'all') return sourceIconMap.all
  if (selectedSource.value === 'no-im') return sourceIconMap['no-im']
  return sourceIconMap[selectedSource.value] || getExternalImMeta(selectedSource.value)?.icon || 'chat'
})

const taskFilterIcon = computed(() => taskIconMap[selectedTaskFilter.value] || taskIconMap.all)

const cwdFilterTitle = computed(() => `${t('agent.filterDirectory')}: ${selectedCwd.value ? getCwdDisplayName(selectedCwd.value) : t('agent.allDirectories')}`)

const sourceFilterTitle = computed(() => `${t('agent.filterIm')}: ${selectedSource.value === 'all' ? t('agent.allSources') : selectedSource.value === 'no-im' ? t('agent.sourceNoIm') : resolveExternalSourceLabel(selectedSource.value)}`)

const taskFilterTitle = computed(() => `${t('agent.filterTask')}: ${selectedTaskFilter.value === 'all' ? t('agent.taskFilterAll') : selectedTaskFilter.value === 'with-task' ? t('agent.taskFilterWithTask') : t('agent.taskFilterWithoutTask')}`)

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

const updateConversationRuntime = ({ sessionId, apiProfileId, modelId } = {}) => {
  if (!sessionId) return
  const index = conversations.value.findIndex(item => item.id === sessionId)
  if (index === -1) return
  const current = conversations.value[index]
  conversations.value.splice(index, 1, {
    ...current,
    apiProfileId: apiProfileId || null,
    modelId: modelId || null
  })
}

const focusConversationById = async (sessionId) => {
  if (!sessionId) {
    await loadConversations()
    return
  }

  let conv = conversations.value.find(item => item.id === sessionId)
  if (!conv) {
    await loadConversations()
    conv = conversations.value.find(item => item.id === sessionId)
  }

  if (!conv) return
  emit('select', conv)
}

// 监听重命名事件（从后端推送）
let cleanupRenamed = null
let cleanupAgentResult = null
let cleanupDingtalkSession = null
let cleanupDingtalkSessionClosed = null
let cleanupWeixinSession = null
let cleanupFeishuSession = null
let cleanupEnterpriseWeixinSession = null
let cleanupFeishuSessionClosed = null
let cleanupAgentStatus = null
let cleanupScheduledTask = null
let cleanupSessionUpdated = null
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
        conv.status = data.cliExited
          ? (data.cliExitWasError ? 'error' : 'closed')
          : data.status
        return
      }
      loadConversations()
    })
  }

  if (window.electronAPI?.onSessionUpdated) {
    cleanupSessionUpdated = window.electronAPI.onSessionUpdated((data) => {
      const conv = conversations.value.find(item => item.id === data?.sessionId)
      if (conv && data?.session) {
        Object.assign(conv, data.session)
        return
      }
      loadConversations()
    })
  }

  // 钉钉会话创建/关闭时自动刷新列表
  if (window.electronAPI?.onDingTalkSessionCreated) {
    cleanupDingtalkSession = window.electronAPI.onDingTalkSessionCreated((data) => {
      focusConversationById(data?.sessionId)
    })
  }
  if (window.electronAPI?.onWeixinSessionCreated) {
    cleanupWeixinSession = window.electronAPI.onWeixinSessionCreated((data) => {
      focusConversationById(data?.sessionId)
    })
  }
  if (window.electronAPI?.onFeishuSessionCreated) {
    cleanupFeishuSession = window.electronAPI.onFeishuSessionCreated((data) => {
      focusConversationById(data?.sessionId)
    })
  }
  if (window.electronAPI?.onEnterpriseWeixinSessionCreated) {
    cleanupEnterpriseWeixinSession = window.electronAPI.onEnterpriseWeixinSessionCreated((data) => {
      focusConversationById(data?.sessionId)
    })
  }
  if (window.electronAPI?.onDingTalkSessionClosed) {
    cleanupDingtalkSessionClosed = window.electronAPI.onDingTalkSessionClosed(() => {
      loadConversations()
    })
  }
  if (window.electronAPI?.onFeishuSessionClosed) {
    cleanupFeishuSessionClosed = window.electronAPI.onFeishuSessionClosed(() => {
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
  if (cleanupWeixinSession) cleanupWeixinSession()
  if (cleanupFeishuSession) cleanupFeishuSession()
  if (cleanupEnterpriseWeixinSession) cleanupEnterpriseWeixinSession()
  if (cleanupFeishuSessionClosed) cleanupFeishuSessionClosed()
  if (cleanupScheduledTask) cleanupScheduledTask()
  if (cleanupSessionUpdated) cleanupSessionUpdated()
})

defineExpose({
  loadConversations,
  createConversation,
  closeConversation,
  deleteConversation,
  updateConversationRuntime
})
</script>

<style scoped>
.agent-left-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
  background: var(--panel-bg);
}

.new-session-area {
  padding: 8px 16px 12px;
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
  border-radius: 10px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-session-btn:hover {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
  box-shadow: var(--primary-shadow);
}

.new-session-btn .icon {
  font-size: 16px;
  font-weight: bold;
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

.filter-toolbar {
  padding: 0 16px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.filter-trigger-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--border-color-light);
  border-radius: 8px;
  background: var(--panel-bg);
  color: var(--text-color-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color 0.2s, border-color 0.2s, color 0.2s, transform 0.2s;
  flex-shrink: 0;
}

.filter-trigger-btn:hover:not(:disabled) {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--hover-bg);
  transform: translateY(-1px);
}

.filter-trigger-btn.active {
  border-color: var(--primary-color);
  color: var(--primary-color);
  background: var(--primary-ghost);
}

.filter-trigger-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none;
}

.filter-trigger-icon {
  transition: transform 0.2s;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 16px 16px;
}

.group-header {
  display: flex;
  align-items: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 12px 2px 8px;
}

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 6px;
  border: 1px solid transparent;
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s;
}

.conversation-item:hover {
  background: var(--panel-bg-subtle);
}

.conversation-item.active {
  background: var(--selected-bg);
  border-color: var(--selected-border);
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

.conv-icon-group {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 28px;
  flex-shrink: 0;
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
  width: 16px;
  height: 16px;
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

.task-icon {
  color: var(--text-color-secondary);
}

.conv-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.profile-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  min-width: 0;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  color: var(--text-color-secondary);
  cursor: pointer;
  transition: color 0.2s, opacity 0.2s;
  opacity: 0.72;
}

.profile-badge:hover {
  color: var(--primary-color);
  background: transparent;
  opacity: 1;
}

.source-badge {
  padding: 0 6px;
  border-radius: 999px;
  background: var(--primary-ghost);
  color: var(--primary-color);
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
  background: rgba(220, 38, 38, 0.1);
  color: var(--danger-color);
}

.profile-badge {
  flex-shrink: 0;
  margin-left: 3px;
}

.conversation-item:hover .profile-badge {
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
