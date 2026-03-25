/**
 * NotebookManager — Install mixin
 * 创作工具安装编排：依赖安装 + Prompt 安装 + 工具配置写入
 * 内部复用 CapabilityManager.installCapability()
 */

const notebookInstallMixin = {
  /**
   * 安装创作工具：依次安装底层依赖 → 安装 Prompt 模板 → 写入工具配置
   * @param {Object} tool - 远程工具定义（含 installDependencies, promptTemplateId 等）
   * @returns {{ success: boolean, error?: string }}
   */
  async installTool(tool, installOptions = {}) {
    if (!tool || !tool.id) throw new Error('工具定义无效')
    if (!this.capabilityManager) throw new Error('CapabilityManager 未注入')

    const dependencyOptions = installOptions.dependencyOptions || {}

    console.log(`[NotebookManager] installTool: ${tool.id} (${tool.name})`)

    // 1. 安装底层组件依赖 (skill / mcp / plugin / prompt)
    if (tool.installDependencies?.length > 0) {
      for (const dep of tool.installDependencies) {
        if (!dep.id || !dep.type) continue
        const currentStatus = this.capabilityManager.checkComponentInstalled(dep.type, dep.id)
        if (currentStatus === 'installed' || currentStatus === 'disabled') {
          console.log(`[NotebookManager] Dependency already present, skip install: ${dep.id} (${dep.type}) status=${currentStatus}`)
          continue
        }
        console.log(`[NotebookManager] Installing dependency: ${dep.id} (${dep.type})`)
        const capability = {
          type: dep.type,
          componentId: dep.id,
          marketplace: dep.marketplaceSource || undefined
        }
        const capOptions = {
          scope: 'notebook',
          ...(dependencyOptions[`${dep.type}:${dep.id}`] || {})
        }
        const res = await this.capabilityManager.installCapability(capability, capOptions)
        if (!res.success) {
          throw new Error(`组件 ${dep.id} 安装失败: ${res.error}`)
        }
      }
    }

    // 2. 安装配套 Prompt 模板（如果不在 installDependencies 中）
    if (tool.promptTemplateId) {
      const alreadyInDeps = tool.installDependencies?.some(
        d => d.type === 'prompt' && d.id === tool.promptTemplateId
      )
      if (!alreadyInDeps) {
        const promptStatus = this.capabilityManager.checkComponentInstalled('prompt', tool.promptTemplateId)
        if (promptStatus !== 'installed') {
          console.log(`[NotebookManager] Installing prompt template: ${tool.promptTemplateId}`)
          const res = await this.capabilityManager.installCapability(
            { type: 'prompt', componentId: tool.promptTemplateId },
            { scope: 'notebook' }
          )
          if (!res.success) {
            throw new Error(`提示词模板 ${tool.promptTemplateId} 安装失败: ${res.error}`)
          }
        } else {
          console.log(`[NotebookManager] Prompt already installed, skip install: ${tool.promptTemplateId}`)
        }
      }
    }

    // 3. 写入工具配置
    const existingTools = this.listTools()
    if (existingTools.find(t => t.id === tool.id)) {
      // 已存在则更新
      this.updateTool(tool.id, tool)
    } else {
      this.addTool(tool)
    }

    console.log(`[NotebookManager] installTool done: ${tool.id}`)
    return { success: true }
  },

  /**
   * 卸载创作工具：从配置中移除（不卸载底层组件，因为可能被其他工具共用）
   * @param {string} toolId
   * @returns {{ success: boolean }}
   */
  uninstallTool(toolId) {
    if (!toolId) throw new Error('工具 ID 不能为空')
    console.log(`[NotebookManager] uninstallTool: ${toolId}`)
    return this.deleteTool(toolId)
  }
}

module.exports = { notebookInstallMixin }
