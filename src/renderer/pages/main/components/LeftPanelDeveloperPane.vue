<template>
  <template v-if="isDeveloperMode">
    <div class="project-section">
      <div class="section-header">
        <span>{{ t('main.projects') }}</span>
        <button class="open-project-btn" @click="$emit('open-project')" :title="t('project.openExisting')">
          <Icon name="folderOpen" :size="14" />
        </button>
      </div>

      <div class="project-selector-row">
        <n-select
          :value="selectedProjectId"
          :options="projectOptions"
          :render-label="renderProjectLabel"
          :placeholder="t('main.selectProject')"
          clearable
          filterable
          class="project-dropdown"
          @update:value="$emit('update:selectedProjectId', $event)"
        />
        <n-dropdown
          v-if="selectedProjectId"
          trigger="click"
          :options="projectMenuOptions"
          @select="handleProjectMenuSelect"
          placement="bottom-end"
        >
          <button class="project-settings-btn" :title="t('main.projectSettings')">
            <Icon name="settings" :size="14" />
          </button>
        </n-dropdown>
      </div>
    </div>

    <div v-if="currentProject && currentProject.pathValid" class="new-session-area">
      <button class="new-session-btn" @click="$emit('new-session')">
        <span class="icon">+</span>
        <span>{{ t('session.newSession') }}</span>
      </button>
      <button class="open-terminal-btn" @click="$emit('open-terminal')" :title="t('terminal.openTerminal')">
        <Icon name="terminal" :size="14" />
      </button>
    </div>

    <div class="session-section">
      <div v-if="activeSessions.length > 0" class="sessions-group">
        <div class="group-header">
          <span class="icon running-icon"></span>
          <span>{{ t('session.running') }}</span>
          <span class="count">({{ activeSessions.length }})</span>
        </div>
        <div
          v-for="session in activeSessions"
          :key="session.id"
          class="session-item"
          :class="{
            active: focusedSessionId === session.id,
            'other-project': currentProject && session.projectId !== currentProject.id
          }"
          @click="$emit('select-session', session)"
        >
          <div class="session-info">
            <div class="session-title">
              <span class="status-dot running"></span>
              <span class="title-text">{{ session.projectName }}：{{ session.title || t('session.session') }}</span>
            </div>
          </div>
          <div class="session-actions">
            <button class="rename-btn" @click.stop="$emit('rename-session', session)" :title="t('common.edit')">
              <Icon name="edit" :size="12" />
            </button>
            <button class="close-btn" @click.stop="$emit('close-session', session)" :title="t('session.close')">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
      </div>

      <div v-if="currentProject" class="sessions-group">
        <div class="group-header">
          <Icon name="history" :size="14" class="icon" />
          <span>{{ t('session.history') }}</span>
          <span v-if="historySessions.length > 0" class="count">({{ displayedHistorySessions.length }}/{{ historySessions.length }})</span>
          <button
            class="toggle-subagent-btn"
            :class="{ active: showSubagentSessions }"
            @click.stop="$emit('toggle-subagent-sessions')"
            :title="showSubagentSessions ? t('session.hideSubagent') : t('session.showSubagent')"
          >
            <Icon name="agent" :size="14" />
          </button>
          <button
            class="sync-btn"
            :class="{ syncing: isSyncing }"
            @click.stop="$emit('sync-sessions')"
            :disabled="isSyncing"
            :title="t('session.sync') || '同步会话'"
          >
            <Icon name="refresh" :size="12" />
          </button>
          <span v-if="historySessions.length > displayedHistorySessions.length" class="view-more" @click.stop="$emit('view-more')">
            {{ t('session.viewMore') }}
          </span>
        </div>

        <template v-if="displayedHistorySessions.length > 0">
          <div
            v-for="session in displayedHistorySessions"
            :key="session.session_uuid"
            class="session-item history"
            @click="$emit('open-history-session', session)"
          >
            <div class="session-info">
              <div class="session-title">
                <Icon name="message" :size="12" class="icon" />
                <span class="title-text">{{ formatSessionName(session) }}</span>
              </div>
              <div class="session-meta">
                {{ formatDate(session.created_at) }} · {{ session.message_count || 0 }} {{ t('session.messages') }}
              </div>
            </div>
            <div class="session-actions">
              <button class="rename-btn" @click.stop="$emit('rename-history-session', session)" :title="t('common.edit')">
                <Icon name="edit" :size="12" />
              </button>
              <button class="delete-btn" @click.stop="$emit('delete-history-session', session)" :title="t('session.delete')">
                <Icon name="close" :size="12" />
              </button>
            </div>
          </div>
        </template>
        <div v-else class="empty-hint small">
          {{ t('session.noHistorySessions') || '点击同步历史会话' }}
        </div>
      </div>

      <div v-if="!currentProject" class="empty-hint">
        {{ t('main.pleaseSelectProject') }}
      </div>
    </div>

    <n-modal
      :show="showNewSessionDialog"
      preset="card"
      :title="t('session.newSession')"
      style="width: 360px;"
      :mask-closable="false"
      @update:show="$emit('update:showNewSessionDialog', $event)"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            :value="newSessionTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @update:value="$emit('update:newSessionTitle', $event)"
            @keyup.enter="$emit('confirm-new-session')"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="$emit('update:showNewSessionDialog', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="$emit('confirm-new-session')">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      :show="showRenameDialog"
      preset="card"
      :title="t('session.rename') || '重命名会话'"
      style="width: 360px;"
      :mask-closable="false"
      @update:show="$emit('update:showRenameDialog', $event)"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            :value="renameTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @update:value="$emit('update:renameTitle', $event)"
            @keyup.enter="$emit('confirm-rename')"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="$emit('update:showRenameDialog', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="$emit('confirm-rename')">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>

    <n-modal
      :show="showHistoryRenameDialog"
      preset="card"
      :title="t('session.rename') || '重命名会话'"
      style="width: 360px;"
      :mask-closable="false"
      @update:show="$emit('update:showHistoryRenameDialog', $event)"
    >
      <n-form>
        <n-form-item :label="t('session.sessionTitle')">
          <n-input
            :value="historyRenameTitle"
            :placeholder="t('session.sessionTitlePlaceholder')"
            @update:value="$emit('update:historyRenameTitle', $event)"
            @keyup.enter="$emit('confirm-history-rename')"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="dialog-footer">
          <n-button @click="$emit('update:showHistoryRenameDialog', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="$emit('confirm-history-rename')">{{ t('common.confirm') }}</n-button>
        </div>
      </template>
    </n-modal>
  </template>
</template>

<script setup>
import { NSelect, NDropdown, NModal, NForm, NFormItem, NInput, NButton } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'

defineProps({
  t: {
    type: Function,
    required: true
  },
  isDeveloperMode: {
    type: Boolean,
    default: false
  },
  currentProject: {
    type: Object,
    default: null
  },
  selectedProjectId: {
    type: [String, Number],
    default: null
  },
  projectOptions: {
    type: Array,
    default: () => []
  },
  renderProjectLabel: {
    type: Function,
    required: true
  },
  projectMenuOptions: {
    type: Array,
    default: () => []
  },
  activeSessions: {
    type: Array,
    default: () => []
  },
  focusedSessionId: {
    type: String,
    default: null
  },
  historySessions: {
    type: Array,
    default: () => []
  },
  displayedHistorySessions: {
    type: Array,
    default: () => []
  },
  showSubagentSessions: {
    type: Boolean,
    default: false
  },
  isSyncing: {
    type: Boolean,
    default: false
  },
  showNewSessionDialog: {
    type: Boolean,
    default: false
  },
  newSessionTitle: {
    type: String,
    default: ''
  },
  showRenameDialog: {
    type: Boolean,
    default: false
  },
  renameTitle: {
    type: String,
    default: ''
  },
  showHistoryRenameDialog: {
    type: Boolean,
    default: false
  },
  historyRenameTitle: {
    type: String,
    default: ''
  },
  formatSessionName: {
    type: Function,
    required: true
  },
  formatDate: {
    type: Function,
    required: true
  }
})

const emit = defineEmits([
  'open-project',
  'update:selectedProjectId',
  'project-menu-select',
  'new-session',
  'open-terminal',
  'select-session',
  'rename-session',
  'close-session',
  'toggle-subagent-sessions',
  'sync-sessions',
  'view-more',
  'open-history-session',
  'rename-history-session',
  'delete-history-session',
  'update:showNewSessionDialog',
  'update:newSessionTitle',
  'confirm-new-session',
  'update:showRenameDialog',
  'update:renameTitle',
  'confirm-rename',
  'update:showHistoryRenameDialog',
  'update:historyRenameTitle',
  'confirm-history-rename'
])

const handleProjectMenuSelect = (key) => {
  emit('project-menu-select', key)
}
</script>

<style scoped>
.project-section {
  padding: 16px 16px 12px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 8px;
}

.open-project-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 14px;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.2s;
}

.open-project-btn:hover {
  background: var(--hover-bg);
}

.project-selector-row {
  display: flex;
  gap: 8px;
  align-items: center;
}

.project-dropdown {
  flex: 1;
}

.project-settings-btn {
  width: 32px;
  height: 32px;
  border-radius: 6px;
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 14px;
  flex-shrink: 0;
}

.project-settings-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
}

.new-session-area {
  padding: 8px 16px 12px;
  flex-shrink: 0;
  display: flex;
  gap: 8px;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
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

.open-terminal-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  padding: 10px;
  background: var(--panel-bg-subtle);
  color: var(--text-color);
  border: 1px solid var(--panel-border);
  border-radius: 10px;
  font-size: 12px;
  font-weight: 600;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all 0.2s;
}

.open-terminal-btn:hover {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.session-section {
  flex: 1;
  overflow-y: auto;
  padding: 8px 16px 16px;
}

.sessions-group {
  margin-bottom: 18px;
}

.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 12px 2px 8px;
}

.group-header .icon {
  font-size: 12px;
}

.group-header .running-icon {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--success-color);
}

.group-header .count {
  font-weight: 400;
}

.group-header .sync-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-color-muted);
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-header .toggle-subagent-btn {
  width: 20px;
  height: 20px;
  padding: 0;
  margin-left: 4px;
  background: transparent;
  border: none;
  border-radius: 4px;
  color: var(--text-color-muted);
  cursor: pointer;
  opacity: 0.5;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.group-header .toggle-subagent-btn:hover {
  opacity: 0.8;
  background: var(--hover-bg);
}

.group-header .toggle-subagent-btn.active {
  opacity: 1;
  color: var(--primary-color);
}

.group-header .sync-btn:hover {
  opacity: 1;
  background: var(--hover-bg);
  color: var(--primary-color);
}

.group-header .sync-btn:disabled {
  cursor: not-allowed;
}

.group-header .sync-btn.syncing {
  animation: spin 1s linear infinite;
  opacity: 1;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.group-header .view-more {
  margin-left: auto;
  font-size: 11px;
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 500;
  text-transform: none;
}

.group-header .view-more:hover {
  text-decoration: underline;
}

.session-item {
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

.session-item:hover {
  background: var(--panel-bg-subtle);
}

.session-item.active {
  background: var(--selected-bg);
  border-color: var(--selected-border);
}

.session-item.other-project {
  opacity: 0.7;
}

.session-info {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}

.session-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
}

.session-title .icon {
  font-size: 12px;
  flex-shrink: 0;
}

.title-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.status-dot.running {
  background: var(--success-color);
}

.session-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.close-btn,
.delete-btn,
.rename-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 12px;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.15s;
}

.rename-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.close-btn:hover {
  background: var(--primary-color);
  color: white;
}

.delete-btn:hover {
  background: var(--danger-color);
  color: white;
}

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
}

.empty-hint.small {
  padding: 12px 8px;
  font-size: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
