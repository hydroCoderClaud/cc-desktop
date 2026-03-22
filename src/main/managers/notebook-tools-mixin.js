/**
 * NotebookManager — Tools mixin
 * 场景工具的配置读写 (全局 notebook-tools.json)
 */

const fs = require('fs')
const path = require('path')

const DEFAULT_TOOLS = [
  { id: 'image', name: '图片生成', description: '生成一张图片', icon: 'image', outputType: 'image', promptTemplateId: '', dependencies: [], bgColor: '#E0F7FA', color: '#0097A7' },
  { id: 'video', name: '视频制作', description: '生成一个解说视频', icon: 'video', outputType: 'video', promptTemplateId: '', dependencies: [], beta: true, bgColor: '#E8F5E9', color: '#388E3C' },
  { id: 'notes', name: '笔记总结', description: '提取核心要点生成笔记', icon: 'fileText', outputType: 'markdown', promptTemplateId: 'sys-notebook-notes', dependencies: [], bgColor: '#FFF8E1', color: '#FFA000' },
  { id: 'pdf', name: 'PDF 报告', description: '生成排版精美的 PDF 报告', icon: 'file', outputType: 'pdf', promptTemplateId: '', dependencies: [], bgColor: '#FCE4EC', color: '#C2185B' },
  { id: 'presentation', name: '演示文稿', description: '生成一份演示文稿 (PPTX)', icon: 'presentation', outputType: 'document', promptTemplateId: '', dependencies: [], beta: true, bgColor: '#FFF3E0', color: '#F57C00' },
  { id: 'word', name: '长文文档', description: '生成一份长文文档 (DOCX)', icon: 'fileText', outputType: 'document', promptTemplateId: '', dependencies: [], bgColor: '#E3F2FD', color: '#1976D2' },
  { id: 'web', name: '网页制作', description: '生成单页网页', icon: 'globe', outputType: 'code', promptTemplateId: '', dependencies: [], beta: true, bgColor: '#F3E5F5', color: '#7B1FA2' },
  { id: 'data', name: '数据提取', description: '提取数据到 CSV', icon: 'table', outputType: 'text', promptTemplateId: '', dependencies: [], bgColor: '#EDE7F6', color: '#512DA8' }
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
    
    const allowedFields = ['name', 'description', 'icon', 'outputType', 'promptTemplateId', 'dependencies', 'bgColor', 'color', 'beta']
    allowedFields.forEach(k => {
      if (updates && k in updates) {
        // 特别处理数组，确保深拷贝
        if (k === 'dependencies' && Array.isArray(updates[k])) {
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
      dependencies: toolData.dependencies || []
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
