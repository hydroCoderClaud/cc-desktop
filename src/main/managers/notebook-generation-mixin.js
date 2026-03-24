/**
 * NotebookManager — Generation mixin
 * 生成管线：工具查找 → 路径计算 → Prompt 组装 → Achievement 创建
 */

const EXT_MAP = {
  markdown: 'md', document: 'docx', code: 'html', text: 'txt',
  image: 'png', video: 'mp4', pdf: 'pdf', csv: 'csv'
}

const notebookGenerationMixin = {
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
    // 1. 查找工具定义
    const tools = this.listTools()
    const tool = tools.find(t => t.id === toolId)
    if (!tool) throw new Error(`工具不存在：${toolId}`)

    const typeName = tool.name
    const outputType = tool.outputType || 'text'

    // 2. 获取选中来源信息
    const allSources = this.listSources(notebookId)
    const selectedSources = sourceIds.length > 0
      ? allSources.filter(s => sourceIds.includes(s.id))
      : allSources.filter(s => s.selected)

    const hasSources = selectedSources.length > 0
    const sourceInfo = hasSources
      ? selectedSources.map(s => `- ${s.name} (路径: ${s.path})`).join('\n')
      : ''

    // 3. 计算预期输出路径
    const ext = EXT_MAP[outputType] || 'txt'
    const expectedFileName = `${typeName}-${Date.now()}.${ext}`
    const expectedRelPath = `achievements/${outputType}/${expectedFileName}`

    // 4. 加载 Prompt 模板
    let templateContent = ''
    if (tool.promptTemplateId && this.sessionDatabase) {
      try {
        const record = this.sessionDatabase.getPromptByMarketId(tool.promptTemplateId)
        templateContent = record?.content || ''
      } catch (err) {
        console.warn(`[NotebookManager] Failed to load prompt template [${tool.promptTemplateId}]:`, err.message)
      }
    }

    // 5. 组装最终 Prompt
    let prompt = ''

    if (templateContent) {
      // 通用占位符替换
      prompt = templateContent
        .replace(/\{\{sources\}\}/g, hasSources ? sourceInfo : '（未勾选特定来源，请根据对话上下文生成）')
        .replace(/\{\{expected_path\}\}/g, expectedRelPath)

      // 运行时能力占位符替换
      if (tool.runtimePlaceholders) {
        Object.entries(tool.runtimePlaceholders).forEach(([key, value]) => {
          prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value)
        })
      }
    } else {
      // 兜底硬编码模板
      const instruction = `我的目标是：使用【${typeName}】功能，生成一份成果。
请将最终成果保存到指定路径：${expectedRelPath}。
如果你是一个只能输出纯文本的工具，请直接在对话中输出内容，系统会自动为你保存。
请确保最终生成的文件符合 ${outputType} 类型（或对应扩展名的文件），如果是报告请保持结构完整，不要使用省略号。`

      if (hasSources) {
        prompt = `请分析以下选中的来源文件：\n${sourceInfo}\n\n${instruction}`
      } else {
        prompt = `请根据我们当前的对话上下文。\n\n${instruction}`
      }
    }

    // 6. 创建 Achievement 记录（最后一步，避免幽灵记录）
    const achievement = this.addAchievement(notebookId, {
      name: `${typeName} - ${new Date().toLocaleDateString()}`,
      type: outputType,
      path: expectedRelPath,
      sourceIds: selectedSources.map(s => s.id)
    })

    console.log(`[NotebookManager] prepareGeneration done: tool=${toolId}, achievement=${achievement.id}`)

    return {
      achievementId: achievement.id,
      prompt
    }
  }
}

module.exports = { notebookGenerationMixin }
