/**
 * Path Utilities for Claude Code Desktop
 *
 * Handles encoding/decoding of project paths to match Claude CLI's directory naming convention.
 * Claude CLI encodes project paths by replacing special characters with '-':
 *   : \ / _ all become -
 *   C:\workspace\project -> C--workspace-project
 *   C:\workspace\aa_bb  -> C--workspace-aa-bb
 */

const path = require('path')

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
}

/**
 * Decode Claude's encoded path back to original
 * C--workspace-develop-xxx -> C:\workspace\develop\xxx (on Windows)
 * -home-user-project -> /home/user/project (on Unix)
 *
 * WARNING: This function is LOSSY - cannot correctly decode paths where
 * directory names originally contained '-' or '_', since both are encoded as '-'.
 * For example: C:\workspace\cc-desktop -> C--workspace-cc-desktop -> C:\workspace\cc\desktop (WRONG!)
 * For example: C:\workspace\aa_bb -> C--workspace-aa-bb -> C:\workspace\aa\bb (WRONG!)
 * Use smartDecodePath() for accurate decoding with filesystem validation.
 */
function decodePath(encodedPath) {
  // Split by single dash and filter out empty parts (from double dashes)
  const parts = encodedPath.split('-').filter(p => p !== '')

  if (process.platform === 'win32') {
    // First part is drive letter (e.g., C)
    const drive = parts[0] + ':'
    const rest = parts.slice(1).join('\\')
    return drive + '\\' + rest
  } else {
    // Unix paths start with /
    return '/' + parts.join('/')
  }
}

/**
 * Smart decode Claude's encoded path by validating against filesystem
 * Handles paths containing '-' or '_' correctly by trying different segment combinations
 * with both '-' and '_' as joiners (since CLI encodes both to '-').
 *
 * @param {string} encodedPath - Claude encoded path (e.g., C--workspace-cc-desktop)
 * @returns {string|null} Valid filesystem path, or null if not found
 */
function smartDecodePath(encodedPath) {
  const fs = require('fs')

  const parts = encodedPath.split('-').filter(p => p !== '')

  if (parts.length === 0) return null

  if (process.platform === 'win32') {
    // Windows: first part is drive letter
    const drive = parts[0] + ':'
    const restParts = parts.slice(1)

    if (restParts.length === 0) {
      return fs.existsSync(drive + '\\') ? drive + '\\' : null
    }

    return findValidPath(drive, restParts, '\\', fs)
  } else {
    // Unix: starts with /
    return findValidPath('', parts, '/', fs)
  }
}

/**
 * Recursively find valid path by trying different segment combinations
 * Handles both '-' and '_' as possible original separators within directory names,
 * since CLI encodes both to '-'.
 *
 * @param {string} basePath - Current base path
 * @param {string[]} remainingParts - Remaining path segments to process
 * @param {string} sep - Path separator
 * @param {object} fs - fs module
 * @returns {string|null} Valid path or null
 */
function findValidPath(basePath, remainingParts, sep, fs) {
  if (remainingParts.length === 0) {
    return fs.existsSync(basePath) ? basePath : null
  }

  // Try different ways to combine segments
  // Start with more segments combined (longer directory names)
  for (let i = remainingParts.length; i >= 1; i--) {
    const subParts = remainingParts.slice(0, i)

    // Try different joiners: '-' (original hyphen) and '_' (original underscore)
    // Both were encoded to '-' by CLI, so we need to try both
    const joiners = ['-', '_']
    for (const joiner of joiners) {
      const segment = subParts.join(joiner)
      const newPath = basePath + sep + segment

      if (fs.existsSync(newPath)) {
        if (i === remainingParts.length) {
          return newPath
        }
        const result = findValidPath(newPath, remainingParts.slice(i), sep, fs)
        if (result) {
          return result
        }
      }
    }
  }

  return null
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
  decodePath,
  smartDecodePath,
  getProjectName,
  atomicWriteJson
}
