/**
 * Plugin Management IPC Handlers
 * 处理插件管理相关的 IPC 通信
 */

const { PluginManager } = require('../plugin-manager')
const {
  SkillsManager,
  AgentsManager,
  HooksManager,
  McpManager
} = require('../managers')
const { shell } = require('electron')

function setupPluginHandlers(ipcMain) {
  const pluginManager = new PluginManager()
  const skillsManager = new SkillsManager()
  const agentsManager = new AgentsManager()
  const hooksManager = new HooksManager()
  const mcpManager = new McpManager()

  // 获取插件列表
  ipcMain.handle('plugins:list', async () => {
    try {
      return await pluginManager.listPlugins()
    } catch (err) {
      console.error('[IPC] plugins:list error:', err)
      return []
    }
  })

  // 获取插件详情（含组件）
  ipcMain.handle('plugins:details', async (event, pluginId) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return null
      }
      return await pluginManager.getPluginDetails(pluginId)
    } catch (err) {
      console.error('[IPC] plugins:details error:', err)
      return null
    }
  })

  // 设置插件启用/禁用
  ipcMain.handle('plugins:setEnabled', async (event, pluginId, enabled) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return false
      }
      return await pluginManager.setPluginEnabled(pluginId, !!enabled)
    } catch (err) {
      console.error('[IPC] plugins:setEnabled error:', err)
      return false
    }
  })

  // 打开插件目录
  ipcMain.handle('plugins:openFolder', async () => {
    try {
      return await pluginManager.openPluginsFolder()
    } catch (err) {
      console.error('[IPC] plugins:openFolder error:', err)
      return false
    }
  })

  // 删除插件
  ipcMain.handle('plugins:delete', async (event, pluginId, deleteFiles = true) => {
    try {
      if (!pluginId || typeof pluginId !== 'string') {
        return { success: false, error: 'Invalid plugin ID' }
      }
      return await pluginManager.deletePlugin(pluginId, !!deleteFiles)
    } catch (err) {
      console.error('[IPC] plugins:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // Skills Manager IPC Handlers
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
      let folderPath

      if (source === 'user') {
        // ~/.claude/skills/
        const os = require('os')
        const path = require('path')
        folderPath = path.join(os.homedir(), '.claude', 'skills')
      } else if (source === 'project' && projectPath) {
        // {project}/.claude/skills/
        const path = require('path')
        folderPath = path.join(projectPath, '.claude', 'skills')
      } else {
        return { success: false, error: 'Invalid source' }
      }

      // 确保目录存在
      const fs = require('fs')
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
      }

      const result = await shell.openPath(folderPath)
      if (result) {
        return { success: false, error: result }
      }
      return { success: true }
    } catch (err) {
      console.error('[IPC] skills:openFolder error:', err)
      return { success: false, error: err.message }
    }
  })

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
  // Agents Manager IPC Handlers
  // ========================================

  // 获取用户全局 Agents
  ipcMain.handle('agents:listUser', async () => {
    try {
      return await agentsManager.getUserAgents()
    } catch (err) {
      console.error('[IPC] agents:listUser error:', err)
      return []
    }
  })

  // 获取项目级 Agents
  ipcMain.handle('agents:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return await agentsManager.getProjectAgents(projectPath)
    } catch (err) {
      console.error('[IPC] agents:listProject error:', err)
      return []
    }
  })

  // 获取插件级 Agents (只读)
  ipcMain.handle('agents:listPlugin', async () => {
    try {
      return await agentsManager.getPluginAgents()
    } catch (err) {
      console.error('[IPC] agents:listPlugin error:', err)
      return []
    }
  })

  // 获取所有 Agents (三级分类)
  ipcMain.handle('agents:listAll', async (event, projectPath) => {
    try {
      return await agentsManager.getAllAgents(projectPath || null)
    } catch (err) {
      console.error('[IPC] agents:listAll error:', err)
      return { user: [], project: [], plugin: [] }
    }
  })

  // 获取 Agent 原始内容
  ipcMain.handle('agents:getRawContent', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.getAgentRawContent(params)
    } catch (err) {
      console.error('[IPC] agents:getRawContent error:', err)
      return { success: false, error: err.message }
    }
  })

  // 创建 Agent（原始内容模式）
  ipcMain.handle('agents:createRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.createAgentRaw(params)
    } catch (err) {
      console.error('[IPC] agents:createRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 Agent（原始内容模式）
  ipcMain.handle('agents:updateRaw', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.updateAgentRaw(params)
    } catch (err) {
      console.error('[IPC] agents:updateRaw error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 Agent
  ipcMain.handle('agents:delete', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.deleteAgent(params)
    } catch (err) {
      console.error('[IPC] agents:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // 复制 Agent
  ipcMain.handle('agents:copy', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.copyAgent(params)
    } catch (err) {
      console.error('[IPC] agents:copy error:', err)
      return { success: false, error: err.message }
    }
  })

  // 重命名 Agent
  ipcMain.handle('agents:rename', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.renameAgent(params)
    } catch (err) {
      console.error('[IPC] agents:rename error:', err)
      return { success: false, error: err.message }
    }
  })

  // 打开 Agents 文件夹
  ipcMain.handle('agents:openFolder', async (event, params) => {
    try {
      const { source, projectPath } = params || {}
      let folderPath

      if (source === 'user') {
        const os = require('os')
        const path = require('path')
        folderPath = path.join(os.homedir(), '.claude', 'agents')
      } else if (source === 'project' && projectPath) {
        const path = require('path')
        folderPath = path.join(projectPath, '.claude', 'agents')
      } else {
        return { success: false, error: 'Invalid source' }
      }

      // 确保目录存在
      const fs = require('fs')
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true })
      }

      const result = await shell.openPath(folderPath)
      if (result) {
        return { success: false, error: result }
      }
      return { success: true }
    } catch (err) {
      console.error('[IPC] agents:openFolder error:', err)
      return { success: false, error: err.message }
    }
  })

  // 校验导入源
  ipcMain.handle('agents:validateImport', async (event, sourcePath) => {
    try {
      // sourcePath 可以是字符串（单文件/文件夹/ZIP）或字符串数组（多选文件）
      if (!sourcePath || (typeof sourcePath !== 'string' && !Array.isArray(sourcePath))) {
        return { valid: false, errors: ['Invalid source path'] }
      }
      return await agentsManager.validateAgentImportSource(sourcePath)
    } catch (err) {
      console.error('[IPC] agents:validateImport error:', err)
      return { valid: false, errors: [err.message] }
    }
  })

  // 检测导入冲突
  ipcMain.handle('agents:checkConflicts', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { results: [] }
      }
      return await agentsManager.checkAgentImportConflicts(params)
    } catch (err) {
      console.error('[IPC] agents:checkConflicts error:', err)
      return { results: [] }
    }
  })

  // 导入 Agents
  ipcMain.handle('agents:import', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, errors: ['Invalid parameters'] }
      }
      return await agentsManager.importAgents(params)
    } catch (err) {
      console.error('[IPC] agents:import error:', err)
      return { success: false, errors: [err.message] }
    }
  })

  // 导出单个 Agent
  ipcMain.handle('agents:export', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return await agentsManager.exportAgent(params)
    } catch (err) {
      console.error('[IPC] agents:export error:', err)
      return { success: false, error: err.message }
    }
  })

  // 批量导出 Agents
  ipcMain.handle('agents:exportBatch', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      const result = await agentsManager.exportAgentsBatch(params)
      return JSON.parse(JSON.stringify(result))
    } catch (err) {
      console.error('[IPC] agents:exportBatch error:', err)
      return { success: false, error: String(err.message || err) }
    }
  })

  // 兼容旧接口: 获取全局 Agents (插件)
  ipcMain.handle('agents:listGlobal', async () => {
    try {
      return await agentsManager.getPluginAgents()
    } catch (err) {
      console.error('[IPC] agents:listGlobal error:', err)
      return []
    }
  })

  // ========================================
  // Hooks Manager IPC Handlers
  // ========================================

  // 获取全局 Hooks
  ipcMain.handle('hooks:listGlobal', async () => {
    try {
      return await hooksManager.getGlobalHooks()
    } catch (err) {
      console.error('[IPC] hooks:listGlobal error:', err)
      return []
    }
  })

  // 获取项目级 Hooks
  ipcMain.handle('hooks:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return await hooksManager.getProjectHooks(projectPath)
    } catch (err) {
      console.error('[IPC] hooks:listProject error:', err)
      return []
    }
  })

  // 获取所有 Hooks (全局 + 项目级)
  ipcMain.handle('hooks:listAll', async (event, projectPath) => {
    try {
      return await hooksManager.getAllHooks(projectPath || null)
    } catch (err) {
      console.error('[IPC] hooks:listAll error:', err)
      return []
    }
  })

  // 获取 Hooks Schema
  ipcMain.handle('hooks:getSchema', async () => {
    try {
      return hooksManager.getHooksSchema()
    } catch (err) {
      console.error('[IPC] hooks:getSchema error:', err)
      return { events: [], types: [], typeFields: {} }
    }
  })

  // 创建 Hook
  ipcMain.handle('hooks:create', async (event, params) => {
    try {
      return await hooksManager.createHook(params)
    } catch (err) {
      console.error('[IPC] hooks:create error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 Hook
  ipcMain.handle('hooks:update', async (event, params) => {
    try {
      return await hooksManager.updateHook(params)
    } catch (err) {
      console.error('[IPC] hooks:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 Hook
  ipcMain.handle('hooks:delete', async (event, params) => {
    try {
      return await hooksManager.deleteHook(params)
    } catch (err) {
      console.error('[IPC] hooks:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // 复制 Hook
  ipcMain.handle('hooks:copy', async (event, params) => {
    try {
      return await hooksManager.copyHook(params)
    } catch (err) {
      console.error('[IPC] hooks:copy error:', err)
      return { success: false, error: err.message }
    }
  })

  // 获取 Hooks JSON 原始数据
  ipcMain.handle('hooks:getJson', async (event, params) => {
    try {
      return await hooksManager.getHooksJson(params)
    } catch (err) {
      console.error('[IPC] hooks:getJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 保存 Hooks JSON 原始数据
  ipcMain.handle('hooks:saveJson', async (event, params) => {
    try {
      return await hooksManager.saveHooksJson(params)
    } catch (err) {
      console.error('[IPC] hooks:saveJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // MCP Manager IPC Handlers
  // ========================================

  // 获取所有 MCP (四级分类)
  ipcMain.handle('mcp:listAll', async (event, projectPath) => {
    try {
      return mcpManager.listMcpAll(projectPath || null)
    } catch (err) {
      console.error('[IPC] mcp:listAll error:', err)
      return { user: [], local: [], project: [], plugin: [] }
    }
  })

  // 获取 User scope MCP
  ipcMain.handle('mcp:listUser', async () => {
    try {
      return mcpManager.listMcpUser()
    } catch (err) {
      console.error('[IPC] mcp:listUser error:', err)
      return []
    }
  })

  // 获取 Local scope MCP
  ipcMain.handle('mcp:listLocal', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return mcpManager.listMcpLocal(projectPath)
    } catch (err) {
      console.error('[IPC] mcp:listLocal error:', err)
      return []
    }
  })

  // 获取 Project scope MCP
  ipcMain.handle('mcp:listProject', async (event, projectPath) => {
    try {
      if (!projectPath || typeof projectPath !== 'string') return []
      return mcpManager.listMcpProject(projectPath)
    } catch (err) {
      console.error('[IPC] mcp:listProject error:', err)
      return []
    }
  })

  // 获取 Plugin scope MCP (只读)
  ipcMain.handle('mcp:listPlugin', async () => {
    try {
      return mcpManager.listMcpPlugin()
    } catch (err) {
      console.error('[IPC] mcp:listPlugin error:', err)
      return []
    }
  })

  // 旧版兼容: 获取全局 MCP (插件)
  ipcMain.handle('mcp:listGlobal', async () => {
    try {
      return await mcpManager.getGlobalMcp()
    } catch (err) {
      console.error('[IPC] mcp:listGlobal error:', err)
      return []
    }
  })

  // 创建 MCP
  ipcMain.handle('mcp:create', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return mcpManager.createMcp(params)
    } catch (err) {
      console.error('[IPC] mcp:create error:', err)
      return { success: false, error: err.message }
    }
  })

  // 更新 MCP
  ipcMain.handle('mcp:update', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return mcpManager.updateMcp(params)
    } catch (err) {
      console.error('[IPC] mcp:update error:', err)
      return { success: false, error: err.message }
    }
  })

  // 删除 MCP
  ipcMain.handle('mcp:delete', async (event, params) => {
    try {
      if (!params || typeof params !== 'object') {
        return { success: false, error: 'Invalid parameters' }
      }
      return mcpManager.deleteMcp(params)
    } catch (err) {
      console.error('[IPC] mcp:delete error:', err)
      return { success: false, error: err.message }
    }
  })

  // ========================================
  // 文件操作
  // ========================================

  // 在系统默认编辑器中打开文件
  ipcMain.handle('file:openInEditor', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      const result = await shell.openPath(filePath)
      if (result) {
        // 返回非空字符串表示出错
        return { success: false, error: result }
      }
      return { success: true }
    } catch (err) {
      console.error('[IPC] file:openInEditor error:', err)
      return { success: false, error: err.message }
    }
  })

  // 读取 JSON 文件内容
  ipcMain.handle('file:readJson', async (event, filePath) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      const fs = require('fs')
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File not found' }
      }

      const content = fs.readFileSync(filePath, 'utf-8')
      const data = JSON.parse(content)
      return { success: true, data }
    } catch (err) {
      console.error('[IPC] file:readJson error:', err)
      return { success: false, error: err.message }
    }
  })

  // 写入 JSON 文件内容
  ipcMain.handle('file:writeJson', async (event, filePath, data) => {
    try {
      if (!filePath || typeof filePath !== 'string') {
        return { success: false, error: 'Invalid file path' }
      }

      const fs = require('fs')
      const content = JSON.stringify(data, null, 2)
      fs.writeFileSync(filePath, content, 'utf-8')
      return { success: true }
    } catch (err) {
      console.error('[IPC] file:writeJson error:', err)
      return { success: false, error: err.message }
    }
  })

  console.log('[IPC] Plugin handlers registered')
}

module.exports = { setupPluginHandlers }
