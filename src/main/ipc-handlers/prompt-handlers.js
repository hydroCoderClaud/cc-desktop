/**
 * IPC Handlers for Prompt Management
 */

const { ipcMain } = require('electron')
const { httpGet, classifyHttpError } = require('../utils/http-client')

/**
 * Register prompt-related IPC handlers
 * @param {SessionDatabase} sessionDB - Database instance
 */
function registerPromptHandlers(sessionDB) {
  // ========================================
  // Prompt CRUD Operations
  // ========================================

  /**
   * Get all prompts with optional filters
   * @param {Object} options - { scope: 'global'|'project'|'all', projectId, tagIds }
   */
  ipcMain.handle('prompts:list', async (event, options = {}) => {
    try {
      return sessionDB.getPrompts(options)
    } catch (error) {
      console.error('[IPC] prompts:list error:', error)
      throw error
    }
  })

  /**
   * Get prompt by ID
   */
  ipcMain.handle('prompts:get', async (event, promptId) => {
    try {
      return sessionDB.getPromptById(promptId)
    } catch (error) {
      console.error('[IPC] prompts:get error:', error)
      throw error
    }
  })

  /**
   * Create a new prompt
   * @param {Object} promptData - { name, content, scope, project_id, tagIds }
   */
  ipcMain.handle('prompts:create', async (event, promptData) => {
    try {
      return sessionDB.createPrompt(promptData)
    } catch (error) {
      console.error('[IPC] prompts:create error:', error)
      throw error
    }
  })

  /**
   * Update an existing prompt
   * @param {number} promptId
   * @param {Object} updates - { name, content, scope, project_id, is_favorite, tagIds }
   */
  ipcMain.handle('prompts:update', async (event, promptId, updates) => {
    try {
      return sessionDB.updatePrompt(promptId, updates)
    } catch (error) {
      console.error('[IPC] prompts:update error:', error)
      throw error
    }
  })

  /**
   * Delete a prompt
   */
  ipcMain.handle('prompts:delete', async (event, promptId) => {
    try {
      return sessionDB.deletePrompt(promptId)
    } catch (error) {
      console.error('[IPC] prompts:delete error:', error)
      throw error
    }
  })

  /**
   * Increment prompt usage count
   */
  ipcMain.handle('prompts:incrementUsage', async (event, promptId) => {
    try {
      sessionDB.incrementPromptUsage(promptId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] prompts:incrementUsage error:', error)
      throw error
    }
  })

  /**
   * Toggle prompt favorite status
   */
  ipcMain.handle('prompts:toggleFavorite', async (event, promptId) => {
    try {
      return sessionDB.togglePromptFavorite(promptId)
    } catch (error) {
      console.error('[IPC] prompts:toggleFavorite error:', error)
      throw error
    }
  })

  // ========================================
  // Prompt Tag Operations
  // ========================================

  /**
   * Get all prompt tags
   */
  ipcMain.handle('promptTags:list', async (event) => {
    try {
      return sessionDB.getAllPromptTags()
    } catch (error) {
      console.error('[IPC] promptTags:list error:', error)
      throw error
    }
  })

  /**
   * Create a new prompt tag
   * @param {string} name
   * @param {string} color
   */
  ipcMain.handle('promptTags:create', async (event, name, color) => {
    try {
      return sessionDB.createPromptTag(name, color)
    } catch (error) {
      console.error('[IPC] promptTags:create error:', error)
      throw error
    }
  })

  /**
   * Update a prompt tag
   */
  ipcMain.handle('promptTags:update', async (event, tagId, updates) => {
    try {
      return sessionDB.updatePromptTag(tagId, updates)
    } catch (error) {
      console.error('[IPC] promptTags:update error:', error)
      throw error
    }
  })

  /**
   * Delete a prompt tag
   */
  ipcMain.handle('promptTags:delete', async (event, tagId) => {
    try {
      return sessionDB.deletePromptTag(tagId)
    } catch (error) {
      console.error('[IPC] promptTags:delete error:', error)
      throw error
    }
  })

  /**
   * Add tag to prompt
   */
  ipcMain.handle('prompts:addTag', async (event, promptId, tagId) => {
    try {
      sessionDB.addTagToPrompt(promptId, tagId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] prompts:addTag error:', error)
      throw error
    }
  })

  /**
   * Remove tag from prompt
   */
  ipcMain.handle('prompts:removeTag', async (event, promptId, tagId) => {
    try {
      sessionDB.removeTagFromPrompt(promptId, tagId)
      return { success: true }
    } catch (error) {
      console.error('[IPC] prompts:removeTag error:', error)
      throw error
    }
  })

  // ========================================
  // Prompts 市场 IPC Handlers
  // ========================================

  /**
   * 安装市场 Prompt
   * IPC 层负责 HTTP 下载 .md 内容，再传给 DB 层安装
   */
  ipcMain.handle('prompts:market:install', async (event, { registryUrl, prompt }) => {
    try {
      if (!registryUrl || !prompt || !prompt.id) {
        return { success: false, error: '参数不完整' }
      }

      const baseUrl = registryUrl.replace(/\/+$/, '')
      const file = prompt.file || `${prompt.id}.md`
      const fileUrl = `${baseUrl}/prompts/${file}`

      console.log(`[IPC] prompts:market:install downloading: ${fileUrl}`)
      const content = await httpGet(fileUrl)

      if (!content || content.trim().length === 0) {
        return { success: false, error: 'Prompt 文件内容为空' }
      }

      return sessionDB.installMarketPrompt({
        marketId: prompt.id,
        registryUrl: baseUrl,
        version: prompt.version || '0.0.0',
        name: prompt.name || prompt.id,
        content: content.trim()
      })
    } catch (err) {
      console.error('[IPC] prompts:market:install error:', err)
      return { success: false, error: classifyHttpError(err) }
    }
  })

  /**
   * 强制覆盖安装市场 Prompt
   */
  ipcMain.handle('prompts:market:installForce', async (event, { registryUrl, prompt }) => {
    try {
      if (!registryUrl || !prompt || !prompt.id) {
        return { success: false, error: '参数不完整' }
      }

      const baseUrl = registryUrl.replace(/\/+$/, '')
      const file = prompt.file || `${prompt.id}.md`
      const fileUrl = `${baseUrl}/prompts/${file}`

      const content = await httpGet(fileUrl)
      if (!content || content.trim().length === 0) {
        return { success: false, error: 'Prompt 文件内容为空' }
      }

      return sessionDB.installMarketPromptForce({
        marketId: prompt.id,
        registryUrl: baseUrl,
        version: prompt.version || '0.0.0',
        name: prompt.name || prompt.id,
        content: content.trim()
      })
    } catch (err) {
      console.error('[IPC] prompts:market:installForce error:', err)
      return { success: false, error: classifyHttpError(err) }
    }
  })

  /**
   * 获取已安装的市场 Prompts
   */
  ipcMain.handle('prompts:market:installed', async () => {
    try {
      return sessionDB.getMarketInstalledPrompts()
    } catch (err) {
      console.error('[IPC] prompts:market:installed error:', err)
      return []
    }
  })

  /**
   * 更新市场 Prompt（删除旧的 → 重新安装）
   */
  ipcMain.handle('prompts:market:update', async (event, { registryUrl, prompt }) => {
    try {
      if (!registryUrl || !prompt || !prompt.id) {
        return { success: false, error: '参数不完整' }
      }

      const baseUrl = registryUrl.replace(/\/+$/, '')
      const file = prompt.file || `${prompt.id}.md`
      const fileUrl = `${baseUrl}/prompts/${file}`

      const content = await httpGet(fileUrl)
      if (!content || content.trim().length === 0) {
        return { success: false, error: 'Prompt 文件内容为空' }
      }

      return sessionDB.installMarketPromptForce({
        marketId: prompt.id,
        registryUrl: baseUrl,
        version: prompt.version || '0.0.0',
        name: prompt.name || prompt.id,
        content: content.trim()
      })
    } catch (err) {
      console.error('[IPC] prompts:market:update error:', err)
      return { success: false, error: classifyHttpError(err) }
    }
  })
}

module.exports = { registerPromptHandlers }
