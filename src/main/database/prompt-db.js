/**
 * Prompt Database Operations Mixin
 *
 * 提示词相关的数据库操作方法
 */

/**
 * 将 Prompt 操作方法混入到目标类
 * @param {Function} BaseClass - 基类
 * @returns {Function} - 扩展后的类
 */
function withPromptOperations(BaseClass) {
  return class extends BaseClass {
    // ========================================
    // Prompt Operations
    // ========================================

    /**
     * Create a new prompt
     * @param {Object} promptData
     * @param {string} promptData.name - Prompt name
     * @param {string} promptData.content - Prompt content
     * @param {string} promptData.scope - 'global' or 'project'
     * @param {number} promptData.project_id - Project ID (required if scope is 'project')
     * @param {number[]} promptData.tagIds - Array of tag IDs
     */
    createPrompt(promptData) {
      const { name, content, scope = 'global', project_id = null, tagIds = [] } = promptData
      const now = Date.now()

      const result = this.db.prepare(`
        INSERT INTO prompts (name, content, scope, project_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(name, content, scope, scope === 'project' ? project_id : null, now, now)

      const promptId = result.lastInsertRowid

      // Add tags
      if (tagIds.length > 0) {
        const insertTag = this.db.prepare(
          'INSERT OR IGNORE INTO prompt_tag_relations (prompt_id, tag_id) VALUES (?, ?)'
        )
        for (const tagId of tagIds) {
          insertTag.run(promptId, tagId)
        }
      }

      return this.getPromptById(promptId)
    }

    /**
     * Get prompt by ID with tags
     */
    getPromptById(promptId) {
      const prompt = this.db.prepare(`
        SELECT p.*, mip.market_id FROM prompts p
        LEFT JOIN market_installed_prompts mip ON mip.local_prompt_id = p.id
        WHERE p.id = ?
      `).get(promptId)
      if (prompt) {
        prompt.tags = this.getPromptTags(promptId)
      }
      return prompt
    }

    /**
     * Get all prompts with optional filters
     * @param {Object} options
     * @param {string} options.scope - 'global', 'project', or 'all'
     * @param {number} options.projectId - Filter by project ID
     * @param {number[]} options.tagIds - Filter by tag IDs
     */
    getPrompts(options = {}) {
      const { scope = 'all', projectId = null, tagIds = [] } = options

      let sql = `
        SELECT DISTINCT p.*, mip.market_id FROM prompts p
        LEFT JOIN market_installed_prompts mip ON mip.local_prompt_id = p.id
      `
      const params = []
      const conditions = []

      // Join with tags if filtering by tags
      if (tagIds.length > 0) {
        sql += ' JOIN prompt_tag_relations ptr ON p.id = ptr.prompt_id'
        conditions.push(`ptr.tag_id IN (${tagIds.map(() => '?').join(',')})`)
        params.push(...tagIds)
      }

      // Scope filter
      if (scope === 'global') {
        conditions.push("p.scope = 'global'")
      } else if (scope === 'project' && projectId) {
        // 只显示当前项目的提示词
        conditions.push("p.scope = 'project' AND p.project_id = ?")
        params.push(projectId)
      }
      // scope === 'all' 时不加条件，显示所有提示词

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ')
      }

      sql += ' ORDER BY p.is_favorite DESC, p.usage_count DESC, p.updated_at DESC'

      const prompts = this.db.prepare(sql).all(...params)

      // Load tags for each prompt
      for (const prompt of prompts) {
        prompt.tags = this.getPromptTags(prompt.id)
      }

      return prompts
    }

    /**
     * Update a prompt
     */
    updatePrompt(promptId, updates) {
      const allowedFields = ['name', 'content', 'scope', 'project_id', 'is_favorite']
      const fields = []
      const values = []

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`)
          values.push(value)
        }
      }

      // 如果没有字段更新且也没有标签更新，返回 null
      if (fields.length === 0 && updates.tagIds === undefined) return null

      // 如果有字段更新，执行 UPDATE
      if (fields.length > 0) {
        fields.push('updated_at = ?')
        values.push(Date.now())
        values.push(promptId)

        this.db.prepare(
          `UPDATE prompts SET ${fields.join(', ')} WHERE id = ?`
        ).run(...values)
      }

      // Update tags if provided
      if (updates.tagIds !== undefined) {
        // Remove existing tags
        this.db.prepare('DELETE FROM prompt_tag_relations WHERE prompt_id = ?').run(promptId)
        // Add new tags
        if (updates.tagIds.length > 0) {
          const insertTag = this.db.prepare(
            'INSERT OR IGNORE INTO prompt_tag_relations (prompt_id, tag_id) VALUES (?, ?)'
          )
          for (const tagId of updates.tagIds) {
            insertTag.run(promptId, tagId)
          }
        }
      }

      return this.getPromptById(promptId)
    }

    /**
     * Delete a prompt
     */
    deletePrompt(promptId) {
      // 先删除市场元数据（防御性：不依赖 CASCADE）
      this.db.prepare('DELETE FROM market_installed_prompts WHERE local_prompt_id = ?').run(promptId)
      this.db.prepare('DELETE FROM prompts WHERE id = ?').run(promptId)
      return { success: true }
    }

    /**
     * Increment prompt usage count
     */
    incrementPromptUsage(promptId) {
      this.db.prepare(
        'UPDATE prompts SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?'
      ).run(Date.now(), promptId)
    }

    /**
     * Toggle prompt favorite status
     */
    togglePromptFavorite(promptId) {
      const prompt = this.db.prepare('SELECT is_favorite FROM prompts WHERE id = ?').get(promptId)
      if (!prompt) return null

      const newStatus = prompt.is_favorite ? 0 : 1
      this.db.prepare(
        'UPDATE prompts SET is_favorite = ?, updated_at = ? WHERE id = ?'
      ).run(newStatus, Date.now(), promptId)

      return this.getPromptById(promptId)
    }

    // ========================================
    // Prompt Tag Operations
    // ========================================

    /**
     * Create a prompt tag
     */
    createPromptTag(name, color = '#1890ff') {
      const result = this.db.prepare(
        'INSERT INTO prompt_tags (name, color) VALUES (?, ?)'
      ).run(name, color)
      return { id: result.lastInsertRowid, name, color }
    }

    /**
     * Get all prompt tags with usage counts
     */
    getAllPromptTags() {
      return this.db.prepare(`
        SELECT t.*,
               (SELECT COUNT(*) FROM prompt_tag_relations ptr WHERE ptr.tag_id = t.id) as usage_count
        FROM prompt_tags t
        ORDER BY usage_count DESC, t.name ASC
      `).all()
    }

    /**
     * Update a prompt tag
     */
    updatePromptTag(tagId, updates) {
      const allowedFields = ['name', 'color']
      const fields = []
      const values = []

      for (const [key, value] of Object.entries(updates)) {
        if (allowedFields.includes(key)) {
          fields.push(`${key} = ?`)
          values.push(value)
        }
      }

      if (fields.length === 0) return null

      values.push(tagId)
      this.db.prepare(
        `UPDATE prompt_tags SET ${fields.join(', ')} WHERE id = ?`
      ).run(...values)

      return this.db.prepare('SELECT * FROM prompt_tags WHERE id = ?').get(tagId)
    }

    /**
     * Delete a prompt tag
     */
    deletePromptTag(tagId) {
      this.db.prepare('DELETE FROM prompt_tags WHERE id = ?').run(tagId)
      return { success: true }
    }

    /**
     * Get tags for a prompt
     */
    getPromptTags(promptId) {
      return this.db.prepare(`
        SELECT t.* FROM prompt_tags t
        JOIN prompt_tag_relations ptr ON t.id = ptr.tag_id
        WHERE ptr.prompt_id = ?
      `).all(promptId)
    }

    /**
     * Add tag to prompt
     */
    addTagToPrompt(promptId, tagId) {
      this.db.prepare(
        'INSERT OR IGNORE INTO prompt_tag_relations (prompt_id, tag_id) VALUES (?, ?)'
      ).run(promptId, tagId)
    }

    /**
     * Remove tag from prompt
     */
    removeTagFromPrompt(promptId, tagId) {
      this.db.prepare(
        'DELETE FROM prompt_tag_relations WHERE prompt_id = ? AND tag_id = ?'
      ).run(promptId, tagId)
    }
  }
}

module.exports = { withPromptOperations }
