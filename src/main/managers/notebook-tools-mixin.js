/**
 * NotebookManager — Tools mixin
 * 创作工具的配置读写 (全局 notebook-tools.json)
 */

const fs = require('fs')
const path = require('path')

const DEFAULT_TOOLS = [
  { id: 'notes', name: '笔记总结', description: '提取核心要点生成笔记', icon: 'fileText', outputType: 'markdown', promptTemplateId: 'sys-notebook-notes', dependencies: [], bgColor: '#FFF8E1', color: '#FFA000' }
]

const notebookToolsMixin = {
  _getToolsConfigPath() {
    // 工具配置应该跟随应用（电脑），而不是跟随具体的磁盘数据目录
    // 路径改为应用的核心配置目录 (userDataPath)
    const userDataPath = this.configManager.userDataPath
    if (!fs.existsSync(userDataPath)) {
      fs.mkdirSync(userDataPath, { recursive: true })
    }
    return path.join(userDataPath, 'notebook-tools.json')
  },

  listTools() {
    const configPath = this._getToolsConfigPath()
    if (!fs.existsSync(configPath)) {
      const initialData = { version: '1.0', tools: DEFAULT_TOOLS }
      this._writeJsonAtomic(configPath, initialData)
      return initialData.tools
    }
    try {
      const data = this._readJson(configPath)
      return data.tools || []
    } catch (err) {
      console.error('[NotebookManager] Failed to read tools config:', err)
      return DEFAULT_TOOLS
    }
  },

  updateTool(toolId, updates) {
    const configPath = this._getToolsConfigPath()
    const tools = this.listTools()
    const idx = tools.findIndex(t => t.id === toolId)
    
    if (idx === -1) throw new Error(`工具不存在：${toolId}`)
    
    console.log(`[NotebookManager] Updating tool: ${toolId}`, updates)
    
    const allowedFields = [
      'name', 'description', 'icon', 'outputType', 'promptTemplateId', 
      'installDependencies', 'runtimePlaceholders', 'bgColor', 'color', 'beta'
    ]
    allowedFields.forEach(k => {
      if (updates && k in updates) {
        // 深拷贝处理数组和对象，确保持久化准确
        if (typeof updates[k] === 'object' && updates[k] !== null) {
          tools[idx][k] = JSON.parse(JSON.stringify(updates[k]))
        } else {
          tools[idx][k] = updates[k]
        }
      }
    })

    const finalData = { version: '1.0', tools }
    this._writeJsonAtomic(configPath, finalData)
    console.log(`[NotebookManager] Tool ${toolId} saved successfully to ${configPath}`)
    return tools[idx]
  },

  addTool(toolData) {
    const configPath = this._getToolsConfigPath()
    const tools = this.listTools()
    if (tools.find(t => t.id === toolData.id)) {
      throw new Error(`工具 ID 已存在：${toolData.id}`)
    }
    const newTool = {
      id: toolData.id,
      name: toolData.name || toolData.id,
      description: toolData.description || '',
      icon: toolData.icon || 'star',
      outputType: toolData.outputType || 'text',
      promptTemplateId: toolData.promptTemplateId || '',
      installDependencies: toolData.installDependencies || [],
      runtimePlaceholders: toolData.runtimePlaceholders || {},
      bgColor: toolData.bgColor || '#f5f5f5',
      color: toolData.color || '#666'
    }
    tools.push(newTool)
    this._writeJsonAtomic(configPath, { version: '1.0', tools })
    return newTool
  },

  deleteTool(toolId) {
    const configPath = this._getToolsConfigPath()
    let tools = this.listTools()
    const originalLength = tools.length
    tools = tools.filter(t => t.id !== toolId)
    if (tools.length === originalLength) {
      throw new Error(`工具不存在：${toolId}`)
    }
    this._writeJsonAtomic(configPath, { version: '1.0', tools })
    return { success: true }
  }
}

module.exports = { notebookToolsMixin, DEFAULT_TOOLS }
