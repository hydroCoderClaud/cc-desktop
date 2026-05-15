import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const preloadPath = path.resolve(__dirname, '../../src/preload/preload.js')
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')
const hydrologyHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers/hydrology-handlers.js')

describe('hydrology backend wiring', () => {
  it('exposes hydrology station APIs in preload', () => {
    const source = fs.readFileSync(preloadPath, 'utf-8')

    expect(source).toContain("listHydrologyStations: () => ipcRenderer.invoke('hydrology:station:list')")
    expect(source).toContain("getHydrologyStation: (stationId) => ipcRenderer.invoke('hydrology:station:get', stationId)")
    expect(source).toContain("saveHydrologyStation: (payload) => ipcRenderer.invoke('hydrology:station:save', payload)")
    expect(source).toContain("deleteHydrologyStation: (stationId) => ipcRenderer.invoke('hydrology:station:delete', stationId)")
    expect(source).toContain("seedHydrologyRealtimeData: (stationId) => ipcRenderer.invoke('hydrology:realtime:seed', stationId)")
    expect(source).toContain("listHydrologyRealtimeSlots: (filters) => ipcRenderer.invoke('hydrology:realtime:listSlots', filters)")
    expect(source).toContain("getHydrologyRealtimeSlotDetail: (slotId) => ipcRenderer.invoke('hydrology:realtime:getSlotDetail', slotId)")
    expect(source).toContain("listHydrologyRealtimeTrend: (filters) => ipcRenderer.invoke('hydrology:realtime:trend', filters)")
    expect(source).toContain("applyHydrologyRealtimeCorrection: (payload) => ipcRenderer.invoke('hydrology:realtime:applyCorrection', payload)")
    expect(source).toContain("listHydrologyReviewTasks: (filters) => ipcRenderer.invoke('hydrology:review:listTasks', filters)")
    expect(source).toContain("resolveHydrologyReviewTask: ({ taskId, payload }) => ipcRenderer.invoke('hydrology:review:resolveTask', { taskId, payload })")
  })

  it('registers hydrology station ipc routes in dedicated handlers', () => {
    const source = fs.readFileSync(hydrologyHandlersPath, 'utf-8')

    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:station:list'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:station:get'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:station:save'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:station:delete'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:realtime:seed'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:realtime:listSlots'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:realtime:getSlotDetail'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:realtime:trend'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:realtime:applyCorrection'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:review:listTasks'")
    expect(source).toContain("createIPCHandler(ipcMain, 'hydrology:review:resolveTask'")
  })

  it('boots hydrology database and service from main ipc setup', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("safeRequire('./hydrology/hydrology-database', 'hydrology-database')")
    expect(source).toContain("safeRequire('./hydrology/station-service', 'station-service')")
    expect(source).toContain("safeRequire('./hydrology/realtime-service', 'realtime-service')")
    expect(source).toContain("safeRequire('./hydrology/realtime-demo-seeder', 'realtime-demo-seeder')")
    expect(source).toContain("safeRequire('./hydrology/review-task-service', 'review-task-service')")
    expect(source).toContain('const hydrologyDatabase = HydrologyDatabase ? new HydrologyDatabase() : null')
    expect(source).toContain('const reviewTaskService = hydrologyDatabase && ReviewTaskService')
    expect(source).toContain('const realtimeService = hydrologyDatabase && RealtimeService')
    expect(source).toContain("new RealtimeService(hydrologyDatabase, { reviewTaskService })")
    expect(source).toContain('const realtimeDemoSeeder = realtimeService && RealtimeDemoSeeder')
    expect(source).toContain('setupHydrologyHandlers(ipcMain, {')
    expect(source).toContain('stationService,')
    expect(source).toContain('realtimeService')
    expect(source).toContain('realtimeDemoSeeder')
    expect(source).toContain('reviewTaskService')
  })
})
