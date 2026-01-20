/**
 * better-sqlite3 Mock 实现
 * 用于单元测试，模拟 SQLite 数据库行为
 */

// 内存数据存储
class InMemoryDatabase {
  constructor() {
    this.tables = {}
    this.isOpen = true
  }

  // 准备 SQL 语句
  prepare(sql) {
    return new Statement(this, sql)
  }

  // 执行多条语句
  exec(sql) {
    // 简单解析 CREATE TABLE 语句
    const createTableRegex = /CREATE TABLE IF NOT EXISTS (\w+)/gi
    let match
    while ((match = createTableRegex.exec(sql)) !== null) {
      const tableName = match[1]
      if (!this.tables[tableName]) {
        this.tables[tableName] = {
          rows: [],
          autoIncrement: 1
        }
      }
    }
    return this
  }

  // 开启事务
  transaction(fn) {
    return (...args) => {
      return fn(...args)
    }
  }

  // 关闭数据库
  close() {
    this.isOpen = false
  }

  // pragma 命令
  pragma(cmd) {
    if (cmd.startsWith('user_version')) {
      if (cmd.includes('=')) {
        // 设置版本
        const version = parseInt(cmd.split('=')[1].trim())
        this._userVersion = version
        return
      }
      // 获取版本
      return this._userVersion || 0
    }
    return null
  }
}

// SQL 语句
class Statement {
  constructor(db, sql) {
    this.db = db
    this.sql = sql.trim()
    this._parseSQL()
  }

  _parseSQL() {
    const sql = this.sql.toUpperCase()
    if (sql.startsWith('INSERT')) {
      this.type = 'INSERT'
      this._parseInsert()
    } else if (sql.startsWith('SELECT')) {
      this.type = 'SELECT'
      this._parseSelect()
    } else if (sql.startsWith('UPDATE')) {
      this.type = 'UPDATE'
      this._parseUpdate()
    } else if (sql.startsWith('DELETE')) {
      this.type = 'DELETE'
      this._parseDelete()
    } else if (sql.startsWith('CREATE')) {
      this.type = 'CREATE'
    } else {
      this.type = 'UNKNOWN'
    }
  }

  _parseInsert() {
    // INSERT INTO table_name (col1, col2) VALUES (?, ?)
    const match = this.sql.match(/INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(\w+)/i)
    if (match) {
      this.tableName = match[1]
    }
  }

  _parseSelect() {
    // SELECT ... FROM table_name ...
    const match = this.sql.match(/FROM\s+(\w+)/i)
    if (match) {
      this.tableName = match[1]
    }
  }

  _parseUpdate() {
    // UPDATE table_name SET ...
    const match = this.sql.match(/UPDATE\s+(\w+)/i)
    if (match) {
      this.tableName = match[1]
    }
  }

  _parseDelete() {
    // DELETE FROM table_name ...
    const match = this.sql.match(/DELETE\s+FROM\s+(\w+)/i)
    if (match) {
      this.tableName = match[1]
    }
  }

  // 获取单行
  get(...params) {
    if (this.type === 'SELECT') {
      return this._executeSelect(params)[0]
    }
    return undefined
  }

  // 获取所有行
  all(...params) {
    if (this.type === 'SELECT') {
      return this._executeSelect(params)
    }
    return []
  }

  // 执行语句
  run(...params) {
    const table = this.db.tables[this.tableName]

    if (this.type === 'INSERT') {
      if (!table) {
        this.db.tables[this.tableName] = { rows: [], autoIncrement: 1 }
      }
      const t = this.db.tables[this.tableName]
      const id = t.autoIncrement++

      // 解析列名和值
      const row = this._buildRowFromParams(params, id)
      t.rows.push(row)

      return { changes: 1, lastInsertRowid: id }
    }

    if (this.type === 'UPDATE') {
      if (!table) return { changes: 0 }

      // 简单的 WHERE id = ? 处理
      const idParam = params[params.length - 1]
      let changes = 0

      for (const row of table.rows) {
        if (row.id === idParam) {
          this._updateRowFromParams(row, params)
          changes++
        }
      }

      return { changes }
    }

    if (this.type === 'DELETE') {
      if (!table) return { changes: 0 }

      const idParam = params[0]
      const initialLength = table.rows.length
      table.rows = table.rows.filter(row => row.id !== idParam)

      return { changes: initialLength - table.rows.length }
    }

    return { changes: 0 }
  }

  _buildRowFromParams(params, id) {
    // 解析 INSERT 语句中的列名
    const colMatch = this.sql.match(/\(([^)]+)\)\s*VALUES/i)
    if (!colMatch) {
      return { id, ...params[0] }
    }

    const columns = colMatch[1].split(',').map(c => c.trim())
    const row = { id }

    columns.forEach((col, index) => {
      if (params[index] !== undefined) {
        row[col] = params[index]
      }
    })

    return row
  }

  _updateRowFromParams(row, params) {
    // 解析 SET 子句
    const setMatch = this.sql.match(/SET\s+(.+?)\s+WHERE/i)
    if (!setMatch) return

    const setParts = setMatch[1].split(',').map(s => s.trim())
    let paramIndex = 0

    for (const part of setParts) {
      const [col] = part.split('=').map(s => s.trim())
      if (part.includes('?')) {
        row[col] = params[paramIndex++]
      } else if (part.includes('+')) {
        // 处理 column = column + 1 的情况
        row[col] = (row[col] || 0) + 1
      }
    }

    // 更新 updated_at
    row.updated_at = new Date().toISOString()
  }

  _executeSelect(params) {
    const table = this.db.tables[this.tableName]
    if (!table) return []

    let results = [...table.rows]

    // 简单的 WHERE 处理
    if (this.sql.toUpperCase().includes('WHERE')) {
      results = this._applyWhere(results, params)
    }

    // 简单的 ORDER BY 处理
    if (this.sql.toUpperCase().includes('ORDER BY')) {
      results = this._applyOrderBy(results)
    }

    // 简单的 JOIN 处理 - 返回带 tags 的结果
    if (this.sql.toUpperCase().includes('LEFT JOIN')) {
      results = this._applyJoin(results)
    }

    return results
  }

  _applyWhere(rows, params) {
    // 简单的 id = ? 匹配
    if (this.sql.includes('id = ?')) {
      const idParam = params[0]
      return rows.filter(row => row.id === idParam)
    }

    // scope 筛选
    if (this.sql.includes('scope = ?')) {
      const scope = params[0]
      rows = rows.filter(row => row.scope === scope)
    }

    // project_id 筛选
    if (this.sql.includes('project_id = ?')) {
      const projectId = params[params.length - 1]
      rows = rows.filter(row => row.project_id === projectId)
    }

    return rows
  }

  _applyOrderBy(rows) {
    // 默认按 is_favorite DESC, usage_count DESC, updated_at DESC
    return rows.sort((a, b) => {
      // 收藏优先
      if ((b.is_favorite || 0) !== (a.is_favorite || 0)) {
        return (b.is_favorite || 0) - (a.is_favorite || 0)
      }
      // 使用次数
      if ((b.usage_count || 0) !== (a.usage_count || 0)) {
        return (b.usage_count || 0) - (a.usage_count || 0)
      }
      // 更新时间
      return (b.updated_at || '').localeCompare(a.updated_at || '')
    })
  }

  _applyJoin(rows) {
    // 简化处理：为每行添加空 tags 数组
    return rows.map(row => ({ ...row, tags: row.tags || [] }))
  }
}

// 导出 mock
function Database(filename, options) {
  return new InMemoryDatabase()
}

Database.prototype = InMemoryDatabase.prototype

export default Database
export { Database }
