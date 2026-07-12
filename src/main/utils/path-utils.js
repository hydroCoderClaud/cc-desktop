/**
 * Path Utilities for Claude Code Desktop
 *
 * Handles encoding/decoding of project paths to match Claude CLI's directory naming convention.
 * Claude CLI encodes project paths by replacing special characters with '-':
 *   : \ / _ all become -
 *   C:\workspace\project -> C--workspace-project
 *   C:\workspace\aa_bb  -> C--workspace-aa-bb
 */

/**
 * Encode a project path to Claude's directory format
 * C:\workspace\develop\xxx -> C--workspace-develop-xxx
 * /home/user/project -> -home-user-project
 * C:\workspace\aa_bb -> C--workspace-aa-bb
 *
 * Note: : _ \ / all become -, so C:\ becomes C-- and _ becomes -
 * This matches Claude CLI's actual encoding behavior.
 */
function encodePath(projectPath) {
  return projectPath
    .replace(/:/g, '-')
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/_/g, '-')
    .replace(/ /g, '-')             // 空格 → -，匹配 CLI 行为
    .replace(/[^\x20-\x7E]/g, '-')  // 非 ASCII 字符 → -，匹配 CLI 行为
}

/**
 * Get project name from path (last segment)
 */
function getProjectName(projectPath) {
  const parts = projectPath.split(/[\\/]/)
  return parts[parts.length - 1] || projectPath
}

/**
 * 原子写入 JSON 文件（写临时文件后 rename，防止崩溃时损坏原文件）
 * @param {string} filePath - 目标文件路径
 * @param {*} data - 要序列化的数据
 */
function atomicWriteJson(filePath, data) {
  const fs = require('fs')
  const tmp = filePath + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  fs.renameSync(tmp, filePath)
}

module.exports = {
  encodePath,
  getProjectName,
  atomicWriteJson
}
