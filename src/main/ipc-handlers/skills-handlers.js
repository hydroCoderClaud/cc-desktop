/**
 * Skills IPC Handlers
 * Skills CRUD + 导入导出 + 市场安装
 */

const { SkillsManager } = require('../managers')
const { fetchRegistryIndex } = require('../utils/http-client')
const { openComponentFolder } = require('../utils/component-utils')

function setupSkillsHandlers(ipcMain, configManager) {
  const skillsManager = new SkillsManager()

  // ========================================
  // Skills CRUD
  // ========================================

  // 获取官方全局 Skills
  ipcMain.handle('skills:listGlobal', async () => {
    try {
      return await skillsManager.getOfficialSkills()
    } catch (err) {
      console.error('[IPC] skills:listGlobal error:', err)
      return []
    }
  })

  // 获取项目级 Skills
  ipcMain.handle('skills:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return await skillsManager.getProjectSkills(projectPath)
    } catch (err) {
      console.error('[IPC] skills:listProject error:', err)
      return []
    }
  })

  // 获取所有 Skills (全局 + 项目级)
  ipcMain.handle('skills:listAll', async (event, projectPath) => {
    try {
      return await skillsManager.getAllSkills(projectPath || null)
    } catch (err) {
      console.error('[IPC] skills:listAll error:', err)
      return { official: [], user: [], project: [], all: [] }
    }
  })

  // 删除 Skill
  ipcMain.handle('skills:delete', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.deleteSkill(params)
    } catch (err) {
      console.error('[IPC] skills:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // 复制 Skill (升级到全局 / 复制到项目)
  ipcMain.handle('skills:copy', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.copySkill(params)
    } catch (err) {
      console.error('[IPC] skills:copy error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取 Skill 原始内容（完整 SKILL.md）
  ipcMain.handle('skills:getRawContent', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.getSkillRawContent(params)
    } catch (err) {
      console.error('[IPC] skills:getRawContent error:', err)
      return { success: false, error: err.message }
    }
  })

  // 创建 Skill（原始内容模式）
  ipcMain.handle('skills:createRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.createSkillRaw(params)
    } catch (err) {
      console.error('[IPC] skills:createRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 Skill（原始内容模式）
  ipcMain.handle('skills:updateRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.updateSkillRaw(params)
    } catch (err) {
      console.error('[IPC] skills:updateRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 打开 Skills 文件夹
  ipcMain.handle('skills:openFolder', async (event, params) => {
    try {
      const { source, projectPath } = params || {}
      return await openComponentFolder(source, projectPath, 'skills')
    } catch (err) {
      console.error('[IPC] skills:openFolder error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // 导入导出
  // ========================================

  // 校验导入源
  ipcMain.handle('skills:validateImport', async (event, sourcePath) => {
    try {
      if (!sourcePath || typeof sourcePath !== 'string') {
        return { valid: false, errors: ['Invalid source path'] }
      }
      return await skillsManager.validateImportSource(sourcePath)
    } catch (err) {
      console.error('[IPC] skills:validateImport error:', err)
      return { valid: false, errors: [err.message] }
    }
  })

  // 检测导入冲突
  ipcMain.handle('skills:checkConflicts', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { conflicts: [] }
      }
      return skillsManager.checkImportConflicts(params)
    } catch (err) {
      console.error('[IPC] skills:checkConflicts error:', err)
      return { conflicts: [] }
    }
  })

  // 导入 Skills
  ipcMain.handle('skills:import', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, errors: ['Invalid parameters'] }
      }
      return await skillsManager.importSkills(params)
    } catch (err) {
      console.error('[IPC] skills:import error:', err)
      return { success: false, errors: [err.message] }
    }
  })

  // 导出单个 Skill
  ipcMain.handle('skills:export', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await skillsManager.exportSkill(params)
    } catch (err) {
      console.error('[IPC] skills:export error:', err)
      return { success: false, error: err.message }
    }
  })

  // 批量导出 Skills
  ipcMain.handle('skills:exportBatch', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = await skillsManager.exportSkillsBatch(params)
      // 确保返回纯 JSON 对象，避免 IPC 序列化问题
      return JSON.parse(JSON.stringify(result))
    } catch (err) {
      console.error('[IPC] skills:exportBatch error:', err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // ========================================
  // Skills 市场
  // ========================================

  // 获取注册表索引
  ipcMain.handle('skills:market:fetchIndex', async (event, registryUrl) => {
    try {
      if (!registryUrl || typeof registryUrl !== 'string') {
        return { success: false, error: 'Invalid registry URL' }
      }
      const mirrorUrl = configManager.getMarketConfig()?.registryMirrorUrl
      return await fetchRegistryIndex(registryUrl, mirrorUrl)
    } catch (err) {
      console.error('[IPC] skills:market:fetchIndex error:', err)
      return { success: false, error: err.message }
    }
  })

  // 安装市场 Skill
  ipcMain.handle('skills:market:install', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await skillsManager.installMarketSkill(params)
    } catch (err) {
      console.error('[IPC] skills:market:install error:', err)
      return { success: false, error: err.message }
    }
  })

  // 强制覆盖安装市场 Skill
  ipcMain.handle('skills:market:installForce', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await skillsManager.installMarketSkillForce(params)
    } catch (err) {
      console.error('[IPC] skills:market:installForce error:', err)
      return { success: false, error: err.message }
    }
  })

  // 检查市场 Skills 更新
  ipcMain.handle('skills:market:checkUpdates', async (event, registryUrl) => {
    try {
      if (!registryUrl || typeof registryUrl !== 'string') {
        return { success: false, error: 'Invalid registry URL' }
      }
      const mirrorUrl = configManager.getMarketConfig()?.registryMirrorUrl
      return await skillsManager.checkMarketUpdates(registryUrl, mirrorUrl)
    } catch (err) {
      console.error('[IPC] skills:market:checkUpdates error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新市场 Skill
  ipcMain.handle('skills:market:update', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      params.mirrorUrl = params.mirrorUrl || configManager.getMarketConfig()?.registryMirrorUrl
      return await skillsManager.updateMarketSkill(params)
    } catch (err) {
      console.error('[IPC] skills:market:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取已安装的市场 Skills
  ipcMain.handle('skills:market:installed', async () => {
    try {
      return skillsManager.getMarketInstalledSkills()
    } catch (err) {
      console.error('[IPC] skills:market:installed error:', err)
      return []
    }
  })

  console.log('[IPC] Skills handlers registered')
}

module.exports = { setupSkillsHandlers }