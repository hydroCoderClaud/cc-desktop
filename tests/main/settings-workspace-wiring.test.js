import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('in-main settings workspace wiring', () => {
  it('keeps settings as a temporary main-window surface', () => {
    const mainContent = read('src/renderer/pages/main/components/MainContent.vue')
    const navigation = read('src/renderer/composables/useSettingsNavigation.js')

    expect(mainContent).toContain("import { SettingsSection, useSettingsNavigation } from '@composables/useSettingsNavigation'")
    expect(mainContent).toContain('<SettingsWorkspace />')
    expect(mainContent).toContain('v-show="isSettingsOpen"')
    expect(mainContent).not.toContain('window.electronAPI.openProfileManager()')
    expect(navigation).toContain('const settingsRequest = ref(null)')
    expect(navigation).not.toContain('updateSettings')
    expect(navigation).not.toContain('switchMode')
  })

  it('routes the core Agent and Notebook settings entries into the shared workspace', () => {
    const leftPanel = read('src/renderer/pages/main/components/LeftPanel.vue')
    const notebookTopNav = read('src/renderer/pages/notebook/components/NotebookTopNav.vue')

    for (const source of [leftPanel, notebookTopNav]) {
      expect(source).toContain("import { SettingsSection, useSettingsNavigation } from '@composables/useSettingsNavigation'")
      expect(source).toContain('section: settingsSection')
      expect(source).not.toContain('window.electronAPI.openModelSettings()')
      expect(source).not.toContain('window.electronAPI.openGlobalSettings()')
      expect(source).not.toContain('window.electronAPI.openAppearanceSettings()')
      expect(source).not.toContain('window.electronAPI.openChannelSettings()')
      expect(source).not.toContain('window.electronAPI.openSettingsWorkbench({')
      expect(source).not.toContain('window.electronAPI.openUpdateManager()')
    }
  })

  it('embeds all built-in settings pages while leaving legacy IPC fallback available', () => {
    const workspace = read('src/renderer/pages/main/components/SettingsWorkspace.vue')
    const ipcHandlers = read('src/main/ipc-handlers.js')

    expect(workspace).toContain("import ModelSettingsContent from '@/pages/model-settings/components/ModelSettingsContent.vue'")
    expect(workspace).toContain("import ChannelSettingsContent from '@/pages/channel-settings/components/ChannelSettingsContent.vue'")
    expect(workspace).toContain("import GlobalSettingsContent from '@/pages/global-settings/components/GlobalSettingsContent.vue'")
    expect(workspace).toContain("import AppearanceSettingsContent from '@/pages/appearance-settings/components/AppearanceSettingsContent.vue'")
    expect(workspace).toContain("import SettingsWorkbenchContent from '@/pages/settings-workbench/components/SettingsWorkbenchContent.vue'")
    expect(workspace).toContain("import UpdateManagerContent from '@/pages/update-manager/components/UpdateManagerContent.vue'")
    expect(workspace).toContain('<n-notification-provider>')
    expect(ipcHandlers).toContain("ipcMain.handle('window:openModelSettings'")
    expect(ipcHandlers).toContain("ipcMain.handle('window:openSettingsWorkbench'")
  })

  it('passes reactive context into the in-main workbench and opens updates in the same surface', () => {
    const app = read('src/renderer/pages/main/App.vue')
    const agentLeftContent = read('src/renderer/pages/main/components/agent/AgentLeftContent.vue')
    const workbench = read('src/renderer/pages/settings-workbench/components/SettingsWorkbenchContent.vue')

    expect(app).toContain("openSettings({ section: SettingsSection.UPDATES })")
    expect(agentLeftContent).toContain('section: SettingsSection.SESSION_APPS')
    expect(workbench).toContain('const windowContext = computed(() => {')
    expect(workbench).toContain('watch(windowContext, () => {')
    expect(workbench).toContain('sessionAppId: typeof props.context.sessionAppId')
  })
})
