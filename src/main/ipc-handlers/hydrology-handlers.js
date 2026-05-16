const { createIPCHandler } = require('../utils/ipc-utils')

function setupHydrologyHandlers(ipcMain, services = {}) {
  const { stationService, realtimeService, realtimeDemoSeeder, reviewTaskService, qualityCheckService } = services
  if (!stationService) {
    console.warn('[IPC] StationService not available, skipping hydrology handlers')
    return
  }

  createIPCHandler(ipcMain, 'hydrology:station:list', async () => {
    return stationService.listStations()
  })

  createIPCHandler(ipcMain, 'hydrology:station:get', async (stationId) => {
    return stationService.getStation(stationId)
  })

  createIPCHandler(ipcMain, 'hydrology:station:save', async (payload) => {
    return stationService.saveStation(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:station:delete', async (stationId) => {
    return stationService.deleteStation(stationId)
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:seed', async (stationId) => {
    if (!realtimeDemoSeeder) {
      throw new Error('RealtimeDemoSeeder not available')
    }
    const station = stationService.getStation(stationId)
    if (!station) {
      throw new Error('站点不存在')
    }
    return realtimeDemoSeeder.seedStationObservations(station)
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:listSlots', async (filters = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.listRealtimeSlots(filters || {})
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:getSlotDetail', async (slotId) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.getRealtimeSlotDetail(slotId)
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:trend', async (filters = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.listRealtimeTrend(filters || {})
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:applyCorrection', async (payload = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.applyCorrection(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:createObservation', async (payload = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.saveObservation(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:updateObservation', async (payload = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.updateObservation(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:deleteObservation', async (observationId) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.deleteObservation(observationId)
  })

  createIPCHandler(ipcMain, 'hydrology:realtime:deleteSlotObservations', async (payload = {}) => {
    if (!realtimeService) {
      throw new Error('RealtimeService not available')
    }
    return realtimeService.deleteSlotObservations(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:review:listTasks', async (filters = {}) => {
    if (!reviewTaskService) {
      throw new Error('ReviewTaskService not available')
    }
    return reviewTaskService.listReviewTasks(filters || {})
  })

  createIPCHandler(ipcMain, 'hydrology:review:deleteTask', async (taskId) => {
    if (!reviewTaskService) {
      throw new Error('ReviewTaskService not available')
    }
    return reviewTaskService.deleteReviewTask(taskId)
  })

  createIPCHandler(ipcMain, 'hydrology:review:deleteTasks', async (taskIds = []) => {
    if (!reviewTaskService) {
      throw new Error('ReviewTaskService not available')
    }
    return reviewTaskService.deleteReviewTasks(taskIds)
  })

  createIPCHandler(ipcMain, 'hydrology:review:resolveTask', async ({ taskId, payload } = {}) => {
    if (!reviewTaskService) {
      throw new Error('ReviewTaskService not available')
    }
    return reviewTaskService.resolveReviewTask(taskId, payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:review:runQualityCheck', async (payload = {}) => {
    if (!qualityCheckService) {
      throw new Error('QualityCheckService not available')
    }
    return qualityCheckService.runStationQualityCheck(payload || {})
  })

  createIPCHandler(ipcMain, 'hydrology:review:getLatestRunSummary', async (filters = {}) => {
    if (!qualityCheckService) {
      throw new Error('QualityCheckService not available')
    }
    return qualityCheckService.getLatestRunSummary(filters || {})
  })
}

module.exports = { setupHydrologyHandlers }
