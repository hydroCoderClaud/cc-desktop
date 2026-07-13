import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('Developer mode UI retirement', () => {
  it('does not expose Developer mode entries in the left panel', () => {
    const source = read('src/renderer/pages/main/components/LeftPanel.vue')

    expect(source).not.toContain('LeftPanelDeveloperPane')
    expect(source).not.toContain('mode.switchToDeveloper')
    expect(source).not.toContain("mode: isAgentMode.value ? 'agent' : 'developer'")
  })

  it('does not mount Developer terminal content in main content', () => {
    const source = read('src/renderer/pages/main/components/MainContent.vue')

    expect(source).not.toContain("import RightPanel from './RightPanel/index.vue'")
    expect(source).not.toContain("import TerminalTab from './TerminalTab.vue'")
    expect(source).not.toContain("import ProjectEditModal from './ProjectEditModal.vue'")
    expect(source).not.toContain('<RightPanel')
    expect(source).not.toContain('<TerminalTab')
    expect(source).not.toContain('<ProjectEditModal')
    expect(source).not.toContain('handleProjectSave')
    expect(source).not.toContain('handleContextAction')
    expect(source).not.toContain('main.developerWelcome')
    expect(source).toContain('openAgentNewConversation')
    expect(source).not.toContain('handleNewSession?.()')
  })

  it('does not expose retired project management APIs in preload', () => {
    const source = read('src/preload/preload.js')

    expect(source).not.toContain('createProject:')
    expect(source).not.toContain('updateProject:')
    expect(source).not.toContain('duplicateProject:')
    expect(source).not.toContain('hideProject:')
    expect(source).not.toContain('unhideProject:')
    expect(source).not.toContain('deleteProject:')
    expect(source).not.toContain('toggleProjectPinned:')
    expect(source).not.toContain('touchProject:')
    expect(source).not.toContain('newProjectSession:')
    expect(source).not.toContain('openProjectSession:')
    expect(source).toContain('getProjects:')
    expect(source).toContain('getCapabilityProjects:')
    expect(source).toContain('ensureWorkspaceProject:')
    expect(source).toContain('openProject:')
  })

  it('does not offer Developer mode from Notebook navigation', () => {
    const source = read('src/renderer/pages/notebook/components/NotebookTopNav.vue')

    expect(source).not.toContain('developerModeEnabled')
    expect(source).not.toContain('mode.switchToDeveloper')
  })

  it('does not show the Developer mode enable switch in global settings', () => {
    const source = read('src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')

    expect(source).not.toContain("t('globalSettings.enableDeveloperMode')")
    expect(source).not.toContain('formData.enableDeveloperMode')
  })

  it('does not expose retired global session limit settings', () => {
    const globalSettings = read('src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')
    const preload = read('src/preload/preload.js')
    const configHandlers = read('src/main/ipc-handlers/config-handlers.js')
    const configManager = read('src/main/config-manager.js')
    const zhLocale = read('src/renderer/locales/zh-CN.js')
    const enLocale = read('src/renderer/locales/en-US.js')

    for (const source of [globalSettings, preload, configHandlers, zhLocale, enLocale]) {
      expect(source).not.toContain('maxActiveSessions')
      expect(source).not.toContain('getMaxActiveSessions')
      expect(source).not.toContain('updateMaxActiveSessions')
      expect(source).not.toContain('getMaxHistorySessions')
      expect(source).not.toContain('updateMaxHistorySessions')
      expect(source).not.toContain('sessionLimitsGroup')
      expect(source).not.toContain('maxSessionsReached')
    }

    expect(preload).not.toContain('getSessionLimits')
    expect(configManager).not.toContain('getMaxActiveSessions()')
    expect(configManager).not.toContain('updateMaxActiveSessions(')
    expect(configManager).not.toContain('getMaxHistorySessions()')
    expect(configManager).not.toContain('updateMaxHistorySessions(')
    expect(configManager).not.toContain('maxActiveSessions: 5')
    expect(configManager).not.toContain('maxHistorySessions: 10')
  })

  it('does not expose the retired terminal runtime or settings APIs', () => {
    const appearanceSettings = read('src/renderer/pages/appearance-settings/components/AppearanceSettingsContent.vue')
    const preload = read('src/preload/preload.js')
    const configHandlers = read('src/main/ipc-handlers/config-handlers.js')
    const configManager = read('src/main/config-manager.js')
    const ipcHandlers = read('src/main/ipc-handlers.js')
    const mainProcess = read('src/main/index.js')

    expect(appearanceSettings).not.toContain('globalSettings.terminalSettings')
    expect(preload).not.toContain('getTerminalSettings:')
    expect(preload).not.toContain('startTerminal:')
    expect(preload).not.toContain('createActiveSession:')
    expect(configHandlers).not.toContain('config:getTerminalSettings')
    expect(configManager).not.toContain('getTerminalSettings()')
    expect(configManager).not.toContain('updateTerminalSettings(')
    expect(configManager).not.toContain('getQuickCommands()')
    expect(configManager).not.toContain('addQuickCommand(')
    expect(configManager).not.toContain('updateQuickCommand(')
    expect(configManager).not.toContain('deleteQuickCommand(')
    expect(ipcHandlers).not.toContain("'terminal:start'")
    expect(ipcHandlers).not.toContain('setupActiveSessionHandlers')
    expect(configHandlers).not.toContain('quickCommands:')
    expect(preload).not.toContain('getQuickCommands:')
    expect(preload).not.toContain('addQuickCommand:')
    expect(mainProcess).not.toContain("require('./terminal-manager')")
    expect(mainProcess).not.toContain("require('./active-session-manager')")
    expect(fs.existsSync(path.join(root, 'src/main/terminal-manager.js'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/main/active-session-manager.js'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/main/ipc-handlers/active-session-handlers.js'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/TerminalTab.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/RightPanel/index.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/RightPanel/MessageQueue.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/RightPanel/QuickCommands.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/RightPanel/QuickInput.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/pages/main/components/RightPanel/TabBar.vue'))).toBe(false)
    expect(fs.existsSync(path.join(root, 'src/renderer/composables/useMessageQueue.js'))).toBe(false)
  })

  it('does not offer a system Claude runtime option in global settings', () => {
    const source = read('src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')
    const zhLocale = read('src/renderer/locales/zh-CN.js')
    const enLocale = read('src/renderer/locales/en-US.js')

    expect(source).not.toContain('developerClaudeSourceOptions')
    expect(source).not.toContain("value: 'system'")
    expect(source).not.toContain('formData.developerClaudeSource')
    expect(zhLocale).not.toContain('系统 Claude')
    expect(enLocale).not.toContain('System Claude')
  })

  it('opens capability management with projectPath before cwd for Agent conversations', () => {
    const source = read('src/renderer/pages/main/components/agent/AgentLeftContent.vue')

    expect(source).toContain('cwd: conv?.projectPath || conv?.cwd || props.currentProject?.path || null')
  })
})
