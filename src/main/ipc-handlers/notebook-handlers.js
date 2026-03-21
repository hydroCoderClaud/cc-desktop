/**
 * IPC handlers for Notebook management
 */

const { ipcMain } = require('electron')

/**
 * @param {import('electron').IpcMain} _ipcMain
 * @param {import('../managers/notebook-manager').NotebookManager} notebookManager
 */
function setupNotebookHandlers(_ipcMain, notebookManager) {
  // ─── Notebook CRUD ────────────────────────────────────────────────────────

  ipcMain.handle('notebook:list', async () => {
    try {
      return notebookManager.list()
    } catch (err) {
      console.error('[IPC] notebook:list error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:get', async (_e, id) => {
    try {
      return notebookManager.get(id)
    } catch (err) {
      console.error('[IPC] notebook:get error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:create', async (_e, options) => {
    try {
      return notebookManager.create(options)
    } catch (err) {
      console.error('[IPC] notebook:create error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:rename', async (_e, { id, name }) => {
    try {
      return notebookManager.rename(id, name)
    } catch (err) {
      console.error('[IPC] notebook:rename error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:delete', async (_e, id) => {
    try {
      return await notebookManager.delete(id)
    } catch (err) {
      console.error('[IPC] notebook:delete error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:bindSession', async (_e, { id, sessionId }) => {
    try {
      return notebookManager.bindSession(id, sessionId)
    } catch (err) {
      console.error('[IPC] notebook:bindSession error:', err)
      throw err
    }
  })

  // ─── Sources ──────────────────────────────────────────────────────────────

  ipcMain.handle('notebook:listSources', async (_e, notebookId) => {
    try {
      return notebookManager.listSources(notebookId)
    } catch (err) {
      console.error('[IPC] notebook:listSources error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:addSource', async (_e, { notebookId, sourceData }) => {
    try {
      return notebookManager.addSource(notebookId, sourceData)
    } catch (err) {
      console.error('[IPC] notebook:addSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:importFiles', async (_e, { notebookId, filePaths }) => {
    try {
      return await notebookManager.importFiles(notebookId, filePaths)
    } catch (err) {
      console.error('[IPC] notebook:importFiles error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:updateSource', async (_e, { notebookId, sourceId, updates }) => {
    try {
      return notebookManager.updateSource(notebookId, sourceId, updates)
    } catch (err) {
      console.error('[IPC] notebook:updateSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:deleteSource', async (_e, { notebookId, sourceId }) => {
    try {
      return notebookManager.deleteSource(notebookId, sourceId)
    } catch (err) {
      console.error('[IPC] notebook:deleteSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:deleteSources', async (_e, { notebookId, sourceIds }) => {
    try {
      return notebookManager.deleteSources(notebookId, sourceIds)
    } catch (err) {
      console.error('[IPC] notebook:deleteSources error:', err)
      throw err
    }
  })

  // ─── Achievements ─────────────────────────────────────────────────────────

  ipcMain.handle('notebook:listAchievements', async (_e, notebookId) => {
    try {
      return notebookManager.listAchievements(notebookId)
    } catch (err) {
      console.error('[IPC] notebook:listAchievements error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:addAchievement', async (_e, { notebookId, achievementData }) => {
    try {
      return notebookManager.addAchievement(notebookId, achievementData)
    } catch (err) {
      console.error('[IPC] notebook:addAchievement error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:updateAchievement', async (_e, { notebookId, achievementId, updates }) => {
    try {
      return notebookManager.updateAchievement(notebookId, achievementId, updates)
    } catch (err) {
      console.error('[IPC] notebook:updateAchievement error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:deleteAchievement', async (_e, { notebookId, achievementId }) => {
    try {
      return notebookManager.deleteAchievement(notebookId, achievementId)
    } catch (err) {
      console.error('[IPC] notebook:deleteAchievement error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:deleteAchievements', async (_e, { notebookId, achievementIds }) => {
    try {
      return notebookManager.deleteAchievements(notebookId, achievementIds)
    } catch (err) {
      console.error('[IPC] notebook:deleteAchievements error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:readFileContent', async (_e, { notebookId, relPath }) => {
    try {
      return await notebookManager.readFileContent(notebookId, relPath)
    } catch (err) {
      console.error('[IPC] notebook:readFileContent error:', err)
      throw err
    }
  })
}

module.exports = { setupNotebookHandlers }
