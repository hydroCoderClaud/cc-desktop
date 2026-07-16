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

      <n-dropdown
        trigger="click"
        placement="bottom-start"
        :options="appMenuOptions"
        :render-label="renderAppMenuLabel"
        @select="handleAppSelect"
      >
        <button
          type="button"
          class="filter-trigger-btn"
          :class="{ active: selectedAppFilter !== 'all' }"
          :title="appFilterTitle"
          :aria-label="appFilterTitle"
        >
          <Icon :name="appFilterIcon" :size="16" class="filter-trigger-icon" />
        </button>
      </n-dropdown>
    </div>

    <!-- 对话列表 -->
    <div class="conversation-list">
      <template v-for="group in projectConversationGroups" :key="group.key">
        <div
          class="project-group-header"
          :class="{
            active: isProjectGroupActive(group),
            pinned: group.pinned,
            'has-open-conversation': group.hasOpenConversation,
            dragging: draggingProjectKey === group.key,
            'drop-before': dropProjectKey === group.key && dropProjectPlacement === 'before',
            'drop-after': dropProjectKey === group.key && dropProjectPlacement === 'after'
          }"
          :draggable="projectConversationGroups.length > 1"
          @click="handleProjectHeaderClick(group)"
          @contextmenu.prevent.stop="showProjectContextMenu($event, group)"
          @dragstart="handleProjectDragStart($event, group)"
          @dragover="handleProjectDragOver($event, group)"
          @dragleave="handleProjectDragLeave($event, group)"
          @drop="handleProjectDrop($event, group)"
          @dragend="handleProjectDragEnd"
        >
          <Icon :name="group.expanded ? 'chevronDown' : 'chevronRight'" :size="12" class="project-toggle-icon" />
          <Icon :name="group.expanded ? 'folderOpen' : 'folder'" :size="14" class="project-folder-icon" />
          <div class="project-title-wrap">
            <div class="project-title-row">
              <span class="project-title" :title="group.cwd || getDirectoryDisplayName(group)">
                {{ getDirectoryDisplayName(group) }}
              </span>
              <Icon v-if="group.pinned" name="starFilled" :size="11" class="project-pin-icon" />
            </div>
          </div>
          <span class="project-count">{{ group.count }}</span>
        </div>
        <template v-if="group.expanded">
          <div
            v-for="conv in group.items"
            :key="conv.id"
            class="conversation-item"
            :class="{ active: activeSessionId === conv.id, closed: conv.status === 'closed' }"
            @click="$emit('select', conv)"
            @dblclick="startRename(conv)"
            @contextmenu.prevent.stop="showConversationContextMenu($event, conv)"
          >
            <div class="conv-info">
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
              <span v-if="editingId === conv.id" class="conv-title conv-title-placeholder" />
              <span v-else class="conv-title">{{ conv.title || t('agent.chat') }}</span>
              <div class="conv-marker-group">
                <span
                  v-if="getConversationImChannel(conv)"
                  class="conv-marker im-source-marker"
                  :title="resolveExternalSourceLabel(getConversationImChannel(conv))"
                >
                  <Icon :name="getConversationImIcon(conv)" :size="11" />
                </span>
                <span
                  v-if="conv.sessionAppId"
                  class="conv-marker"
                  :title="resolveSessionAppName(conv)"
                >
                  <Icon name="sessionApp" :size="11" />
                </span>
                <span
                  v-if="hasConversationTask(conv)"
                  class="conv-marker"
                  :title="t('rightPanel.tabs.scheduledTasks')"
                >
                  <Icon name="clock" :size="11" />
                </span>
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
            </div>
          </div>
        </template>
      </template>

      <div v-if="externalImConversations.length" class="external-im-section">
        <div
          class="external-im-header"
          :class="{ active: isExternalImGroupActive }"
          @click="toggleExternalImExpanded"
        >
          <Icon :name="externalImExpanded ? 'chevronDown' : 'chevronRight'" :size="12" class="project-toggle-icon" />
          <span class="external-im-title">{{ t('agent.externalConversations') }}</span>
          <span class="project-count">{{ externalImConversations.length }}</span>
        </div>
        <template v-if="externalImExpanded">
          <div
            v-for="conv in externalImConversations"
            :key="conv.id"
            class="conversation-item external-im-conversation-item"
            :class="{ active: activeSessionId === conv.id, closed: conv.status === 'closed' }"
            @click="$emit('select', conv)"
            @dblclick="startRename(conv)"
            @contextmenu.prevent.stop="showConversationContextMenu($event, conv)"
          >
            <div class="conv-info">
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
              <span v-if="editingId === conv.id" class="conv-title conv-title-placeholder" />
              <span v-else class="conv-title">{{ conv.title || t('agent.chat') }}</span>
              <div class="conv-marker-group">
                <span
                  v-if="getConversationImChannel(conv)"
                  class="conv-marker im-source-marker"
                  :title="resolveExternalSourceLabel(getConversationImChannel(conv))"
                >
                  <Icon :name="getConversationImIcon(conv)" :size="11" />
                </span>
                <span
                  v-if="conv.sessionAppId"
                  class="conv-marker"
                  :title="resolveSessionAppName(conv)"
                >
                  <Icon name="sessionApp" :size="11" />
                </span>
                <span
                  v-if="hasConversationTask(conv)"
                  class="conv-marker"
                  :title="t('rightPanel.tabs.scheduledTasks')"
                >
                  <Icon name="clock" :size="11" />
                </span>
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
            </div>
          </div>
        </template>
      </div>

      <!-- 空状态 -->
      <div v-if="projectConversationGroups.length === 0 && externalImConversations.length === 0 && !loading" class="empty-hint">
        <Icon name="robot" :size="32" style="margin-bottom: 8px; opacity: 0.5;" />
        <div>{{ t('agent.noConversations') }}</div>
      </div>
    </div>

    <ContextMenu
      ref="projectContextMenuRef"
      :items="projectContextMenuItems"
      @select="handleProjectContextSelect"
    />
    <ContextMenu
      ref="conversationContextMenuRef"
      :items="conversationContextMenuItems"
      @select="handleConversationContextSelect"
    />

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
import { ref, computed, h, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useAgentPanel } from '@composables/useAgentPanel'
import { SettingsSection, useSettingsNavigation } from '@composables/useSettingsNavigation'
import Icon from '@components/icons/Icon.vue'
import ContextMenu from '@components/ContextMenu.vue'
import ScheduledTaskDetailPanel from './ScheduledTaskDetailPanel.vue'
import {
  getSessionImChannel,
  getExternalImMeta
} from '@shared/external-im-meta'

const { t } = useLocale()
const dialog = useDialog()
const { openSettings } = useSettingsNavigation()
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
  selectedAppFilter,
  availableDirectories,
  appFilterOptions,
  selectCwd,
  projectConversationGroups,
  externalImConversations,
  externalImExpanded,
  toggleProjectPinned,
  moveProject,
  toggleProjectExpanded,
  expandProject,
  toggleExternalImExpanded,
  expandExternalImGroup,
  collapseOtherProjects,
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

const PERSONAL_WEIXIN_ENABLED = false
const sourceMenuTypes = ['feishu', 'dingtalk', 'enterprise-weixin']

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

const appIconMap = {
  all: 'sessionApp',
  'session-app': 'sessionApp',
  'plain-session': 'chat'
}

const resolveExternalSourceLabel = (type) => {
  const labelKey = externalSourceLabelKeys[type]
  if (labelKey) {
    const translated = t(labelKey)
    if (translated && translated !== labelKey) return translated
  }
  return getExternalImMeta(type)?.label?.['zh-CN'] || type
}

const getConversationImChannel = (conv) => getSessionImChannel(conv)

const getConversationImIcon = (conv) => {
  const imChannel = getConversationImChannel(conv)
  return sourceIconMap[imChannel] || getExternalImMeta(imChannel)?.icon || 'chat'
}

const hasConversationTask = (conv) => Boolean(conv?.taskId)

const getCwdDisplayName = (cwd) => {
  if (!cwd) return t('agent.allDirectories')
  return cwd.replace(/\\/g, '/').split('/').filter(Boolean).pop() || cwd
}

const getDirectoryDisplayName = (directory) => {
  if (!directory) return t('agent.allDirectories')
  if (directory.projectName === t('agent.chat') || directory.projectName === 'Chat') {
    return getCwdDisplayName(directory.cwd)
  }
  return directory.projectName || getCwdDisplayName(directory.cwd)
}

const getSelectedDirectory = () => {
  if (!selectedCwd.value) return null
  return availableDirectories.value.find(directory => directory.key === selectedCwd.value) || null
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
  const dirs = availableDirectories.value.map(directory => ({
    label: getDirectoryDisplayName(directory),
    title: directory.cwd || directory.projectName || directory.key,
    key: directory.key,
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

const resolveAppFilterLabel = (option) => {
  if (!option) return ''
  if (option.key === 'all') return t('agent.appFilterAll')
  if (option.key === 'session-app') return t('agent.appFilterSessionApps')
  if (option.key === 'plain-session') return t('agent.appFilterPlainSessions')
  return option.label || option.key
}

const resolveSessionAppName = (conv) => {
  if (!conv?.sessionAppId) return t('agent.sessionAppBadge')
  const option = appFilterOptions.value.find(item => item.key === conv.sessionAppId)
  return option?.label || t('agent.sessionAppBadge')
}

const appMenuOptions = computed(() => appFilterOptions.value.map(option => ({
  label: resolveAppFilterLabel(option),
  title: resolveAppFilterLabel(option),
  key: option.key,
  iconName: appIconMap[option.key] || 'sessionApp'
})))

const renderCwdMenuLabel = (option) => createFilterOptionLabel(option, selectedCwd.value || 'all')

const renderSourceMenuLabel = (option) => createFilterOptionLabel(option, selectedSource.value)

const renderTaskMenuLabel = (option) => createFilterOptionLabel(option, selectedTaskFilter.value)

const renderAppMenuLabel = (option) => createFilterOptionLabel(option, selectedAppFilter.value)

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

const handleAppSelect = (key) => {
  selectedAppFilter.value = key
}

const cwdFilterIcon = computed(() => (selectedCwd.value ? 'folderOpen' : 'folder'))

const sourceFilterIcon = computed(() => {
  if (selectedSource.value === 'all') return sourceIconMap.all
  if (selectedSource.value === 'no-im') return sourceIconMap['no-im']
  return sourceIconMap[selectedSource.value] || getExternalImMeta(selectedSource.value)?.icon || 'chat'
})

const taskFilterIcon = computed(() => taskIconMap[selectedTaskFilter.value] || taskIconMap.all)

const appFilterIcon = computed(() => appIconMap[selectedAppFilter.value] || 'sessionApp')

const cwdFilterTitle = computed(() => {
  const selectedDirectory = getSelectedDirectory()
  return `${t('agent.filterDirectory')}: ${selectedDirectory ? getDirectoryDisplayName(selectedDirectory) : t('agent.allDirectories')}`
})

const sourceFilterTitle = computed(() => `${t('agent.filterIm')}: ${selectedSource.value === 'all' ? t('agent.allSources') : selectedSource.value === 'no-im' ? t('agent.sourceNoIm') : resolveExternalSourceLabel(selectedSource.value)}`)

const taskFilterTitle = computed(() => `${t('agent.filterTask')}: ${selectedTaskFilter.value === 'all' ? t('agent.taskFilterAll') : selectedTaskFilter.value === 'with-task' ? t('agent.taskFilterWithTask') : t('agent.taskFilterWithoutTask')}`)

const appFilterTitle = computed(() => {
  const option = appFilterOptions.value.find(item => item.key === selectedAppFilter.value) || appFilterOptions.value[0]
  return `${t('agent.filterApp')}: ${resolveAppFilterLabel(option)}`
})

// 重命名状态
const editingId = ref(null)
const editTitle = ref('')
const renameInputRef = ref(null)
const showScheduledTaskManager = ref(false)
const scheduledTaskId = ref(null)
const projectContextMenuRef = ref(null)
const conversationContextMenuRef = ref(null)
const contextProject = ref(null)
const contextConversation = ref(null)
const pendingActiveProjectExpansionId = ref(null)
const draggingProjectKey = ref(null)
const dropProjectKey = ref(null)
const dropProjectPlacement = ref(null)
const suppressProjectToggle = ref(false)

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

const handleNewConversationInProject = async (group) => {
  const session = await createConversation({
    type: 'chat',
    cwd: group?.cwd || null
  })
  if (session) {
    emit('created', session)
    expandProject(group.key)
  }
}

const openSessionAppDetails = (conv) => {
  const appId = typeof conv?.sessionAppId === 'string' ? conv.sessionAppId.trim() : ''
  if (!appId) return

  openSettings({
    section: SettingsSection.SESSION_APPS,
    context: {
      mode: 'agent',
      cwd: conv?.projectPath || conv?.cwd || props.currentProject?.path || null,
      sessionAppId: appId
    }
  })
}

const isProjectGroupActive = (group) => {
  if (!props.activeSessionId) return false
  return group.items.some(item => item.id === props.activeSessionId)
}

const isExternalImGroupActive = computed(() => {
  if (!props.activeSessionId) return false
  return externalImConversations.value.some(item => item.id === props.activeSessionId)
})

const clearProjectDragState = () => {
  draggingProjectKey.value = null
  dropProjectKey.value = null
  dropProjectPlacement.value = null
}

const canMoveProjectTo = (targetGroup) => {
  const draggingKey = draggingProjectKey.value
  if (!draggingKey || draggingKey === targetGroup?.key) return false
  const draggingGroup = projectConversationGroups.value.find(group => group.key === draggingKey)
  return Boolean(draggingGroup && targetGroup && draggingGroup.pinned === targetGroup.pinned)
}

const handleProjectHeaderClick = (group) => {
  if (suppressProjectToggle.value) {
    suppressProjectToggle.value = false
    return
  }
  toggleProjectExpanded(group.key)
}

const handleProjectDragStart = (event, group) => {
  draggingProjectKey.value = group.key
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', group.key)
  }
}

const handleProjectDragOver = (event, group) => {
  if (!canMoveProjectTo(group)) return
  event.preventDefault()
  const bounds = event.currentTarget.getBoundingClientRect()
  dropProjectKey.value = group.key
  dropProjectPlacement.value = event.clientY >= bounds.top + bounds.height / 2 ? 'after' : 'before'
}

const handleProjectDragLeave = (event, group) => {
  if (event.currentTarget.contains(event.relatedTarget)) return
  if (dropProjectKey.value === group.key) {
    dropProjectKey.value = null
    dropProjectPlacement.value = null
  }
}

const handleProjectDrop = (event, group) => {
  if (!canMoveProjectTo(group)) return
  event.preventDefault()
  moveProject(draggingProjectKey.value, group.key, dropProjectPlacement.value || 'before')
  suppressProjectToggle.value = true
  clearProjectDragState()
}

const handleProjectDragEnd = () => {
  clearProjectDragState()
  window.setTimeout(() => {
    suppressProjectToggle.value = false
  }, 0)
}

const showProjectContextMenu = (event, group) => {
  contextProject.value = group
  contextConversation.value = null
  conversationContextMenuRef.value?.hide()
  projectContextMenuRef.value?.show(event.clientX, event.clientY)
}

const showConversationContextMenu = (event, conv) => {
  contextConversation.value = conv
  contextProject.value = null
  projectContextMenuRef.value?.hide()
  conversationContextMenuRef.value?.show(event.clientX, event.clientY)
}

const projectContextMenuItems = computed(() => {
  const group = contextProject.value
  return [
    {
      key: 'toggle-pin',
      label: group?.pinned ? t('agent.unpinProject') : t('agent.pinProject')
    },
    {
      key: 'new-conversation',
      label: t('agent.newConversationInProject'),
      disabled: !group?.cwd
    },
    {
      key: 'open-directory',
      label: t('agent.openDirectory'),
      disabled: !group?.cwd
    },
    { divider: true, key: 'project-divider' },
    {
      key: 'collapse-others',
      label: t('agent.collapseOtherProjects')
    }
  ]
})

const conversationContextMenuItems = computed(() => {
  const conv = contextConversation.value
  return [
    { key: 'open', label: t('agent.openConversation') },
    { key: 'rename', label: t('common.rename') },
    {
      key: 'close',
      label: t('common.close'),
      disabled: !conv || conv.status === 'closed'
    },
    { key: 'delete', label: t('common.delete') },
    { divider: true, key: 'conversation-divider' },
    {
      key: 'open-task',
      label: t('agent.openScheduledTask'),
      disabled: !hasConversationTask(conv)
    },
    {
      key: 'open-session-app',
      label: t('agent.openSessionApp'),
      disabled: !conv?.sessionAppId
    }
  ]
})

const handleProjectContextSelect = async (key) => {
  const group = contextProject.value
  if (!group) return

  if (key === 'toggle-pin') {
    toggleProjectPinned(group.key)
    return
  }
  if (key === 'new-conversation') {
    await handleNewConversationInProject(group)
    return
  }
  if (key === 'open-directory') {
    await window.electronAPI?.openPath?.(group.cwd)
    return
  }
  if (key === 'collapse-others') {
    collapseOtherProjects(group.key)
  }
}

const handleConversationContextSelect = (key) => {
  const conv = contextConversation.value
  if (!conv) return

  if (key === 'open') {
    emit('select', conv)
    return
  }
  if (key === 'rename') {
    startRename(conv)
    return
  }
  if (key === 'close') {
    emit('close', conv)
    return
  }
  if (key === 'delete') {
    handleDelete(conv)
    return
  }
  if (key === 'open-task') {
    openScheduledTaskManager({ taskId: conv.taskId })
    return
  }
  if (key === 'open-session-app') {
    openSessionAppDetails(conv)
  }
}

const ensurePendingActiveProjectExpanded = () => {
  const sessionId = pendingActiveProjectExpansionId.value
  if (!sessionId) return

  if (externalImConversations.value.some(conv => conv.id === sessionId)) {
    pendingActiveProjectExpansionId.value = null
    if (!externalImExpanded.value) {
      expandExternalImGroup()
    }
    return
  }

  const group = projectConversationGroups.value.find(item => item.items.some(conv => conv.id === sessionId))
  if (group) {
    pendingActiveProjectExpansionId.value = null
    if (!group.expanded) {
      expandProject(group.key)
    }
  }
}

watch(() => props.activeSessionId, (sessionId) => {
  pendingActiveProjectExpansionId.value = sessionId || null
  ensurePendingActiveProjectExpanded()
}, { immediate: true })
watch([projectConversationGroups, externalImConversations], ensurePendingActiveProjectExpanded)

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
      // 先关闭 Tab，再删除后端会话，避免 close 时 session 已不存在
      emit('close', conv)
      await deleteConversation(conv.id)
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
let cleanupSessionAppsChanged = null
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
        if (data.activeSessionEnded) {
          conv.status = 'closed'
          return
        }
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

  if (window.electronAPI?.onSessionAppsChanged) {
    cleanupSessionAppsChanged = window.electronAPI.onSessionAppsChanged(() => {
      void loadConversations()
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
  if (cleanupSessionAppsChanged) cleanupSessionAppsChanged()
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

.project-group-header {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 34px;
  padding: 7px 8px;
  margin: 4px 0 3px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--text-color);
  cursor: default;
  user-select: none;
  transition: background-color 0.16s ease, border-color 0.16s ease;
}

.project-group-header:hover {
  background: var(--panel-bg-subtle);
}

.project-group-header.active {
  background: var(--selected-bg);
}

.project-group-header[draggable='true'] {
  cursor: default;
}

.project-group-header.dragging {
  opacity: 0.55;
  cursor: default;
}

.project-group-header.drop-before {
  box-shadow: inset 0 2px 0 var(--primary-color);
}

.project-group-header.drop-after {
  box-shadow: inset 0 -2px 0 var(--primary-color);
}

.project-toggle-icon,
.project-folder-icon {
  flex-shrink: 0;
  color: var(--text-color-secondary);
}

.project-folder-icon,
.project-pin-icon {
  color: var(--primary-color);
}

.project-title-wrap {
  min-width: 0;
  flex: 1;
}

.project-title-row {
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
}

.project-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 400;
}

.project-group-header.has-open-conversation .project-title {
  font-weight: 650;
}

.project-count {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--hover-bg);
  color: var(--text-color-secondary);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
  flex-shrink: 0;
}

.external-im-section {
  margin-top: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-color);
}

.external-im-header {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 7px 8px;
  margin-bottom: 3px;
  border-radius: 8px;
  color: var(--text-color-secondary);
  cursor: pointer;
  user-select: none;
  transition: background-color 0.16s ease;
}

.external-im-header:hover,
.external-im-header.active {
  background: var(--selected-bg);
}

.external-im-title {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
}

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px 8px 46px;
  margin-bottom: 2px;
  border: 1px solid transparent;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.conversation-item:hover {
  background: var(--panel-bg-subtle);
}

.conversation-item.active {
  background: var(--selected-bg);
}

.conversation-item.closed {
  opacity: 0.55;
}

.external-im-conversation-item {
  padding-left: 28px;
}

.conv-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.conv-marker-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.conv-marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  color: var(--text-color-secondary);
  opacity: 0.78;
}

.im-source-marker {
  color: var(--primary-color);
  opacity: 0.9;
}

.conv-title {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-title-placeholder {
  visibility: hidden;
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
  cursor: default;
  transition: color 0.2s, opacity 0.2s;
  opacity: 0.72;
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
