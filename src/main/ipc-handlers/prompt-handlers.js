/**
 * IPC Handlers for Prompt Management
 */

const { ipcMain } = require('electron')

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
}

module.exports = { registerPromptHandlers }
