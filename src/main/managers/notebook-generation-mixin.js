/**
 * NotebookManager — Generation mixin
 * 生成管线：工具查找 → 路径计算 → Prompt 组装 → Achievement 创建
 */

const path = require('path')

const LEGACY_OUTPUT_TYPE_MAP = {
  markdown: 'md',
  document: 'docx',
  docx: 'docx',
  ppt: 'pptx',
  pptx: 'pptx',
  code: 'html',
  text: 'txt',
  image: 'jpg',
  video: 'mp4',
  audio: 'mp3',
  pdf: 'pdf',
  csv: 'csv'
}

function normalizeOutputExtension(outputType) {
  const normalized = String(outputType || '').trim().replace(/^\.+/, '').toLowerCase()
  if (!normalized) return 'txt'
  const mapped = LEGACY_OUTPUT_TYPE_MAP[normalized] || normalized
  const safe = mapped.replace(/[^a-z0-9]/g, '')
  return safe || 'txt'
}

function buildGenerationDraft(manager, notebookId, toolId, sourceIds = []) {
  const tools = manager.listTools()
  const tool = tools.find(t => t.id === toolId)
  if (!tool) throw new Error(`工具不存在：${toolId}`)

  const typeName = tool.name
  const outputType = normalizeOutputExtension(tool.outputType)

  const allSources = manager.listSources(notebookId)
  const selectedSources = sourceIds.length > 0
    ? allSources.filter(s => sourceIds.includes(s.id))
    : allSources.filter(s => s.selected)

  const hasSources = selectedSources.length > 0
  const sourceInfo = hasSources
    ? selectedSources.map(s => `- ${s.name} (路径: ${s.path})`).join('\n')
    : ''

  const notebookPath = manager._getNotebookPath(notebookId)
  const safeId = toolId.replace(/[^a-zA-Z0-9_-]/g, '-')
  const expectedFileName = `${safeId}-${Date.now()}.${outputType}`
  const expectedRelPath = `achievements/${safeId}/${expectedFileName}`
  const expectedAbsPath = path.join(notebookPath, expectedRelPath)

  let templateContent = ''
  if (tool.promptTemplateId && manager.sessionDatabase) {
    try {
      const record = manager.sessionDatabase.getPromptByMarketId(tool.promptTemplateId)
      templateContent = record?.content || ''
    } catch (err) {
      console.warn(`[NotebookManager] Failed to load prompt template [${tool.promptTemplateId}]:`, err.message)
    }
  }

  let prompt = ''

  if (templateContent) {
    prompt = templateContent
      .replace(/\{\{sources\}\}/g, hasSources ? sourceInfo : '（未勾选特定来源，请根据对话上下文生成）')
      .replace(/\{\{expected_path\}\}/g, expectedAbsPath)
      .replace(/\{\{notebook_path\}\}/g, notebookPath)

    if (tool.runtimePlaceholders) {
      Object.entries(tool.runtimePlaceholders).forEach(([key, value]) => {
        prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
      })
    }
  } else {
    const instruction = `我的目标是：使用【${typeName}】功能，生成一份成果。
请将最终成果保存到指定路径：${expectedAbsPath}。
如果你是一个只能输出纯文本的工具，请直接在对话中输出内容，系统会自动为你保存。
请确保最终生成的文件扩展名为 .${outputType}，如果是报告请保持结构完整，不要使用省略号。`

    if (hasSources) {
      prompt = `请分析以下选中的来源文件：\n${sourceInfo}\n\n${instruction}`
    } else {
      prompt = `请根据我们当前的对话上下文。\n\n${instruction}`
    }
  }

  return {
    toolId,
    typeName,
    outputType,
    selectedSources,
    expectedRelPath,
    expectedAbsPath,
    prompt
  }
}

const notebookGenerationMixin = {
  /**
   * 预览生成草稿：仅组装 Prompt，不创建 Achievement
   *
   * @param {string} notebookId
   * @param {string} toolId
   * @param {string[]} sourceIds
   * @returns {{ expectedAbsPath: string, prompt: string, sourceIds: string[] }}
   */
  previewGeneration(notebookId, toolId, sourceIds = []) {
    const draft = buildGenerationDraft(this, notebookId, toolId, sourceIds)
    return {
      expectedAbsPath: draft.expectedAbsPath,
      prompt: draft.prompt,
      sourceIds: draft.selectedSources.map(source => source.id)
    }
  },

  /**
   * 准备生成：事务性完成工具查找 → Prompt 组装 → Achievement 创建
   * Achievement 在最后一步创建，前面任何步骤失败不会产生幽灵记录。
   *
   * @param {string} notebookId
   * @param {string} toolId - 工具 ID（如 'notes', 'pdf'）
   * @param {string[]} sourceIds - 选中的来源 ID 列表
   * @returns {{ achievementId: string, prompt: string }}
   */
  prepareGeneration(notebookId, toolId, sourceIds = []) {
    const draft = buildGenerationDraft(this, notebookId, toolId, sourceIds)

    // 6. 创建 Achievement 记录（最后一步，避免幽灵记录）
    const achievement = this.addAchievement(notebookId, {
      name: `${draft.typeName} - ${new Date().toLocaleDateString()}`,
      type: draft.outputType,
      toolId,
      toolName: draft.typeName,
      path: draft.expectedRelPath,
      sourceIds: draft.selectedSources.map(source => source.id)
    })

    console.log(`[NotebookManager] prepareGeneration done: tool=${toolId}, achievement=${achievement.id}`)

    return {
      achievementId: achievement.id,
      expectedAbsPath: draft.expectedAbsPath,
      prompt: draft.prompt
    }
  }
}

module.exports = { notebookGenerationMixin }
