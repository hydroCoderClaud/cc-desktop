import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')
const registryPath = path.resolve(__dirname, '../../src/main/embedded-app-registry.js')
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const appI18nPath = path.resolve(__dirname, '../../src/main/utils/app-i18n.js')
const embeddedAppsComposablePath = path.resolve(__dirname, '../../src/renderer/composables/useEmbeddedApps.js')
const leftPanelPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/LeftPanel.vue')
const notebookTopNavPath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/NotebookTopNav.vue')

describe('embedded app demo wiring', () => {
  it('defines the embedded app registry entry', () => {
    const source = fs.readFileSync(registryPath, 'utf-8')

    expect(source).toContain("id: 'agent-platform-demo'")
    expect(source).toContain("menuKey: 'embedded-app-demo'")
    expect(source).toContain("page: 'embedded-app-demo'")
  })

  it('registers a window route for the embedded app demo', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("ipcMain.handle('embedded-app:list'")
    expect(source).toContain("ipcMain.handle('embedded-app:open'")
    expect(source).toContain("ipcMain.handle('window:openEmbeddedAppDemo'")
    expect(source).toContain("openEmbeddedAppWindow('embedded-app-demo')")
  })

  it('defines main-process labels for registered embedded apps', () => {
    const source = fs.readFileSync(appI18nPath, 'utf-8')

    expect(source).toContain('embeddedApps:')
    expect(source).toContain("demoTitle: 'Agent 平台 Demo'")
    expect(source).toContain("demoTitle: 'Agent Platform Demo'")
  })

  it('exposes embedded app demo opener in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain("'embedded-app:list': () => ipcRenderer.invoke('embedded-app:list')")
    expect(source).toContain("'embedded-app:open': (menuKey) => ipcRenderer.invoke('embedded-app:open', menuKey)")
    expect(source).toContain("openEmbeddedAppDemo: () => ipcRenderer.invoke('window:openEmbeddedAppDemo')")
  })

  it('adds embedded apps as a first-level settings entry in main mode', () => {
    const source = fs.readFileSync(leftPanelPath, 'utf-8')

    expect(source).toContain("useEmbeddedApps")
    expect(source).toContain("loadEmbeddedApps()")
    expect(source).toContain("t('settingsMenu.embeddedApps')")
    expect(source).toContain("key: 'embedded-apps'")
    expect(source).toContain("children:")
    expect(source).toContain("app.menuKey")
    expect(source).toContain("openEmbeddedApp(key)")
  })

  it('adds embedded apps as a first-level settings entry in notebook mode', () => {
    const source = fs.readFileSync(notebookTopNavPath, 'utf-8')

    expect(source).toContain("useEmbeddedApps")
    expect(source).toContain("loadEmbeddedApps()")
    expect(source).toContain("t('settingsMenu.embeddedApps')")
    expect(source).toContain("key: 'embedded-apps'")
    expect(source).toContain("children:")
    expect(source).toContain("app.menuKey")
    expect(source).toContain("openEmbeddedApp(key)")
  })

  it('exposes a reusable embedded apps composable', () => {
    const source = fs.readFileSync(embeddedAppsComposablePath, 'utf-8')

    expect(source).toContain("invoke('embedded-app:list')")
    expect(source).toContain("invoke('embedded-app:open', menuKey)")
  })
})
