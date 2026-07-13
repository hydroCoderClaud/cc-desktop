import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('Notebook main-window routing', () => {
  it('redirects the legacy Notebook window IPC to the main renderer', () => {
    const ipcHandlers = read('src/main/ipc-handlers.js')
    const handlerSource = ipcHandlers.slice(ipcHandlers.indexOf("ipcMain.handle('window:openNotebookWorkspace'"))

    expect(handlerSource).toContain("mainWindow.webContents.send('navigation:openNotebook')")
    expect(handlerSource).toContain('mainWindow.focus()')
    expect(handlerSource).not.toContain("page: 'notebook'")
  })

  it('exposes and cleans up the renderer event listener', () => {
    const preload = read('src/preload/preload.js')
    const mainContent = read('src/renderer/pages/main/components/MainContent.vue')

    expect(preload).toContain('onOpenNotebookWorkspace: (callback) => {')
    expect(preload).toContain("ipcRenderer.on('navigation:openNotebook', listener)")
    expect(preload).toContain("ipcRenderer.removeListener('navigation:openNotebook', listener)")
    expect(mainContent).toContain('window.electronAPI.onOpenNotebookWorkspace(async () => {')
    expect(mainContent).toContain('closeSettings()')
    expect(mainContent).toContain('await switchMode(AppMode.NOTEBOOK)')
  })
})
