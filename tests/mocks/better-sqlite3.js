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
      const whereColumns = this._getWhereColumns()
      const setParamCount = this._getSetParamCount()
      const whereParams = params.slice(setParamCount, setParamCount + whereColumns.length)
      let changes = 0

      for (const row of table.rows) {
        const matches = whereColumns.length === 0
          ? row.id === params[params.length - 1]
          : whereColumns.every((column, index) => row[column] === whereParams[index])
        if (matches) {
          this._updateRowFromParams(row, params)
          changes++
        }
      }

      return { changes }
    }

    if (this.type === 'DELETE') {
      if (!table) return { changes: 0 }
      const initialLength = table.rows.length
      const whereColumns = this._getWhereColumns()

      if (whereColumns.length === 0) {
        const idParam = params[0]
        table.rows = table.rows.filter((row) => row.id !== idParam)
      } else {
        table.rows = table.rows.filter((row) => {
          const matches = whereColumns.every((column, index) => row[column] === params[index])
          return !matches
        })
      }

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
    const setMatch = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE/i)
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

  }

  _getSetParamCount() {
    const setMatch = this.sql.match(/SET\s+([\s\S]+?)\s+WHERE/i)
    if (!setMatch) return 0
    return (setMatch[1].match(/\?/g) || []).length
  }

  _getWhereColumns() {
    const whereMatch = this.sql.match(/WHERE\s+([\s\S]+?)(?:\s+ORDER\s+BY|\s+LIMIT|$)/i)
    if (!whereMatch) return []
    return [...whereMatch[1].matchAll(/(\w+)\s*=\s*\?/gi)].map((match) => match[1])
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
    const conditions = this._getWhereColumns().map((column) => [null, column])
    if (conditions.length === 0) return rows

    return rows.filter((row) => conditions.every((match, index) => row[match[1]] === params[index]))
  }

  _applyOrderBy(rows) {
    const orderMatch = this.sql.match(/ORDER\s+BY\s+(.+)$/i)
    if (!orderMatch) return rows

    const fields = orderMatch[1]
      .split(',')
      .map((item) => item.trim())
      .map((item) => {
        const [column, direction = 'ASC'] = item.split(/\s+/)
        return { column, direction: direction.toUpperCase() }
      })

    return rows.sort((a, b) => {
      for (const field of fields) {
        const av = a[field.column]
        const bv = b[field.column]
        if (av === bv) continue

        const result = typeof av === 'number' && typeof bv === 'number'
          ? av - bv
          : String(av || '').localeCompare(String(bv || ''))

        return field.direction === 'DESC' ? -result : result
      }
      return 0
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
