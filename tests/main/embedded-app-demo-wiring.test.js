import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const settingsWorkbenchPath = path.resolve(__dirname, '../../src/renderer/pages/settings-workbench/components/SettingsWorkbenchContent.vue')

describe('embedded app demo wiring', () => {
  it('registers a window route for the embedded app demo', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("ipcMain.handle('window:openEmbeddedAppDemo'")
    expect(source).toContain("page: 'embedded-app-demo'")
  })

  it('exposes embedded app demo opener in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain("openEmbeddedAppDemo: () => ipcRenderer.invoke('window:openEmbeddedAppDemo')")
  })

  it('shows embedded apps tab in settings workbench', () => {
    const source = fs.readFileSync(settingsWorkbenchPath, 'utf-8')

    expect(source).toContain("EmbeddedAppsWorkbenchTab")
    expect(source).toContain("{ id: 'embeddedApps'")
    expect(source).toContain("embeddedApps: markRaw(EmbeddedAppsWorkbenchTab)")
  })
})
