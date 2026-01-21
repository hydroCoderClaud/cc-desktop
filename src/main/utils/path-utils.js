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
 *
 * WARNING: This function is LOSSY - cannot correctly decode paths containing '-'
 * For example: C:\workspace\cc-desktop -> C--workspace-cc-desktop -> C:\workspace\cc\desktop (WRONG!)
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
 * Handles paths containing '-' correctly by trying different segment combinations
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
  // Start with more segments combined (longer directory names with '-')
  for (let i = remainingParts.length; i >= 1; i--) {
    // Combine first i parts into one segment
    const segment = remainingParts.slice(0, i).join('-')
    const newPath = basePath + sep + segment

    if (fs.existsSync(newPath)) {
      if (i === remainingParts.length) {
        // All remaining parts consumed, found it
        return newPath
      }
      // Continue with remaining parts
      const result = findValidPath(newPath, remainingParts.slice(i), sep, fs)
      if (result) {
        return result
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

module.exports = {
  encodePath,
  decodePath,
  smartDecodePath,
  getProjectName
}
