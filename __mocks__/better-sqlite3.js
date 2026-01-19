/**
 * better-sqlite3 Mock 实现
 *
 * 用于单元测试，模拟 SQLite 数据库行为
 * 解决 Electron/Node.js 原生模块版本不兼容问题
 */

// 全局内存存储
let memoryTables = {}
let autoIncrements = {}

/**
 * 重置内存数据库 (供测试使用)
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
    const patterns = {
      'INSERT': /INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i,
      'UPDATE': /UPDATE\s+(\w+)/i,
      'DELETE': /DELETE\s+FROM\s+(\w+)/i,
      'SELECT': /FROM\s+(\w+)/i
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

    // 简单的 WHERE 处理
    if (this.sql.includes('prompt_id = ?') && this.sql.includes('tag_id = ?')) {
      const promptId = params[0]
      const tagId = params[1]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => !(row.prompt_id === promptId && row.tag_id === tagId)
      )
    } else if (this.sql.includes('prompt_id = ?')) {
      const promptId = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => row.prompt_id !== promptId
      )
    } else if (this.sql.includes('tag_id = ?')) {
      const tagId = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(
        row => row.tag_id !== tagId
      )
    } else {
      // WHERE id = ?
      const id = params[0]
      memoryTables[tableName] = memoryTables[tableName].filter(row => row.id !== id)
    }

    return { changes: initialLength - memoryTables[tableName].length }
  }

  _runSelect(params) {
    const tableName = this._getTableName(this.sql, 'SELECT')
    if (!tableName || !memoryTables[tableName]) return []

    let results = [...memoryTables[tableName]]
    let paramIndex = 0

    // WHERE 筛选
    if (this.sql.toUpperCase().includes('WHERE')) {
      results = results.filter(row => {
        // id = ?
        if (this.sql.includes('p.id = ?') || (this.sql.includes('id = ?') && !this.sql.includes('prompt_id'))) {
          return row.id === params[paramIndex]
        }
        // prompt_id = ? AND tag_id = ?
        if (this.sql.includes('prompt_id = ?') && this.sql.includes('tag_id = ?')) {
          return row.prompt_id === params[0] && row.tag_id === params[1]
        }
        // prompt_id = ?
        if (this.sql.includes('prompt_id = ?')) {
          return row.prompt_id === params[0]
        }
        // scope 处理
        if (this.sql.includes("scope = 'all'")) {
          return true
        }
        if (this.sql.includes("scope = 'global'")) {
          return row.scope === 'global' || !row.scope
        }
        if (this.sql.includes("scope = 'project'")) {
          if (this.sql.includes('project_id = ?')) {
            return row.scope === 'project' && row.project_id === params[paramIndex]
          }
          return row.scope === 'project'
        }
        return true
      })
    }

    // ORDER BY
    if (this.sql.toUpperCase().includes('ORDER BY')) {
      results.sort((a, b) => {
        // is_favorite DESC
        if ((b.is_favorite || 0) !== (a.is_favorite || 0)) {
          return (b.is_favorite || 0) - (a.is_favorite || 0)
        }
        // usage_count DESC
        if ((b.usage_count || 0) !== (a.usage_count || 0)) {
          return (b.usage_count || 0) - (a.usage_count || 0)
        }
        // updated_at DESC
        return (b.updated_at || '').localeCompare(a.updated_at || '')
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

// 导出 (CommonJS 格式，因为 session-database.js 使用 require)
function Database(filename) {
  return new MockDatabase()
}

// 附加 resetMemoryDB 供测试使用
Database.resetMemoryDB = resetMemoryDB

module.exports = Database
module.exports.default = Database
module.exports.resetMemoryDB = resetMemoryDB
