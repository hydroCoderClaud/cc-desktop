/**
 * Path Utilities for Claude Code Desktop
 *
 * Handles encoding/decoding of project paths to match Claude CLI's directory naming convention.
 * Claude CLI encodes project paths by replacing special characters:
 *   C:\workspace\project -> C--workspace-project
 */

const path = require('path')

/**
 * Encode a project path to Claude's directory format
 * C:\workspace\develop\xxx -> C--workspace-develop-xxx
 * /home/user/project -> -home-user-project
 *
 * Note: : becomes - and \ or / becomes -, so C:\ becomes C--
 */
function encodePath(projectPath) {
  return projectPath
    .replace(/:/g, '-')
    .replace(/\\/g, '-')
    .replace(/\//g, '-')
}

/**
 * Decode Claude's encoded path back to original
 * C--workspace-develop-xxx -> C:\workspace\develop\xxx (on Windows)
 * -home-user-project -> /home/user/project (on Unix)
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
 * Get project name from path (last segment)
 */
function getProjectName(projectPath) {
  const parts = projectPath.split(/[\\/]/)
  return parts[parts.length - 1] || projectPath
}

module.exports = {
  encodePath,
  decodePath,
  getProjectName
}
