/**
 * Notebook 共享工具函数
 * 提取自 notebook-source-mixin.js 和 notebook-achievement-mixin.js
 */

const path = require('path')

/**
 * 清理文件名，移除非法字符
 * @param {string} filename - 原始文件名
 * @param {string} fallback - 默认名称
 * @returns {string} 清理后的文件名
 */
function sanitizeChatBaseName(filename, fallback) {
  const raw = (filename || '').trim()
  const ext = path.extname(raw)
  const base = ext ? raw.slice(0, -ext.length) : raw
  const normalized = (base || fallback || 'chat')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
  return normalized || fallback || 'chat'
}

/**
 * 生成聊天时间戳（用于文件名）
 * @returns {string} ISO 格式时间戳（去除冒号和点）
 */
function buildChatTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
}

/**
 * 确保文件名在目录中唯一（存在则添加 _1, _2 后缀）
 * @param {string} targetDir - 目标目录
 * @param {string} fileName - 原始文件名
 * @returns {string} 唯一文件名
 */
function ensureUniqueNotebookFile(targetDir, fileName) {
  const parsedName = path.parse(fileName)
  let uniqueName = fileName
  let counter = 1
  while (pathExists(targetDir, uniqueName)) {
    uniqueName = `${parsedName.name}_${counter}${parsedName.ext}`
    counter++
  }
  return uniqueName
}

/**
 * 保存二进制文件到笔记本目录
 * @param {string} targetDir - 目标目录
 * @param {string} fileName - 文件名
 * @param {Buffer} buffer - 文件内容
 * @returns {{ fileName: string, fullPath: string }}
 */
function saveNotebookBinaryFile(targetDir, fileName, buffer) {
  const fs = require('fs')
  fs.mkdirSync(targetDir, { recursive: true })
  const uniqueName = ensureUniqueNotebookFile(targetDir, fileName)
  const finalPath = path.join(targetDir, uniqueName)
  fs.writeFileSync(finalPath, buffer)
  return { fileName: uniqueName, fullPath: finalPath }
}

/**
 * 保存文本文件到笔记本目录
 * @param {string} targetDir - 目标目录
 * @param {string} fileName - 文件名
 * @param {string} content - 文件内容
 * @returns {{ fileName: string, fullPath: string }}
 */
function saveNotebookTextFile(targetDir, fileName, content) {
  const fs = require('fs')
  fs.mkdirSync(targetDir, { recursive: true })
  const uniqueName = ensureUniqueNotebookFile(targetDir, fileName)
  const finalPath = path.join(targetDir, uniqueName)
  fs.writeFileSync(finalPath, content, 'utf-8')
  return { fileName: uniqueName, fullPath: finalPath }
}

/**
 * 路径存在检查（辅助函数，方便测试 mock）
 * @private
 */
function pathExists(dir, fileName) {
  const fs = require('fs')
  return fs.existsSync(path.join(dir, fileName))
}

/**
 * 标准化笔记本内部路径（统一使用 Unix 风格 / ）
 * @param {string} p - 路径
 * @returns {string} 标准化后的路径
 */
function normalizeNotebookPath(p) {
  return p.replace(/\\/g, '/')
}

module.exports = {
  sanitizeChatBaseName,
  buildChatTimestamp,
  ensureUniqueNotebookFile,
  saveNotebookBinaryFile,
  saveNotebookTextFile,
  normalizeNotebookPath
}
