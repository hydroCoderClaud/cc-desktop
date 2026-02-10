/**
 * Prompt Market Database Operations Mixin
 *
 * 提示词市场相关的数据库操作方法
 * 使用独立表 market_installed_prompts 关联 prompts 表，不修改原表 schema
 */

/**
 * 将 Prompt Market 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withPromptMarketOperations(BaseClass) {
  return class extends BaseClass {
    /**
     * 安装市场 Prompt
     * @param {{ marketId: string, registryUrl: string, version: string, name: string, content: string, scope?: string }} params
     * @returns {{ success: boolean, promptId?: number, error?: string, conflict?: boolean }}
     */
    installMarketPrompt({ marketId, registryUrl, version, name, content, scope = 'global' }) {
      try {
        // 检查是否已安装
        const existing = this.db.prepare(
          'SELECT id, local_prompt_id FROM market_installed_prompts WHERE market_id = ?'
        ).get(marketId)

        if (existing) {
          return { success: false, error: `市场提示词 "${marketId}" 已安装`, conflict: true }
        }

        // 创建 prompt
        const now = Date.now()
        const result = this.db.prepare(`
          INSERT INTO prompts (name, content, scope, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(name, content, scope, now, now)

        const promptId = result.lastInsertRowid

        // 插入市场元数据
        this.db.prepare(`
          INSERT INTO market_installed_prompts (market_id, local_prompt_id, registry_url, version, installed_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(marketId, promptId, registryUrl, version || '0.0.0', now)

        console.log(`[PromptMarketDB] Installed market prompt: ${marketId} → prompt #${promptId}`)
        return { success: true, promptId: Number(promptId) }
      } catch (err) {
        console.error('[PromptMarketDB] Install failed:', err)
        return { success: false, error: err.message }
      }
    }

    /**
     * 强制覆盖安装市场 Prompt
     */
    installMarketPromptForce({ marketId, registryUrl, version, name, content, scope = 'global' }) {
      try {
        // 删除已有记录（级联删除会清理 prompt）
        const existing = this.db.prepare(
          'SELECT local_prompt_id FROM market_installed_prompts WHERE market_id = ?'
        ).get(marketId)

        if (existing) {
          // 删除关联的 prompt
          this.db.prepare('DELETE FROM prompts WHERE id = ?').run(existing.local_prompt_id)
          // 删除市场元数据（可能已被 CASCADE 删除，但安全起见再删一次）
          this.db.prepare('DELETE FROM market_installed_prompts WHERE market_id = ?').run(marketId)
        }

        // 重新安装
        return this.installMarketPrompt({ marketId, registryUrl, version, name, content, scope })
      } catch (err) {
        console.error('[PromptMarketDB] Force install failed:', err)
        return { success: false, error: err.message }
      }
    }

    /**
     * 获取所有已安装的市场 Prompts 元数据
     * @returns {Array<{marketId, localPromptId, version, registryUrl, installedAt}>}
     */
    getMarketInstalledPrompts() {
      try {
        const rows = this.db.prepare(`
          SELECT mip.market_id, mip.local_prompt_id, mip.version, mip.registry_url, mip.installed_at,
                 p.name as prompt_name
          FROM market_installed_prompts mip
          LEFT JOIN prompts p ON p.id = mip.local_prompt_id
        `).all()

        return rows.map(row => ({
          market_id: row.market_id,
          localPromptId: row.local_prompt_id,
          version: row.version,
          registryUrl: row.registry_url,
          installedAt: row.installed_at,
          promptName: row.prompt_name
        }))
      } catch (err) {
        console.error('[PromptMarketDB] Failed to list market installed prompts:', err)
        return []
      }
    }
  }
}

module.exports = { withPromptMarketOperations }
