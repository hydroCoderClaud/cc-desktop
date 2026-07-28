import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('Notebook workbench window wiring', () => {
  it('opens Notebook in a singleton child window with a ready/restore protocol', () => {
    const source = read('src/main/ipc-handlers.js')

    expect(source).toContain("openSingletonSubWindow('notebook-workbench'")
    expect(source).toContain("page: 'notebook-workbench'")
    expect(source).toContain("ipcMain.handle('notebook:openWorkbench'")
    expect(source).toContain("ipcMain.handle('notebook:workbenchReady'")
    expect(source).toContain("webContents.send('notebook:restore', pendingNotebookWorkbenchTarget)")
    expect(source).toContain('Replacing pending restore target with the latest IM activation')
    expect(source).not.toContain("closeEmbeddedAppCurrentSession('notebook-workbench')")
  })

  it('subscribes the dedicated workbench window to first-party host agent events', () => {
    const source = read('src/main/ipc-handlers.js')

    expect(source).toContain('registerNotebookWorkbenchHostSubscription')
    expect(source).toContain("clientId: 'host-ui'")
    expect(source).toContain("clientMeta: { surface: 'notebook-workbench' }")
    expect(source).toContain('window.webContents.send(agentEvent.channel, agentEvent.payload)')
    expect(source).toContain('unregisterNotebookWorkbenchHostSubscription()')
  })

  it('exposes the opener and restore listener through preload', () => {
    const source = read('src/preload/preload.js')

    expect(source).toContain("openNotebookWorkbench: (options = {}) => ipcRenderer.invoke('notebook:openWorkbench', options)")
    expect(source).toContain("notebookWorkbenchReady: () => ipcRenderer.invoke('notebook:workbenchReady')")
    expect(source).toContain("ipcRenderer.on('notebook:restore', listener)")
  })

  it('builds a dedicated Notebook renderer and applies restore requests after mount', () => {
    const vite = read('vite.config.mjs')
    const app = read('src/renderer/pages/notebook-workbench/NotebookWorkbenchApp.vue')

    expect(vite).toContain('notebookWorkbench:')
    expect(vite).toContain("src/renderer/pages/notebook-workbench/index.html")
    expect(app).toContain('window.electronAPI?.notebookWorkbenchReady?.()')
    expect(app).toContain('window.electronAPI?.onNotebookWorkbenchRestore?.')
    expect(app).toContain('restoreSessionById?.(sessionId)')
  })

  it('routes main-window entry and restored Notebook sessions to the workbench', () => {
    const leftPanel = read('src/renderer/pages/main/components/LeftPanel.vue')
    const leftPanelHeader = read('src/renderer/pages/main/components/LeftPanelHeader.vue')
    const mainContent = read('src/renderer/pages/main/components/MainContent.vue')

    expect(leftPanel).toContain("key: 'notebook-workbench'")
    expect(leftPanel).toContain("if (key === 'notebook-workbench')")
    expect(leftPanel).toContain('openNotebookWorkbench?.()')
    expect(leftPanel).toContain("import { useAppMode } from '@composables/useAppMode'")
    expect(leftPanel).toContain('const { isAgentMode } = useAppMode()')
    expect(leftPanel).not.toContain('@mode-select="handleModeSelect"')
    expect(leftPanel).not.toContain("t('mode.switchToNotebook')")
    expect(leftPanelHeader).toContain('v-if="modeOptions.length > 0"')
    expect(mainContent).toContain('openNotebookWorkbench?.({ sessionId })')
    expect(mainContent).not.toContain('await notebookWorkspaceRef.value?.restoreSessionById?.(sessionId)')
  })

  it('returns to the main window without changing the Notebook session lifecycle', () => {
    const topNav = read('src/renderer/pages/notebook/components/NotebookTopNav.vue')

    expect(topNav).toContain("t('notebook.nav.backToMain')")
    expect(topNav).toContain('window.electronAPI?.focusMainWindow?.()')
    expect(topNav).toContain('window.close()')
    expect(topNav).not.toContain("import { useAppMode } from '@composables/useAppMode'")
  })
})
