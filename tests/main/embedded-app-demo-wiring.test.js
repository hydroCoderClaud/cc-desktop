import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')
const registryPath = path.resolve(__dirname, '../../src/main/embedded-app-registry.js')
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const appI18nPath = path.resolve(__dirname, '../../src/main/utils/app-i18n.js')
const viteConfigPath = path.resolve(__dirname, '../../vite.config.mjs')
const embeddedAppsComposablePath = path.resolve(__dirname, '../../src/renderer/composables/useEmbeddedApps.js')
const leftPanelPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/LeftPanel.vue')
const notebookTopNavPath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/NotebookTopNav.vue')

describe('embedded app registry wiring', () => {
  it('keeps only the hydrology workbench in the embedded app registry', () => {
    const source = fs.readFileSync(registryPath, 'utf-8')

    expect(source).not.toContain("id: 'agent-platform-demo'")
    expect(source).not.toContain("menuKey: 'embedded-app-demo'")
    expect(source).not.toContain("page: 'embedded-app-demo'")
    expect(source).toContain("id: 'hydrology-workbench'")
    expect(source).toContain("menuKey: 'hydrology-workbench'")
    expect(source).toContain("page: 'hydrology-workbench'")
  })

  it('keeps only the generic embedded app window handlers', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("ipcMain.handle('embedded-app:list'")
    expect(source).toContain("ipcMain.handle('embedded-app:open'")
    expect(source).not.toContain("ipcMain.handle('window:openEmbeddedAppDemo'")
    expect(source).not.toContain("openEmbeddedAppWindow('embedded-app-demo')")
    expect(source).toContain('webviewTag: true')
  })

  it('reuses an existing embedded app window for the same menu key', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain('const embeddedAppWindows = new Map()')
    expect(source).toContain('const existingWindow = embeddedAppWindows.get(menuKey)')
    expect(source).toContain('return { success: true, reused: true };')
    expect(source).toContain('embeddedAppWindows.set(menuKey, window)')
    expect(source).toContain("window.once('closed', () => {")
    expect(source).toContain('embeddedAppWindows.delete(menuKey)')
  })

  it('defines main-process labels for the remaining embedded app', () => {
    delete require.cache[appI18nPath]
    const { tMain } = require(appI18nPath)
    const zhConfig = { getConfig: () => ({ settings: { locale: 'zh-CN' } }) }
    const enConfig = { getConfig: () => ({ settings: { locale: 'en-US' } }) }

    expect(tMain(zhConfig, 'embeddedApps.hydrologyWorkbenchTitle')).toBe('水文站工作台')
    expect(tMain(enConfig, 'embeddedApps.hydrologyWorkbenchTitle')).toBe('Hydrology Workbench')
    expect(tMain(zhConfig, 'app.windows.hydrologyWorkbench')).toBe('水文站工作台 - Hydro Desktop')
  })

  it('keeps only the hydrology workbench in renderer build inputs', () => {
    const source = fs.readFileSync(viteConfigPath, 'utf-8')

    expect(source).not.toContain('embeddedAppDemo:')
    expect(source).toContain('hydrologyWorkbench:')
    expect(source).toContain("src/renderer/pages/hydrology-workbench/index.html")
  })

  it('does not expose a dedicated embedded app demo opener in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain("'embedded-app:list': () => ipcRenderer.invoke('embedded-app:list')")
    expect(source).toContain("'embedded-app:open': (menuKey) => ipcRenderer.invoke('embedded-app:open', menuKey)")
    expect(source).not.toContain("openEmbeddedAppDemo: () => ipcRenderer.invoke('window:openEmbeddedAppDemo')")
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
    expect(source.indexOf("key: 'appearance-settings'")).toBeGreaterThan(-1)
    expect(source.indexOf("key: 'embedded-apps'")).toBeGreaterThan(source.indexOf("key: 'appearance-settings'"))
    expect(source).not.toContain("{ label: t('settingsMenu.sessionHistory'), key: 'session-history'")
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
    expect(source.indexOf("key: 'appearance-settings'")).toBeGreaterThan(-1)
    expect(source.indexOf("key: 'embedded-apps'")).toBeGreaterThan(source.indexOf("key: 'appearance-settings'"))
    expect(source).not.toContain("{ label: t('settingsMenu.sessionHistory'), key: 'session-history'")
  })

  it('exposes a reusable embedded apps composable', () => {
    const source = fs.readFileSync(embeddedAppsComposablePath, 'utf-8')

    expect(source).toContain("invoke('embedded-app:list')")
    expect(source).toContain("invoke('embedded-app:open', menuKey)")
  })
})
