<template>
  <div class="app-container" :class="{ 'dark-theme': isDark }" :style="cssVars">
    <!-- Sidebar -->
    <div class="sidebar">
      <div class="sidebar-header">
        <div class="logo">Claude Code</div>
        <button class="new-session-btn" @click="handleAddProject">
          <span>+</span>
          {{ t('main.newSession') }}
        </button>
      </div>

      <div class="sessions-header">
        <span>{{ t('main.projects') }}</span>
      </div>

      <div class="sessions-list">
        <div
          v-for="project in projects"
          :key="project.id"
          class="session-item"
          :class="{ active: currentProject?.id === project.id }"
          @click="selectProject(project)"
        >
          <div class="session-title">{{ project.icon || '📁' }} {{ project.name }}</div>
          <div class="session-meta">
            <span class="session-path" :title="project.path">{{ project.path }}</span>
          </div>
        </div>
        <div v-if="projects.length === 0" class="session-item">
          <div class="session-title empty">{{ t('main.noProjects') }}</div>
          <div class="session-meta">{{ t('main.noProjectsHint') }}</div>
        </div>
      </div>

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
          <button class="theme-toggle-btn" @click="handleToggleTheme" :title="isDark ? t('main.toggleLight') : t('main.toggleDark')">
            <span>{{ isDark ? '☀️' : '🌙' }}</span>
          </button>
        </div>

        <div class="user-info">
          <div class="user-name">{{ t('main.localMode') }}</div>
          <div class="user-plan">{{ t('main.desktopUser') }}</div>
        </div>
      </div>
    </div>

    <!-- Main Content -->
    <div class="main-content">
      <div class="main-header">
        <div class="session-name">{{ currentProject?.name || t('main.welcome') }}</div>
        <div class="project-path">{{ currentProject?.path || t('main.pleaseSelectProject') }}</div>
      </div>

      <div class="main-area">
        <!-- Empty State -->
        <div v-if="!connected" class="empty-state">
          <div class="pixel-mascot">🤖</div>

          <div class="selectors-row">
            <div class="selector" @click="handleAddProject">
              <span>📁</span>
              <span>{{ currentProject?.name || t('main.selectProject') }}</span>
            </div>
          </div>

          <div class="connect-actions">
            <button class="connect-btn" @click="handleConnect" :disabled="!currentProject">
              <span>▶️</span>
              <span>{{ t('common.connect') }}</span>
            </button>
          </div>

          <div class="warning-box">
            <div class="warning-icon">⚠️</div>
            <div class="warning-text">
              {{ t('main.warningText') }}
            </div>
          </div>
        </div>

        <!-- Terminal Container -->
        <div v-show="connected" class="terminal-container">
          <div ref="terminalRef" class="terminal"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, h } from 'vue'
import { useMessage } from 'naive-ui'
import { useIPC } from '@composables/useIPC'
import { useTheme } from '@composables/useTheme'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const { invoke } = useIPC()
const { isDark, cssVars, toggleTheme } = useTheme()
const { t, initLocale } = useLocale()

// State
const projects = ref([])
const currentProject = ref(null)
const connected = ref(false)
const terminalRef = ref(null)

// Terminal instances
let terminal = null
let fitAddon = null

// Settings dropdown options (computed for i18n)
const settingsOptions = computed(() => [
  { label: '🔑 ' + t('settingsMenu.apiConfig'), key: 'api-config' },
  { label: '🏪 ' + t('settingsMenu.providerManager'), key: 'provider-manager' },
  { label: '⚙️ ' + t('settingsMenu.globalSettings'), key: 'global-settings' },
  { type: 'divider', key: 'd1' },
  { label: '📜 ' + t('settingsMenu.sessionHistory'), key: 'session-history' }
])

// Initialize
onMounted(async () => {
  await initLocale()
  await loadProjects()
  initTerminal()
  setupTerminalListeners()
})

onUnmounted(() => {
  if (terminal) {
    terminal.dispose()
  }
})

// Load projects
const loadProjects = async () => {
  try {
    projects.value = await invoke('listProjects')
  } catch (err) {
    console.error('Failed to load projects:', err)
    projects.value = []
  }
}

// Initialize terminal
const initTerminal = () => {
  if (!window.Terminal) {
    console.error('xterm.js not loaded')
    return
  }

  terminal = new window.Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: getTerminalTheme(),
    convertEol: true
  })

  fitAddon = new window.FitAddon.FitAddon()
  terminal.loadAddon(fitAddon)

  const webLinksAddon = new window.WebLinksAddon.WebLinksAddon()
  terminal.loadAddon(webLinksAddon)

  // Handle user input
  terminal.onData(data => {
    if (connected.value && window.electronAPI) {
      window.electronAPI.writeTerminal(data)
    }
  })

  // Handle resize
  window.addEventListener('resize', handleResize)
}

const getTerminalTheme = () => {
  return isDark.value ? {
    background: '#0d0d0d',
    foreground: '#e8e8e8',
    cursor: '#ff6b35'
  } : {
    background: '#1a1a1a',
    foreground: '#ffffff',
    cursor: '#ff6b35'
  }
}

const setupTerminalListeners = () => {
  if (!window.electronAPI) return

  window.electronAPI.onTerminalData(data => {
    if (terminal) {
      terminal.write(data)
    }
  })

  window.electronAPI.onTerminalExit(({ exitCode }) => {
    console.log('Terminal exited:', exitCode)
    message.info(t('messages.terminalExited'))
    handleDisconnect()
  })

  window.electronAPI.onTerminalError(error => {
    console.error('Terminal error:', error)
    message.error(t('messages.terminalError') + ': ' + error)
    handleDisconnect()
  })
}

const handleResize = () => {
  if (fitAddon && connected.value) {
    fitAddon.fit()
    const { cols, rows } = terminal
    window.electronAPI?.resizeTerminal({ cols, rows })
  }
}

// Project management
const selectProject = (project) => {
  currentProject.value = project
}

const handleAddProject = async () => {
  try {
    const folderPath = await invoke('selectFolder')
    if (!folderPath) return

    const folderName = folderPath.split(/[\\\/]/).pop()
    const project = await invoke('addProject', { name: folderName, path: folderPath })

    await loadProjects()
    currentProject.value = project
    message.success(t('messages.projectAdded') + ': ' + project.name)
  } catch (err) {
    console.error('Failed to add project:', err)
    message.error(t('messages.operationFailed'))
  }
}

// Connect/Disconnect
const handleConnect = async () => {
  if (!currentProject.value) {
    message.warning(t('messages.pleaseSelectProject'))
    return
  }

  try {
    const result = await invoke('startTerminal', currentProject.value.path)
    if (result.success) {
      connected.value = true

      await nextTick()
      if (terminalRef.value && terminal) {
        terminal.open(terminalRef.value)
        setTimeout(() => {
          fitAddon.fit()
          const { cols, rows } = terminal
          window.electronAPI?.resizeTerminal({ cols, rows })
        }, 100)
      }

      message.success(t('messages.connectionSuccess') + ': ' + currentProject.value.name)
    } else {
      message.error(t('messages.connectionFailed'))
    }
  } catch (err) {
    console.error('Connection error:', err)
    message.error(t('messages.connectionFailed'))
  }
}

const handleDisconnect = () => {
  connected.value = false
  if (terminal) {
    terminal.clear()
  }
}

// Theme toggle handler
const handleToggleTheme = async () => {
  await toggleTheme()
  if (terminal) {
    terminal.options.theme = getTerminalTheme()
  }
}

// Settings menu
const handleSettingsSelect = (key) => {
  if (!window.electronAPI) {
    message.error('Electron API not available')
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
</script>

<style scoped>
.app-container {
  display: flex;
  height: 100vh;
  width: 100vw;
  background: #f5f5f0;
  color: #2d2d2d;
  transition: all 0.3s ease;
}

.app-container.dark-theme {
  background: #1a1a1a;
  color: #e8e8e8;
}

/* Sidebar */
.sidebar {
  width: 260px;
  background: #ffffff;
  border-right: 1px solid #e5e5e0;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: all 0.3s ease;
}

.dark-theme .sidebar {
  background: #242424;
  border-color: #333333;
}

.sidebar-header {
  padding: 16px;
  border-bottom: 1px solid #e5e5e0;
}

.dark-theme .sidebar-header {
  border-color: #333333;
}

.logo {
  font-family: 'Crimson Pro', serif;
  font-size: 24px;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.new-session-btn {
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

.new-session-btn:hover {
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
}

.sessions-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 8px;
}

.session-item {
  padding: 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.session-item:hover {
  background: #f5f5f0;
}

.dark-theme .session-item:hover {
  background: #333333;
}

.session-item.active {
  background: #f5f5f0;
  border-left: 3px solid #ff6b35;
  padding-left: 9px;
}

.dark-theme .session-item.active {
  background: #333333;
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

.dark-theme .sidebar-footer {
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

.dark-theme .settings-btn {
  background: #333333;
  border-color: #444444;
  color: #e8e8e8;
}

.dark-theme .settings-btn:hover {
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

.dark-theme .theme-toggle-btn {
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

/* Main Content */
.main-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.main-header {
  padding: 16px 24px;
  border-bottom: 1px solid #e5e5e0;
  background: #ffffff;
}

.dark-theme .main-header {
  background: #242424;
  border-color: #333333;
}

.session-name {
  font-size: 15px;
  font-weight: 600;
}

.project-path {
  font-size: 13px;
  color: #8c8c8c;
  font-family: 'SF Mono', 'Monaco', monospace;
}

.main-area {
  flex: 1;
  overflow: hidden;
  position: relative;
}

/* Empty State */
.empty-state {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-width: 500px;
  width: calc(100% - 48px);
  text-align: center;
}

.pixel-mascot {
  font-size: 80px;
  margin-bottom: 32px;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-10px); }
}

.selectors-row {
  display: flex;
  gap: 16px;
  margin-bottom: 32px;
  justify-content: center;
}

.selector {
  min-width: 200px;
  padding: 12px 16px;
  background: white;
  border: 1.5px solid #e5e5e0;
  border-radius: 10px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #2d2d2d;
}

.selector:hover {
  border-color: #ff6b35;
  box-shadow: 0 4px 12px rgba(0,0,0,0.06);
}

.connect-actions {
  display: flex;
  gap: 12px;
  justify-content: center;
}

.connect-btn {
  padding: 12px 32px;
  background: #ff6b35;
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  gap: 8px;
}

.connect-btn:hover:not(:disabled) {
  background: #ff5722;
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.connect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.warning-box {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
  background: #fef9e7;
  border: 1px solid #f4d03f;
  border-radius: 10px;
  margin-top: 32px;
  text-align: left;
}

.dark-theme .warning-box {
  background: #3a3a1a;
}

.warning-icon {
  color: #f39c12;
  font-size: 20px;
  flex-shrink: 0;
}

.warning-text {
  font-size: 13px;
  line-height: 1.6;
  color: #856404;
}

.dark-theme .warning-text {
  color: #f4d03f;
}

/* Terminal Container */
.terminal-container {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 16px;
}

.terminal {
  height: 100%;
  background: #1a1a1a;
  border-radius: 12px;
  padding: 16px;
}

.dark-theme .terminal {
  background: #0d0d0d;
}

/* Scrollbar */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: #d0d0c8;
  border-radius: 4px;
}

.dark-theme ::-webkit-scrollbar-thumb {
  background: #444444;
}
</style>
