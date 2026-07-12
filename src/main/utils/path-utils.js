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
const path = require('path')

function encodePath(projectPath) {
  return projectPath
    .replace(/:/g, '-')
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
    .replace(/_/g, '-')
    .replace(/ /g, '-')             // 空格 → -，匹配 CLI 行为
    .replace(/[^\x20-\x7E]/g, '-')  // 非 ASCII 字符 → -，匹配 CLI 行为
}

function normalizeProjectPath(projectPath, platform = process.platform) {
  if (typeof projectPath !== 'string' || projectPath.length === 0) {
    throw new Error('Project path must be a non-empty string')
  }
  if (projectPath.includes('\0')) {
    throw new Error('Project path must not contain NUL bytes')
  }

  if (platform === 'win32') {
    return normalizeWin32ProjectPath(projectPath)
  }

  return normalizePosixProjectPath(projectPath)
}

function normalizeWin32ProjectPath(projectPath) {
  let candidate = projectPath.replace(/\//g, '\\')

  if (candidate.startsWith('\\\\?\\UNC\\')) {
    candidate = `\\\\${candidate.slice('\\\\?\\UNC\\'.length)}`
  } else if (candidate.startsWith('\\\\?\\')) {
    candidate = candidate.slice('\\\\?\\'.length)
  }

  if (candidate.startsWith('\\\\.\\') || candidate.startsWith('\\\\?\\')) {
    throw new Error(`Unsupported Windows project path namespace: ${projectPath}`)
  }

  const isDriveAbsolute = /^[A-Za-z]:\\/.test(candidate)
  const isUncAbsolute = /^\\\\[^\\]+\\[^\\]+(?:\\|$)/.test(candidate)
  if (!isDriveAbsolute && !isUncAbsolute) {
    throw new Error(`Project path must be an absolute Windows path: ${projectPath}`)
  }

  return stripTrailingSeparators(path.win32.normalize(candidate), path.win32)
}

function normalizePosixProjectPath(projectPath) {
  if (!path.posix.isAbsolute(projectPath)) {
    throw new Error(`Project path must be an absolute POSIX path: ${projectPath}`)
  }

  return stripTrailingSeparators(path.posix.normalize(projectPath), path.posix)
}

function stripTrailingSeparators(projectPath, pathModule) {
  const root = pathModule.parse(projectPath).root
  let normalized = projectPath
  while (normalized.length > root.length && /[\\/]$/.test(normalized)) {
    normalized = normalized.slice(0, -1)
  }
  return normalized
}

function buildProjectPathKey(projectPath, platform = process.platform) {
  const normalizedPath = normalizeProjectPath(projectPath, platform)
  if (platform === 'win32') {
    return `win32:${normalizedPath.replace(/\\/g, '/').toLowerCase()}`
  }
  return `posix:${normalizedPath}`
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
  normalizeProjectPath,
  buildProjectPathKey,
  getProjectName,
  atomicWriteJson
}
