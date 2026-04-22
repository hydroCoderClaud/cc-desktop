/**
 * Scheduled Task IPC Handlers
 */

function setupScheduledTaskHandlers(ipcMain, scheduledTaskService) {
  if (!scheduledTaskService) {
    console.warn('[IPC] ScheduledTaskService not available, skipping scheduled task handlers')
    return
  }

  ipcMain.handle('scheduled-task:list', async () => {
    try {
      return scheduledTaskService.listTasks()
    } catch (err) {
      console.error('[IPC] scheduled-task:list error:', err)
      return []
    }
  })

  ipcMain.handle('scheduled-task:create', async (_event, task) => {
    try {
      return scheduledTaskService.createTask(task)
    } catch (err) {
      console.error('[IPC] scheduled-task:create error:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('scheduled-task:update', async (_event, { taskId, updates }) => {
    try {
      return scheduledTaskService.updateTask(taskId, updates)
    } catch (err) {
      console.error('[IPC] scheduled-task:update error:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('scheduled-task:delete', async (_event, taskId) => {
    try {
      return scheduledTaskService.deleteTask(taskId)
    } catch (err) {
      console.error('[IPC] scheduled-task:delete error:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('scheduled-task:runNow', async (_event, taskId) => {
    try {
      return await scheduledTaskService.runTaskNow(taskId)
    } catch (err) {
      console.error('[IPC] scheduled-task:runNow error:', err)
      return { error: err.message }
    }
  })

  ipcMain.handle('scheduled-task:listRuns', async (_event, { taskId, limit }) => {
    try {
      return scheduledTaskService.getTaskRuns(taskId, limit || 20)
    } catch (err) {
      console.error('[IPC] scheduled-task:listRuns error:', err)
      return []
    }
  })
}

module.exports = {
  setupScheduledTaskHandlers
}
