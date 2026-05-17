import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')

describe('embedded hydro agent bridge wiring', () => {
  it('exposes hydroAgent and hydroHostTheme in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain("contextBridge.exposeInMainWorld('hydroAgent', hydroAgent)")
    expect(source).toContain("contextBridge.exposeInMainWorld('hydroHostTheme', hydroHostTheme)")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:createSession'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:sendMessage'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:switchApiProfile'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:getInitResult'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:getMcpServerStatus'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:getSupportedCommands'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:listDir'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:searchFiles'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:getContext'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:updateContext'")
    expect(source).toContain("ipcRenderer.invoke('hydro-agent:commandResult'")
    expect(source).toContain('onCommandRequest: (callback) =>')
    expect(source).toContain("ipcRenderer.invoke('embedded-app:getPreferences'")
    expect(source).toContain("ipcRenderer.invoke('embedded-app:updatePreferences'")
    expect(source).toContain('hydroAgentState.defaultCwd = result?.defaultCwd || null')
  })

  it('registers embedded hydro-agent ipc routes in the main process', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("ipcMain.handle('hydro-agent:connect'")
    expect(source).toContain("ipcMain.handle('hydro-agent:disconnect'")
    expect(source).toContain("ipcMain.handle('hydro-agent:createSession'")
    expect(source).toContain("ipcMain.handle('hydro-agent:listSessions'")
    expect(source).toContain("ipcMain.handle('hydro-agent:sendMessage'")
    expect(source).toContain("ipcMain.handle('hydro-agent:switchApiProfile'")
    expect(source).toContain("ipcMain.handle('hydro-agent:getInitResult'")
    expect(source).toContain("ipcMain.handle('hydro-agent:getMcpServerStatus'")
    expect(source).toContain("ipcMain.handle('hydro-agent:getSupportedCommands'")
    expect(source).toContain("ipcMain.handle('hydro-agent:respondInteraction'")
    expect(source).toContain("ipcMain.handle('hydro-agent:updateContext'")
    expect(source).toContain("ipcMain.handle('hydro-agent:getContext'")
    expect(source).toContain("ipcMain.handle('hydro-agent:commandResult'")
    expect(source).toContain("ipcMain.handle('hydro-agent:listDir'")
    expect(source).toContain("ipcMain.handle('hydro-agent:searchFiles'")
    expect(source).toContain("ipcMain.handle('embedded-app:getPreferences'")
    expect(source).toContain("ipcMain.handle('embedded-app:updatePreferences'")
    expect(source).toContain("sender.send('hydro-agent:event', payload)")
    expect(source).toContain("sender.send('hydro-agent:command-request'")
    expect(source).toContain("path.join(app.getPath('userData'), 'embedded-apps', safeAppId, 'workspace')")
    expect(source).toContain('defaultCwd: client.defaultCwd')
    expect(source).toContain(': normalizedClient.defaultCwd')
  })

  it('prioritizes embedded hydrology workflow semantics over scheduled-task semantics in prompt guidance', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/managers/embedded-app-capability-query-options.js'), 'utf-8')

    expect(source).toContain('审核任务状态')
    expect(source).toContain('hydrology-workbench specifically')
    expect(source).toContain('prefer context_get and command_execute')
    expect(source).toContain('command_execute with refresh')
    expect(source).toContain('Only use hydrodesktop scheduled-task tools when the user explicitly asks about 定时任务, 计划任务, schedule, cron')
    expect(source).toContain('hydrology_current_station_get')
    expect(source).toContain('hydrology_tab_open')
    expect(source).toContain('hydrology_review_board_open')
    expect(source).toContain('HYDROLOGY_WORKBENCH_DISALLOWED_TOOLS')
    expect(source).toContain('do not inspect the workspace with Bash, Glob, Grep, LS, or Read')
  })

  it('defines an independent hydrology domain MCP capability layer', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../../src/main/managers/hydrology-capability-query-options.js'), 'utf-8')

    expect(source).toContain("const HYDROLOGY_SERVER_NAME = 'hydrology'")
    expect(source).toContain('station_list')
    expect(source).toContain('station_get')
    expect(source).toContain('realtime_slots_list')
    expect(source).toContain('realtime_slot_get')
    expect(source).toContain('realtime_trend_list')
    expect(source).toContain('realtime_demo_seed')
    expect(source).toContain('review_tasks_list')
    expect(source).toContain('review_latest_run_summary_get')
    expect(source).toContain('quality_check_run')
    expect(source).toContain('Use embeddedapp tools for current UI state')
    expect(source).toContain('Use hydrology tools for real business entities')
  })
})
