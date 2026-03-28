/**
 * IPC handlers for Notebook management
 */

const { ipcMain, clipboard, nativeImage } = require('electron')
const { MAX_IMG_SIZE } = require('../utils/agent-constants')

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
      // 仅在“打开笔记本”入口执行一致性清理
      return notebookManager.get(id, { sanitizeOnOpen: true })
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

  // 重启会话（/clear 命令）
  ipcMain.handle('notebook:restartSession', async (_e, id) => {
    try {
      return await notebookManager.restartSession(id)
    } catch (err) {
      console.error('[IPC] notebook:restartSession error:', err)
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

  ipcMain.handle('notebook:addAchievementToSource', async (_e, { notebookId, achievementId }) => {
    try {
      return await notebookManager.addAchievementToSource(notebookId, achievementId)
    } catch (err) {
      console.error('[IPC] notebook:addAchievementToSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:exportAchievement', async (_e, { notebookId, achievementId, targetDir }) => {
    try {
      return notebookManager.exportAchievement(notebookId, achievementId, targetDir)
    } catch (err) {
      console.error('[IPC] notebook:exportAchievement error:', err)
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

  ipcMain.handle('notebook:writeFileContent', async (_e, { notebookId, relPath, content }) => {
    try {
      return await notebookManager.writeFileContent(notebookId, relPath, content)
    } catch (err) {
      console.error('[IPC] notebook:writeFileContent error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:copyImageToClipboard', async (_e, { dataUrl }) => {
    try {
      if (!dataUrl || typeof dataUrl !== 'string') {
        throw new Error('图片数据不能为空')
      }
      if (!/^data:image\/(png|jpeg|jpg|gif|webp|bmp|ico|x-icon|vnd\.microsoft\.icon|svg\+xml);base64,/i.test(dataUrl)) {
        throw new Error('仅支持复制图片内容')
      }
      const normalizedDataUrl = /^data:image\/svg\+xml;base64,/i.test(dataUrl)
        ? await rasterizeSvgDataUrl(dataUrl)
        : dataUrl
      const base64 = normalizedDataUrl.replace(/^data:image\/[a-z0-9.+-]+;base64,/i, '')
      const estimatedBytes = Math.floor((base64.length * 3) / 4)
      if (estimatedBytes > MAX_IMG_SIZE) {
        throw new Error('图片体积超出限制')
      }
      const image = nativeImage.createFromDataURL(normalizedDataUrl)
      if (image.isEmpty()) {
        throw new Error('无效的图片数据')
      }
      clipboard.writeImage(image)
      return { success: true }
    } catch (err) {
      console.error('[IPC] notebook:copyImageToClipboard error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:saveChatImageToSource', async (_e, { notebookId, filename, dataUrl }) => {
    try {
      return await notebookManager.saveChatImageToSource(notebookId, { filename, dataUrl })
    } catch (err) {
      console.error('[IPC] notebook:saveChatImageToSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:saveChatImageToAchievement', async (_e, { notebookId, filename, dataUrl, sourceIds }) => {
    try {
      return await notebookManager.saveChatImageToAchievement(notebookId, { filename, dataUrl, sourceIds })
    } catch (err) {
      console.error('[IPC] notebook:saveChatImageToAchievement error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:saveChatMarkdownToSource', async (_e, { notebookId, filename, content }) => {
    try {
      return notebookManager.saveChatMarkdownToSource(notebookId, { filename, content })
    } catch (err) {
      console.error('[IPC] notebook:saveChatMarkdownToSource error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:saveChatMarkdownToAchievement', async (_e, { notebookId, filename, content, sourceIds }) => {
    try {
      return notebookManager.saveChatMarkdownToAchievement(notebookId, { filename, content, sourceIds })
    } catch (err) {
      console.error('[IPC] notebook:saveChatMarkdownToAchievement error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:setCopySourceFiles', async (_e, { notebookId, value }) => {
    try {
      return notebookManager.setCopySourceFiles(notebookId, value)
    } catch (err) {
      console.error('[IPC] notebook:setCopySourceFiles error:', err)
      throw err
    }
  })

  // ─── Tools (Scenario Tools) ────────────────────────────────────────────────
  ipcMain.handle('notebook:listTools', async () => {
    try {
      return notebookManager.listTools()
    } catch (err) {
      console.error('[IPC] notebook:listTools error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:updateTool', async (_e, { toolId, updates }) => {
    try {
      return notebookManager.updateTool(toolId, updates)
    } catch (err) {
      console.error('[IPC] notebook:updateTool error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:addTool', async (_e, toolData) => {
    try {
      return notebookManager.addTool(toolData)
    } catch (err) {
      console.error('[IPC] notebook:addTool error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:deleteTool', async (_e, toolId) => {
    try {
      return notebookManager.deleteTool(toolId)
    } catch (err) {
      console.error('[IPC] notebook:deleteTool error:', err)
      throw err
    }
  })

  ipcMain.handle('notebook:fetchRemoteTools', async () => {
    try {
      const config = notebookManager.configManager.getConfig()
      const registryUrl = config.market?.registryUrl
      const mirrorUrl = config.market?.registryMirrorUrl
      if (!registryUrl) return { success: false, error: '未配置市场源' }

      const { httpGet, httpGetWithMirror } = require('../utils/http-client')
      const baseUrl = registryUrl.replace(/\/+$/, '')
      const url = `${baseUrl}/notebook-tools.json?t=${Date.now()}`
      
      const body = mirrorUrl 
        ? await httpGetWithMirror(url, baseUrl, mirrorUrl)
        : await httpGet(url)
      
      // 清理可能存在的 BOM 字符和前后空格，防止解析失败
      const cleanBody = body.trim().replace(/^\uFEFF/, '')
      return { success: true, data: JSON.parse(cleanBody) }
    } catch (err) {
      console.error('[IPC] notebook:fetchRemoteTools error:', err)
      return { success: false, error: err.message }
    }
  })

  // ─── Generation ─────────────────────────────────────────────────────────
  ipcMain.handle('notebook:prepareGeneration', async (_e, { notebookId, toolId, sourceIds }) => {
    try {
      return notebookManager.prepareGeneration(notebookId, toolId, sourceIds)
    } catch (err) {
      console.error('[IPC] notebook:prepareGeneration error:', err)
      throw err
    }
  })

  // ─── Install / Uninstall ──────────────────────────────────────────────────
  ipcMain.handle('notebook:installTool', async (_e, { tool, options } = {}) => {
    try {
      return await notebookManager.installTool(tool, options)
    } catch (err) {
      console.error('[IPC] notebook:installTool error:', err)
      return { success: false, error: err.message }
    }
  })

  ipcMain.handle('notebook:uninstallTool', async (_e, toolId) => {
    try {
      return notebookManager.uninstallTool(toolId)
    } catch (err) {
      console.error('[IPC] notebook:uninstallTool error:', err)
      return { success: false, error: err.message }
    }
  })
}

async function rasterizeSvgDataUrl(dataUrl) {
  const svgBuffer = Buffer.from(dataUrl.replace(/^data:image\/svg\+xml;base64,/i, ''), 'base64')
  const svgImage = nativeImage.createFromBuffer(svgBuffer)
  if (svgImage.isEmpty()) {
    throw new Error('SVG 图片转换失败')
  }
  return svgImage.toDataURL()
}

module.exports = { setupNotebookHandlers }
