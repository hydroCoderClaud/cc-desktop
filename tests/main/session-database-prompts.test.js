/**
 * SessionDatabase Prompts 单元测试
 *
 * 使用 Mock 替代 better-sqlite3 原生模块，解决 Electron/Node.js 版本不兼容问题
 */

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'

// 创建临时测试目录
const testTempDir = path.join(os.tmpdir(), 'cc-desktop-prompt-test-' + Date.now())

// 设置测试目录
function setupTestDir() {
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true })
  }
  return testTempDir
}

// 清理测试目录
function cleanupTestDir() {
  if (fs.existsSync(testTempDir)) {
    fs.rmSync(testTempDir, { recursive: true, force: true })
  }
}

// Mock electron 模块
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => testTempDir),
    getName: vi.fn(() => 'claude-code-desktop-test'),
    getVersion: vi.fn(() => '1.0.0-test')
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

// ============================================================================
// Mock better-sqlite3 - 内存数据库实现
// ============================================================================

// 全局内存存储（每个测试重置）
let memoryTables = {}
let autoIncrements = {}

/**
 * 重置内存数据库
 */
function resetMemoryDB() {
  memoryTables = {}
  autoIncrements = {}
}

/**
 * Mock Statement 类
 */
class MockStatement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql.trim()
  }

  run(...params) {
    const sql = this.sql

    // INSERT
    if (sql.toUpperCase().startsWith('INSERT')) {
      return this._runInsert(params)
    }

    // UPDATE
    if (sql.toUpperCase().startsWith('UPDATE')) {
      return this._runUpdate(params)
    }

    // DELETE
    if (sql.toUpperCase().startsWith('DELETE')) {
      return this._runDelete(params)
    }

    return { changes: 0 }
  }

  get(...params) {
    if (this.sql.toUpperCase().startsWith('SELECT')) {
      const results = this._runSelect(params)
      return results[0]
    }
    return undefined
  }

  all(...params) {
    if (this.sql.toUpperCase().startsWith('SELECT')) {
      return this._runSelect(params)
    }
    return []
  }

  _getTableName(sql, keyword) {
    if (keyword === 'SELECT') {
      // 对于 SELECT，需要特殊处理以跳过子查询中的 FROM
      // 使用括号深度检测，找到不在括号内的 FROM
      let depth = 0
      for (let i = 0; i < sql.length; i++) {
        if (sql[i] === '(') depth++
        else if (sql[i] === ')') depth--
        else if (depth === 0) {
          const match = sql.substring(i).match(/^FROM\s+(\w+)/i)
          if (match) {
            return match[1]
          }
        }
      }
      return null
    }

    const patterns = {
      'INSERT': /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i,
      'UPDATE': /UPDATE\s+(\w+)/i,
      'DELETE': /DELETE\s+FROM\s+(\w+)/i
    }
    const match = sql.match(patterns[keyword])
    return match ? match[1] : null
  }

  _runInsert(params) {
    const tableName = this._getTableName(this.sql, 'INSERT')
    if (!tableName) return { changes: 0, lastInsertRowid: 0 }

    // 确保表存在
    if (!memoryTables[tableName]) {
      memoryTables[tableName] = []
      autoIncrements[tableName] = 1
    }

    // 解析列名
    const colMatch = this.sql.match(/\(([^)]+)\)\s*VALUES/i)
    if (!colMatch) return { changes: 0, lastInsertRowid: 0 }

    const columns = colMatch[1].split(',').map(c => c.trim())
    const id = autoIncrements[tableName]++

    const row = { id }
    columns.forEach((col, i) => {
      row[col] = params[i]
    })

    // 添加时间戳
    const now = new Date().toISOString()
    if (!row.created_at) row.created_at = now
    if (!row.updated_at) row.updated_at = now

    // 为 prompts 表添加默认值
    if (tableName === 'prompts') {
      if (row.is_favorite === undefined) row.is_favorite = 0
      if (row.usage_count === undefined) row.usage_count = 0
    }

    memoryTables[tableName].push(row)

    return { changes: 1, lastInsertRowid: id }
  }

  _runUpdate(params) {
    const tableName = this._getTableName(this.sql, 'UPDATE')
    if (!tableName || !memoryTables[tableName]) return { changes: 0 }

    // 解析 SET 子句中的列
    const setMatch = this.sql.match(/SET\s+(.+?)(?:\s+WHERE|$)/i)
    if (!setMatch) return { changes: 0 }

    const setParts = setMatch[1].split(',').map(s => s.trim())

    // 最后一个参数通常是 WHERE id = ?
    const whereId = params[params.length - 1]

    let changes = 0
    let paramIndex = 0

    for (const row of memoryTables[tableName]) {
      if (row.id === whereId) {
        for (const part of setParts) {
          const [col] = part.split('=').map(s => s.trim())
          if (part.includes('?')) {
            row[col] = params[paramIndex++]
          } else if (part.includes('+')) {
            // column = column + 1
            row[col] = (row[col] || 0) + 1
          }
        }
        row.updated_at = new Date().toISOString()
        changes++
      }
    }

    return { changes }
  }

  _runDelete(params) {
    const tableName = this._getTableName(this.sql, 'DELETE')
    if (!tableName || !memoryTables[tableName]) return { changes: 0 }

    const initialLength = memoryTables[tableName].length

    // 处理 WHERE prompt_id = ? AND tag_id = ? (双条件)
    if (this.sql.includes('prompt_id = ?') && this.sql.includes('tag_id = ?')) {
      const promptId = params[0]
      const tagId = params[1]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => !(row.prompt_id === promptId && row.tag_id === tagId)
      )
    }
    // 处理 WHERE prompt_id = ? (单条件)
    else if (this.sql.includes('prompt_id = ?')) {
      const promptId = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => row.prompt_id !== promptId
      )
    }
    // 处理 WHERE tag_id = ? (单条件)
    else if (this.sql.includes('tag_id = ?')) {
      const tagId = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => row.tag_id !== tagId
      )
    }
    // 处理 WHERE id = ?
    else {
      const id = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(row => row.id !== id)

      // 模拟 CASCADE DELETE：删除 prompts 时同时删除 prompt_tag_relations 中的关联
      if (tableName === 'prompts' && memoryTables['prompt_tag_relations']) {
        memoryTables['prompt_tag_relations'] = memoryTables['prompt_tag_relations'].filter(
          row => row.prompt_id !== id
        )
      }
    }

    return { changes: initialLength - memoryTables[tableName].length }
  }

  _runSelect(params) {
    const tableName = this._getTableName(this.sql, 'SELECT')
    if (!tableName || !memoryTables[tableName]) return []

    let results = [...memoryTables[tableName]]
    let paramIndex = 0

    // 特殊处理：getAllPromptTags 子查询计算 usage_count
    if (tableName === 'prompt_tags' && this.sql.includes('usage_count')) {
      const relations = memoryTables['prompt_tag_relations'] || []
      results = results.map(tag => ({
        ...tag,
        usage_count: relations.filter(r => r.tag_id === tag.id).length
      }))
    }

    // 特殊处理：JOIN prompt_tag_relations 查询
    if (this.sql.includes('JOIN prompt_tag_relations')) {
      const relations = memoryTables['prompt_tag_relations'] || []

      // getPromptTags: SELECT t.* FROM prompt_tags t JOIN ... WHERE ptr.prompt_id = ?
      if (this.sql.includes('ptr.prompt_id = ?')) {
        const promptId = params[0]
        const tagIds = relations.filter(r => r.prompt_id === promptId).map(r => r.tag_id)
        results = results.filter(tag => tagIds.includes(tag.id))
      }
      // getPrompts with tagIds: SELECT p.* FROM prompts p JOIN ... WHERE ptr.tag_id IN (?)
      else if (this.sql.includes('ptr.tag_id IN')) {
        // params 包含要筛选的 tagIds
        const filterTagIds = params.slice(0, params.length)  // 获取所有 tagId 参数
        const matchingPromptIds = relations
          .filter(r => filterTagIds.includes(r.tag_id))
          .map(r => r.prompt_id)
        results = results.filter(prompt => matchingPromptIds.includes(prompt.id))
      }
    }

    // WHERE 筛选
    if (this.sql.toUpperCase().includes('WHERE')) {
      results = results.filter(row => {
        // ptr.prompt_id = ? (用于 getPromptTags)
        if (this.sql.includes('ptr.prompt_id = ?')) {
          return true  // 已经在上面处理过了
        }

        // scope 筛选 - 支持字符串字面量和占位符两种形式
        // 注意：必须先检查 scope，因为 project_id = ? 包含子字符串 id = ?

        // 字面量形式: p.scope = 'global' 或 scope = 'global'
        if (this.sql.includes("scope = 'global'") || this.sql.includes("p.scope = 'global'")) {
          return row.scope === 'global'
        }
        // 字面量形式: p.scope = 'project' AND p.project_id = ?
        if (this.sql.includes("scope = 'project'") || this.sql.includes("p.scope = 'project'")) {
          if (this.sql.includes('project_id = ?') || this.sql.includes('p.project_id = ?')) {
            return row.scope === 'project' && row.project_id === params[0]
          }
          return row.scope === 'project'
        }
        // 占位符形式: scope = ?
        if (this.sql.includes('scope = ?')) {
          const scope = params[paramIndex]
          if (scope === 'all') return true
          if (!row.scope || row.scope === scope) {
            if (this.sql.includes('project_id = ?')) {
              return row.project_id === params[paramIndex + 1]
            }
            return row.scope === scope
          }
          return false
        }

        // id = ? (精确匹配，排除 prompt_id、tag_id、project_id)
        // 使用正则确保前面不是字母或下划线
        if (/(?<![a-z_])id = \?/i.test(this.sql)) {
          return row.id === params[paramIndex]
        }

        // prompt_id = ? AND tag_id = ?
        if (this.sql.includes('prompt_id = ?') && this.sql.includes('tag_id = ?')) {
          return row.prompt_id === params[0] && row.tag_id === params[1]
        }

        return true
      })
    }

    // ORDER BY
    if (this.sql.toUpperCase().includes('ORDER BY')) {
      const tableName = this._getTableName(this.sql, 'SELECT')

      results.sort((a, b) => {
        // 对于 prompt_tags 表：usage_count DESC, name ASC
        if (tableName === 'prompt_tags') {
          if ((b.usage_count || 0) !== (a.usage_count || 0)) {
            return (b.usage_count || 0) - (a.usage_count || 0)
          }
          return (a.name || '').localeCompare(b.name || '')
        }

        // 对于 prompts 表：is_favorite DESC, usage_count DESC, updated_at DESC
        if ((b.is_favorite || 0) !== (a.is_favorite || 0)) {
          return (b.is_favorite || 0) - (a.is_favorite || 0)
        }
        if ((b.usage_count || 0) !== (a.usage_count || 0)) {
          return (b.usage_count || 0) - (a.usage_count || 0)
        }
        // updated_at 可能是数字或字符串
        const aTime = typeof a.updated_at === 'number' ? a.updated_at : 0
        const bTime = typeof b.updated_at === 'number' ? b.updated_at : 0
        return bTime - aTime
      })
    }

    return results
  }
}

/**
 * Mock Database 类
 */
class MockDatabase {
  constructor() {
    this.isOpen = true
  }

  prepare(sql) {
    return new MockStatement(this, sql)
  }

  exec(sql) {
    // 解析 CREATE TABLE 语句
    const createTableRegex = /CREATE TABLE IF NOT EXISTS (\w+)/gi
    let match
    while ((match = createTableRegex.exec(sql)) !== null) {
      const tableName = match[1]
      if (!memoryTables[tableName]) {
        memoryTables[tableName] = []
        autoIncrements[tableName] = 1
      }
    }
    return this
  }

  transaction(fn) {
    return (...args) => fn(...args)
  }

  pragma(cmd) {
    // 忽略 pragma 命令
    return null
  }

  close() {
    this.isOpen = false
  }
}

// 注意：不使用 vi.mock('better-sqlite3')，因为它对 CommonJS require() 无效
// 而是通过依赖注入方式传入 MockDatabase

describe('SessionDatabase - Prompts', () => {
  let SessionDatabase
  let db

  beforeEach(async () => {
    setupTestDir()

    // 重置内存数据库
    resetMemoryDB()

    vi.resetModules()

    // 动态导入
    const module = await import('../../src/main/session-database.js')
    SessionDatabase = module.SessionDatabase

    // 使用依赖注入：传入 userDataPath 和 mock Database 构造函数
    db = new SessionDatabase({
      userDataPath: testTempDir,
      Database: MockDatabase  // 注入 mock，避免加载原生 better-sqlite3
    })
    db.init()
  })

  afterEach(() => {
    if (db && db.db) {
      db.db.close()
    }
  })

  afterAll(() => {
    cleanupTestDir()
  })

  // ========================================
  // Prompt CRUD Tests
  // ========================================

  describe('createPrompt', () => {
    it('应该创建全局提示词', () => {
      const prompt = db.createPrompt({
        name: '测试提示词',
        content: '这是测试内容',
        scope: 'global'
      })

      expect(prompt).toBeDefined()
      expect(prompt.id).toBeDefined()
      expect(prompt.name).toBe('测试提示词')
      expect(prompt.content).toBe('这是测试内容')
      expect(prompt.scope).toBe('global')
      expect(prompt.is_favorite).toBe(0)
      expect(prompt.usage_count).toBe(0)
    })

    it('应该创建带标签的提示词', () => {
      // 先创建标签
      const tag1 = db.createPromptTag('标签1', '#ff0000')
      const tag2 = db.createPromptTag('标签2', '#00ff00')

      const prompt = db.createPrompt({
        name: '带标签提示词',
        content: '内容',
        scope: 'global',
        tagIds: [tag1.id, tag2.id]
      })

      expect(prompt.tags).toBeDefined()
      expect(prompt.tags.length).toBe(2)
      expect(prompt.tags.map(t => t.name)).toContain('标签1')
      expect(prompt.tags.map(t => t.name)).toContain('标签2')
    })

    it('应该创建项目级提示词', () => {
      const prompt = db.createPrompt({
        name: '项目提示词',
        content: '内容',
        scope: 'project',
        project_id: 123
      })

      expect(prompt.scope).toBe('project')
      expect(prompt.project_id).toBe(123)
    })
  })

  describe('getPromptById', () => {
    it('应该获取提示词及其标签', () => {
      const tag = db.createPromptTag('测试标签', '#0000ff')
      const created = db.createPrompt({
        name: '测试',
        content: '内容',
        tagIds: [tag.id]
      })

      const prompt = db.getPromptById(created.id)

      expect(prompt).toBeDefined()
      expect(prompt.id).toBe(created.id)
      expect(prompt.tags.length).toBe(1)
      expect(prompt.tags[0].name).toBe('测试标签')
    })

    it('不存在的提示词应返回 undefined', () => {
      const prompt = db.getPromptById(99999)
      expect(prompt).toBeUndefined()
    })
  })

  describe('getPrompts', () => {
    beforeEach(() => {
      // 创建测试数据
      db.createPrompt({ name: '全局1', content: '内容', scope: 'global' })
      db.createPrompt({ name: '全局2', content: '内容', scope: 'global' })
      db.createPrompt({ name: '项目1', content: '内容', scope: 'project', project_id: 1 })
      db.createPrompt({ name: '项目2', content: '内容', scope: 'project', project_id: 2 })
    })

    it('应该获取所有提示词（scope=all）', () => {
      const prompts = db.getPrompts({ scope: 'all' })
      expect(prompts.length).toBe(4)
    })

    it('应该只获取全局提示词（scope=global）', () => {
      const prompts = db.getPrompts({ scope: 'global' })
      expect(prompts.length).toBe(2)
      expect(prompts.every(p => p.scope === 'global')).toBe(true)
    })

    it('应该只获取指定项目的提示词（scope=project）', () => {
      const prompts = db.getPrompts({ scope: 'project', projectId: 1 })
      expect(prompts.length).toBe(1)
      expect(prompts[0].name).toBe('项目1')
    })

    it('应该按标签筛选提示词', () => {
      const tag = db.createPromptTag('特殊标签', '#ff0000')
      db.createPrompt({ name: '带标签', content: '内容', tagIds: [tag.id] })

      const prompts = db.getPrompts({ tagIds: [tag.id] })
      expect(prompts.length).toBe(1)
      expect(prompts[0].name).toBe('带标签')
    })
  })

  describe('updatePrompt', () => {
    it('应该更新提示词基本信息', () => {
      const created = db.createPrompt({ name: '原名', content: '原内容' })

      const updated = db.updatePrompt(created.id, {
        name: '新名',
        content: '新内容'
      })

      expect(updated.name).toBe('新名')
      expect(updated.content).toBe('新内容')
    })

    it('应该更新提示词标签（全量替换）', () => {
      const tag1 = db.createPromptTag('标签1', '#ff0000')
      const tag2 = db.createPromptTag('标签2', '#00ff00')
      const tag3 = db.createPromptTag('标签3', '#0000ff')

      const created = db.createPrompt({
        name: '测试',
        content: '内容',
        tagIds: [tag1.id, tag2.id]
      })

      // 更新标签：移除 tag1, tag2，添加 tag3
      const updated = db.updatePrompt(created.id, {
        tagIds: [tag3.id]
      })

      expect(updated.tags.length).toBe(1)
      expect(updated.tags[0].name).toBe('标签3')
    })

    it('空字段更新应返回 null', () => {
      const created = db.createPrompt({ name: '测试', content: '内容' })
      const result = db.updatePrompt(created.id, {})
      expect(result).toBeNull()
    })
  })

  describe('deletePrompt', () => {
    it('应该删除提示词', () => {
      const created = db.createPrompt({ name: '待删除', content: '内容' })

      const result = db.deletePrompt(created.id)
      expect(result.success).toBe(true)

      const prompt = db.getPromptById(created.id)
      expect(prompt).toBeUndefined()
    })

    it('删除提示词应同时删除标签关联', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const created = db.createPrompt({
        name: '待删除',
        content: '内容',
        tagIds: [tag.id]
      })

      db.deletePrompt(created.id)

      // 标签本身应该还在
      const tags = db.getAllPromptTags()
      expect(tags.length).toBe(1)

      // 但关联应该被删除（通过 usage_count 验证）
      expect(tags[0].usage_count).toBe(0)
    })
  })

  describe('incrementPromptUsage', () => {
    it('应该增加使用次数', () => {
      const created = db.createPrompt({ name: '测试', content: '内容' })
      expect(created.usage_count).toBe(0)

      db.incrementPromptUsage(created.id)
      db.incrementPromptUsage(created.id)
      db.incrementPromptUsage(created.id)

      const prompt = db.getPromptById(created.id)
      expect(prompt.usage_count).toBe(3)
    })
  })

  describe('togglePromptFavorite', () => {
    it('应该切换收藏状态', () => {
      const created = db.createPrompt({ name: '测试', content: '内容' })
      expect(created.is_favorite).toBe(0)

      // 收藏
      let prompt = db.togglePromptFavorite(created.id)
      expect(prompt.is_favorite).toBe(1)

      // 取消收藏
      prompt = db.togglePromptFavorite(created.id)
      expect(prompt.is_favorite).toBe(0)
    })

    it('不存在的提示词应返回 null', () => {
      const result = db.togglePromptFavorite(99999)
      expect(result).toBeNull()
    })
  })

  // ========================================
  // Prompt Tag Tests
  // ========================================

  describe('createPromptTag', () => {
    it('应该创建标签', () => {
      const tag = db.createPromptTag('新标签', '#ff5500')

      expect(tag).toBeDefined()
      expect(tag.id).toBeDefined()
      expect(tag.name).toBe('新标签')
      expect(tag.color).toBe('#ff5500')
    })

    it('应该使用默认颜色', () => {
      const tag = db.createPromptTag('默认颜色标签')
      expect(tag.color).toBe('#1890ff')
    })
  })

  describe('getAllPromptTags', () => {
    it('应该获取所有标签及使用次数', () => {
      const tag1 = db.createPromptTag('标签1', '#ff0000')
      const tag2 = db.createPromptTag('标签2', '#00ff00')

      // 使用 tag1 两次
      db.createPrompt({ name: '提示词1', content: '内容', tagIds: [tag1.id] })
      db.createPrompt({ name: '提示词2', content: '内容', tagIds: [tag1.id, tag2.id] })

      const tags = db.getAllPromptTags()

      expect(tags.length).toBe(2)
      const t1 = tags.find(t => t.name === '标签1')
      const t2 = tags.find(t => t.name === '标签2')
      expect(t1.usage_count).toBe(2)
      expect(t2.usage_count).toBe(1)
    })

    it('应该按使用次数降序排列', () => {
      const tag1 = db.createPromptTag('少用', '#ff0000')
      const tag2 = db.createPromptTag('多用', '#00ff00')

      db.createPrompt({ name: '提示词1', content: '内容', tagIds: [tag2.id] })
      db.createPrompt({ name: '提示词2', content: '内容', tagIds: [tag2.id] })
      db.createPrompt({ name: '提示词3', content: '内容', tagIds: [tag1.id] })

      const tags = db.getAllPromptTags()

      expect(tags[0].name).toBe('多用')
      expect(tags[1].name).toBe('少用')
    })
  })

  describe('updatePromptTag', () => {
    it('应该更新标签名称', () => {
      const tag = db.createPromptTag('原名', '#ff0000')

      const updated = db.updatePromptTag(tag.id, { name: '新名' })

      expect(updated.name).toBe('新名')
      expect(updated.color).toBe('#ff0000') // 颜色不变
    })

    it('应该更新标签颜色', () => {
      const tag = db.createPromptTag('标签', '#ff0000')

      const updated = db.updatePromptTag(tag.id, { color: '#00ff00' })

      expect(updated.color).toBe('#00ff00')
    })

    it('空字段更新应返回 null', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const result = db.updatePromptTag(tag.id, {})
      expect(result).toBeNull()
    })
  })

  describe('deletePromptTag', () => {
    it('应该删除标签', () => {
      const tag = db.createPromptTag('待删除', '#ff0000')

      const result = db.deletePromptTag(tag.id)
      expect(result.success).toBe(true)

      const tags = db.getAllPromptTags()
      expect(tags.length).toBe(0)
    })

    it('删除标签应同时删除关联', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const prompt = db.createPrompt({
        name: '提示词',
        content: '内容',
        tagIds: [tag.id]
      })

      db.deletePromptTag(tag.id)

      // 提示词应该还在，但没有标签了
      const p = db.getPromptById(prompt.id)
      expect(p).toBeDefined()
      expect(p.tags.length).toBe(0)
    })
  })

  describe('addTagToPrompt / removeTagFromPrompt', () => {
    it('应该单独添加标签到提示词', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const prompt = db.createPrompt({ name: '提示词', content: '内容' })

      db.addTagToPrompt(prompt.id, tag.id)

      const p = db.getPromptById(prompt.id)
      expect(p.tags.length).toBe(1)
      expect(p.tags[0].name).toBe('标签')
    })

    it('应该单独从提示词移除标签', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const prompt = db.createPrompt({
        name: '提示词',
        content: '内容',
        tagIds: [tag.id]
      })

      db.removeTagFromPrompt(prompt.id, tag.id)

      const p = db.getPromptById(prompt.id)
      expect(p.tags.length).toBe(0)
    })

    it('重复添加标签应该忽略（INSERT OR IGNORE）', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const prompt = db.createPrompt({
        name: '提示词',
        content: '内容',
        tagIds: [tag.id]
      })

      // 再次添加同一标签，不应报错
      db.addTagToPrompt(prompt.id, tag.id)

      const p = db.getPromptById(prompt.id)
      expect(p.tags.length).toBe(1) // 仍然只有一个
    })
  })

  // ========================================
  // Edge Cases
  // ========================================

  describe('边界情况', () => {
    it('提示词排序：收藏 > 使用次数 > 更新时间', () => {
      const p1 = db.createPrompt({ name: '普通', content: '内容' })
      const p2 = db.createPrompt({ name: '多次使用', content: '内容' })
      const p3 = db.createPrompt({ name: '收藏', content: '内容' })

      // p2 使用 3 次
      db.incrementPromptUsage(p2.id)
      db.incrementPromptUsage(p2.id)
      db.incrementPromptUsage(p2.id)

      // p3 收藏
      db.togglePromptFavorite(p3.id)

      const prompts = db.getPrompts()

      // 收藏的排第一
      expect(prompts[0].name).toBe('收藏')
      // 使用次数多的排第二
      expect(prompts[1].name).toBe('多次使用')
      // 普通的排最后
      expect(prompts[2].name).toBe('普通')
    })

    it('空标签数组应该清除所有标签', () => {
      const tag = db.createPromptTag('标签', '#ff0000')
      const prompt = db.createPrompt({
        name: '提示词',
        content: '内容',
        tagIds: [tag.id]
      })

      // 更新为空数组（需要同时传递一个其他字段，因为 updatePrompt 要求至少有一个可更新字段）
      const updated = db.updatePrompt(prompt.id, { name: '提示词', tagIds: [] })

      expect(updated.tags.length).toBe(0)
    })
  })
})
