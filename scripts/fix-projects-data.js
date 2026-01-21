/**
 * 修复 projects 表数据
 * 用于修复因迁移时 SELECT * 导致的列错位问题
 */

const Database = require('better-sqlite3')
const path = require('path')
const fs = require('fs')
const os = require('os')

// 获取数据库路径
function getDbPath() {
  const appName = 'claude-code-desktop'
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', appName, 'sessions.db')
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', appName, 'sessions.db')
  } else {
    return path.join(os.homedir(), '.config', appName, 'sessions.db')
  }
}

// 智能解码路径
function smartDecodePath(encodedPath) {
  const parts = encodedPath.split('-').filter(p => p !== '')
  if (parts.length === 0) return null

  if (process.platform === 'win32') {
    const drive = parts[0] + ':'
    const restParts = parts.slice(1)
    if (restParts.length === 0) {
      return fs.existsSync(drive + '\\') ? drive + '\\' : null
    }
    return findValidPath(drive, restParts, '\\')
  } else {
    return findValidPath('', parts, '/')
  }
}

function findValidPath(basePath, remainingParts, sep) {
  if (remainingParts.length === 0) {
    return fs.existsSync(basePath) ? basePath : null
  }

  for (let i = remainingParts.length; i >= 1; i--) {
    const segment = remainingParts.slice(0, i).join('-')
    const newPath = basePath + sep + segment

    if (fs.existsSync(newPath)) {
      if (i === remainingParts.length) {
        return newPath
      }
      const result = findValidPath(newPath, remainingParts.slice(i), sep)
      if (result) {
        return result
      }
    }
  }
  return null
}

// 主函数
function fixProjectsData() {
  const dbPath = getDbPath()

  console.log('数据库路径:', dbPath)

  if (!fs.existsSync(dbPath)) {
    console.error('数据库文件不存在!')
    process.exit(1)
  }

  // 备份数据库
  const backupPath = dbPath + '.backup.' + Date.now()
  fs.copyFileSync(dbPath, backupPath)
  console.log('已备份数据库到:', backupPath)

  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  try {
    // 获取所有项目
    const projects = db.prepare('SELECT * FROM projects').all()
    console.log(`\n找到 ${projects.length} 个项目\n`)

    let fixedCount = 0

    for (const project of projects) {
      console.log(`---\n项目 ID: ${project.id}`)
      console.log(`  当前 name: ${project.name}`)
      console.log(`  当前 path: ${project.path}`)
      console.log(`  encoded_path: ${project.encoded_path}`)

      // 检查 name 是否看起来像数字（损坏的数据）
      const nameIsNumeric = /^\d+$/.test(String(project.name))
      const pathExists = project.path && fs.existsSync(project.path)

      if (nameIsNumeric || !pathExists) {
        console.log('  -> 需要修复!')

        // 从 encoded_path 解析正确的路径
        const correctPath = smartDecodePath(project.encoded_path)

        if (correctPath) {
          const correctName = path.basename(correctPath)

          console.log(`  修复 path: ${correctPath}`)
          console.log(`  修复 name: ${correctName}`)

          db.prepare(`
            UPDATE projects
            SET path = ?, name = ?, updated_at = ?
            WHERE id = ?
          `).run(correctPath, correctName, Date.now(), project.id)

          fixedCount++
        } else {
          console.log(`  警告: 无法从 encoded_path 解析正确路径，目录可能不存在`)
        }
      } else {
        console.log('  -> 数据正常')
      }
    }

    console.log(`\n修复完成! 共修复 ${fixedCount} 个项目`)

  } catch (err) {
    console.error('修复失败:', err)
    // 恢复备份
    console.log('正在恢复备份...')
    fs.copyFileSync(backupPath, dbPath)
    console.log('已恢复备份')
  } finally {
    db.close()
  }
}

// 运行
fixProjectsData()
