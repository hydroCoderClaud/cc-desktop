<template>
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="logo">Claude Code</div>
      <button class="add-project-btn" @click="$emit('add-project')">
        <span>+</span>
        {{ t('main.addProject') }}
      </button>
    </div>

    <div class="sessions-header">
      <span>{{ t('main.projects') }}</span>
      <button class="open-project-btn" @click="$emit('open-project')" :title="t('project.openExisting')">
        📂
      </button>
    </div>

    <div class="sessions-list">
      <div
        v-for="project in projects"
        :key="project.id"
        class="session-item"
        :class="{ active: currentProject?.id === project.id, pinned: project.is_pinned, invalid: !project.pathValid }"
        :style="{ '--project-color': project.color || '#1890ff' }"
        @click="$emit('select-project', project)"
        @contextmenu.prevent="openContextMenu($event, project)"
      >
        <div class="session-title">
          <span v-if="project.is_pinned" class="pin-icon">📌</span>
          <span v-if="!project.pathValid" class="invalid-icon" :title="t('project.pathNotExist')">⚠️</span>
          {{ project.icon || '📁' }} {{ project.name }}
        </div>
        <div class="session-meta">
          <span class="session-path" :title="project.path">{{ project.path }}</span>
        </div>
      </div>
      <div v-if="projects.length === 0" class="session-item">
        <div class="session-title empty">{{ t('main.noProjects') }}</div>
        <div class="session-meta">{{ t('main.noProjectsHint') }}</div>
      </div>
    </div>

    <!-- Context Menu -->
    <Teleport to="body">
      <div
        v-if="showContextMenu"
        class="context-menu"
        :style="{ left: contextMenuX + 'px', top: contextMenuY + 'px' }"
        @click.stop
      >
        <div class="context-menu-item" @click="handleContextMenuAction('openFolder')">
          📂 {{ t('project.openFolder') }}
        </div>
        <div class="context-menu-item" @click="handleContextMenuAction('pin')">
          {{ contextMenuProject?.is_pinned ? '📌 ' + t('project.unpin') : '📌 ' + t('project.pin') }}
        </div>
        <div class="context-menu-item" @click="handleContextMenuAction('edit')">
          ✏️ {{ t('project.edit') }}
        </div>
        <div class="context-menu-divider"></div>
        <div class="context-menu-item" @click="handleContextMenuAction('hide')">
          👁️ {{ t('project.hide') }}
        </div>
        <div class="context-menu-item danger" @click="handleContextMenuAction('delete')">
          🗑️ {{ t('project.delete') }}
        </div>
      </div>
    </Teleport>

    <!-- Sidebar Footer -->
    <div class="sidebar-footer">
      <div class="footer-row">
        <!-- Settings Dropdown -->
        <n-dropdown
          trigger="click"
          :options="settingsOptions"
          @select="handleSettingsSelect"
          placement="top-start"
        >
          <button class="settings-btn">
            <span class="icon">⚙️</span>
            <span class="text">{{ t('main.settingsMenu') }}</span>
          </button>
        </n-dropdown>

        <!-- Theme Toggle -->
        <button class="theme-toggle-btn" @click="$emit('toggle-theme')" :title="isDark ? t('main.toggleLight') : t('main.toggleDark')">
          <span>{{ isDark ? '☀️' : '🌙' }}</span>
        </button>
      </div>

      <div class="user-info">
        <div class="user-name">{{ t('main.localMode') }}</div>
        <div class="user-plan">{{ t('main.desktopUser') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NDropdown } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

// Props
const props = defineProps({
  projects: {
    type: Array,
    default: () => []
  },
  currentProject: {
    type: Object,
    default: null
  },
  isDark: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'add-project',
  'open-project',
  'select-project',
  'toggle-theme',
  'context-action'
])

// Context menu state
const showContextMenu = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)
const contextMenuProject = ref(null)

// Settings dropdown options
const settingsOptions = computed(() => [
  { label: '🔑 ' + t('settingsMenu.apiConfig'), key: 'api-config' },
  { label: '🏪 ' + t('settingsMenu.providerManager'), key: 'provider-manager' },
  { label: '⚙️ ' + t('settingsMenu.globalSettings'), key: 'global-settings' },
  { type: 'divider', key: 'd1' },
  { label: '📜 ' + t('settingsMenu.sessionHistory'), key: 'session-history' }
])

// Context menu
const openContextMenu = (event, project) => {
  contextMenuX.value = event.clientX
  contextMenuY.value = event.clientY
  contextMenuProject.value = project
  showContextMenu.value = true
}

const closeContextMenu = () => {
  showContextMenu.value = false
  contextMenuProject.value = null
}

const handleContextMenuAction = (action) => {
  const project = contextMenuProject.value
  if (!project) return

  closeContextMenu()
  emit('context-action', { action, project })
}

// Settings menu
const handleSettingsSelect = (key) => {
  if (!window.electronAPI) {
    console.error('Electron API not available')
    return
  }

  switch (key) {
    case 'api-config':
      window.electronAPI.openProfileManager()
      break
    case 'provider-manager':
      window.electronAPI.openProviderManager()
      break
    case 'global-settings':
      window.electronAPI.openGlobalSettings()
      break
    case 'session-history':
      window.electronAPI.openSessionManager()
      break
  }
}

// 暴露关闭菜单方法
defineExpose({ closeContextMenu })
</script>

<style scoped>
.sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e5e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

:deep(.dark-theme) .sidebar {
  background: #242424;
  border-color: #333333;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e5e5e0;
}

:deep(.dark-theme) .sidebar-header {
  border-color: #333333;
}

.logo {
  font-family: 'Crimson Pro', serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.add-project-btn {
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: #ff6b35;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.add-project-btn:hover {
  background: #ff5722;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.sessions-header {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  color: #8c8c8c;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  display: flex;
  justify-content: space-between;
  align-items: center;
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
  background: #f5f5f0;
}

:deep(.dark-theme) .open-project-btn:hover {
  background: #333333;
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 8px 4px 8px;
}

.session-item {
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  outline: 2px solid transparent;
  outline-offset: -2px;
}

.session-item:hover {
  background: #f5f5f0;
}

:deep(.dark-theme) .session-item:hover {
  background: #333333;
}

.session-item.active {
  background: #f5f5f0;
  outline-color: var(--project-color);
}

:deep(.dark-theme) .session-item.active {
  background: #333333;
}

.session-item.pinned {
  border-top: 1px dashed #e5e5e0;
}

:deep(.dark-theme) .session-item.pinned {
  border-top-color: #444444;
}

.pin-icon {
  font-size: 10px;
  margin-right: 2px;
}

.invalid-icon {
  font-size: 12px;
  margin-right: 2px;
}

.session-item.invalid {
  opacity: 0.6;
}

.session-item.invalid .session-path {
  color: #e74c3c;
  text-decoration: line-through;
}

.session-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}

.session-title.empty {
  color: #8c8c8c;
}

.session-meta {
  font-size: 12px;
  color: #8c8c8c;
}

.session-path {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: block;
}

/* Sidebar Footer */
.sidebar-footer {
  border-top: 1px solid #e5e5e0;
  padding: 12px;
}

:deep(.dark-theme) .sidebar-footer {
  border-color: #333333;
}

.footer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.settings-btn {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: #f5f5f0;
  border: 1px solid #e5e5e0;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  color: #2d2d2d;
}

.settings-btn:hover {
  background: #e8e8e3;
  border-color: #ff6b35;
}

:deep(.dark-theme) .settings-btn {
  background: #333333;
  border-color: #444444;
  color: #e8e8e8;
}

:deep(.dark-theme) .settings-btn:hover {
  background: #404040;
  border-color: #ff6b35;
}

.theme-toggle-btn {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #f5f5f0;
  border: 1px solid #e5e5e0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  font-size: 18px;
}

.theme-toggle-btn:hover {
  transform: scale(1.05);
  border-color: #ff6b35;
}

:deep(.dark-theme) .theme-toggle-btn {
  background: #333333;
  border-color: #444444;
}

.user-info {
  padding: 8px 4px;
}

.user-name {
  font-size: 13px;
  font-weight: 600;
}

.user-plan {
  font-size: 11px;
  color: #8c8c8c;
}

/* Context Menu */
.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 160px;
  background: #ffffff;
  border: 1px solid #e5e5e0;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
  padding: 4px 0;
}

:deep(.dark-theme) .context-menu {
  background: #2a2a2a;
  border-color: #444444;
}

.context-menu-item {
  padding: 8px 16px;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.15s;
}

.context-menu-item:hover {
  background: #f5f5f0;
}

:deep(.dark-theme) .context-menu-item:hover {
  background: #3a3a3a;
}

.context-menu-item.danger {
  color: #e74c3c;
}

.context-menu-item.danger:hover {
  background: #fef0ef;
}

:deep(.dark-theme) .context-menu-item.danger:hover {
  background: #3a2a2a;
}

.context-menu-divider {
  height: 1px;
  background: #e5e5e0;
  margin: 4px 0;
}

:deep(.dark-theme) .context-menu-divider {
  background: #444444;
}
</style>
