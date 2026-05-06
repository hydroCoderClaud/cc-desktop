const fs = require('fs')
const os = require('os')
const path = require('path')

function normalizeDeveloperClaudeSource(value) {
  return value === 'system' ? 'system' : 'bundled'
}

function resolveBundledClaudeBinaryPath(
  platform = os.platform(),
  arch = os.arch(),
  resolvePackage = require.resolve,
  fileExists = fs.existsSync
) {
  const pathImpl = platform === 'win32' ? path.win32 : path.posix
  const packageName = `@anthropic-ai/claude-agent-sdk-${platform}-${arch}`
  const binaryName = platform === 'win32' ? 'claude.exe' : 'claude'

  try {
    const packageJsonPath = resolvePackage(`${packageName}/package.json`)
    const packageDir = pathImpl.dirname(packageJsonPath)
    const bundledPath = pathImpl.join(packageDir, binaryName)
    const unpackedPath = bundledPath.includes('app.asar') && !bundledPath.includes('app.asar.unpacked')
      ? bundledPath.replace(/app\.asar/g, 'app.asar.unpacked')
      : null
    const candidates = []

    // In packaged Electron apps, fs.existsSync() can succeed for app.asar paths even though
    // the native binary must be executed from app.asar.unpacked.
    if (unpackedPath) {
      candidates.push(unpackedPath)
    }
    candidates.push(bundledPath)

    for (const candidate of candidates) {
      if (candidate.includes('app.asar') && !candidate.includes('app.asar.unpacked')) {
        continue
      }
      if (fileExists(candidate)) {
        return candidate
      }
    }
  } catch (error) {
    console.warn(`[ClaudeExecutablePath] Failed to resolve bundled Claude binary from ${packageName}: ${error.message}`)
  }

  return null
}

function resolveClaudeCodeExecutablePath(options = {}) {
  const source = normalizeDeveloperClaudeSource(options.source)
  if (source === 'system') {
    return 'claude'
  }

  return resolveBundledClaudeBinaryPath(
    options.platform,
    options.arch,
    options.resolvePackage,
    options.fileExists
  )
}

module.exports = {
  normalizeDeveloperClaudeSource,
  resolveBundledClaudeBinaryPath,
  resolveClaudeCodeExecutablePath
}
