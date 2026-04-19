const fs = require('fs')
const os = require('os')
const path = require('path')

async function parseMarketplaceInput(input) {
  const trimmed = String(input || '').trim()
  if (!trimmed) {
    return { error: 'Marketplace source is required' }
  }

  const sshMatch = trimmed.match(/^([a-zA-Z0-9._-]+@[^:]+:.+?(?:\.git)?)(#(.+))?$/)
  if (sshMatch?.[1]) {
    const url = sshMatch[1]
    const ref = sshMatch[3]
    return ref ? { source: 'git', url, ref } : { source: 'git', url }
  }

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    const fragmentMatch = trimmed.match(/^([^#]+)(#(.+))?$/)
    const urlWithoutFragment = fragmentMatch?.[1] || trimmed
    const ref = fragmentMatch?.[3]

    if (urlWithoutFragment.endsWith('.git') || urlWithoutFragment.includes('/_git/')) {
      return ref
        ? { source: 'git', url: urlWithoutFragment, ref }
        : { source: 'git', url: urlWithoutFragment }
    }

    try {
      const parsed = new URL(urlWithoutFragment)
      if (parsed.hostname === 'github.com' || parsed.hostname === 'www.github.com') {
        const match = parsed.pathname.match(/^\/([^/]+\/[^/]+?)(\/|\.git|$)/)
        if (match?.[1]) {
          const gitUrl = urlWithoutFragment.endsWith('.git')
            ? urlWithoutFragment
            : `${urlWithoutFragment}.git`
          return ref
            ? { source: 'git', url: gitUrl, ref }
            : { source: 'git', url: gitUrl }
        }
      }
    } catch {
      // Fall through to plain URL handling.
    }

    return { source: 'url', url: urlWithoutFragment }
  }

  const isWindows = process.platform === 'win32'
  const isWindowsPath =
    isWindows &&
    (trimmed.startsWith('.\\') ||
      trimmed.startsWith('..\\') ||
      /^[a-zA-Z]:[/\\]/.test(trimmed))

  if (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('~') ||
    isWindowsPath
  ) {
    const resolvedPath = path.resolve(
      trimmed.startsWith('~') ? trimmed.replace(/^~/, os.homedir()) : trimmed
    )

    try {
      const stats = fs.statSync(resolvedPath)
      if (stats.isFile()) {
        if (resolvedPath.endsWith('.json')) {
          return { source: 'file', path: resolvedPath }
        }
        return {
          error: `File path must point to a .json file (marketplace.json), but got: ${resolvedPath}`
        }
      }
      if (stats.isDirectory()) {
        return { source: 'directory', path: resolvedPath }
      }
      return { error: `Path is neither a file nor a directory: ${resolvedPath}` }
    } catch (err) {
      const code = err && err.code ? err.code : 'UNKNOWN'
      return {
        error:
          code === 'ENOENT'
            ? `Path does not exist: ${resolvedPath}`
            : `Cannot access path: ${resolvedPath} (${code})`
      }
    }
  }

  if (trimmed.includes('/') && !trimmed.startsWith('@')) {
    if (trimmed.includes(':')) return null
    const fragmentMatch = trimmed.match(/^([^#@]+)(?:[#@](.+))?$/)
    const repo = fragmentMatch?.[1] || trimmed
    const ref = fragmentMatch?.[2]
    return ref ? { source: 'github', repo, ref } : { source: 'github', repo }
  }

  return null
}

function formatMarketplaceSource(source) {
  if (!source) return ''
  switch (source.source) {
    case 'github':
      return source.repo
    case 'git':
      return source.url
    case 'url':
      return source.url
    case 'file':
    case 'directory':
      return source.path
    default:
      return ''
  }
}

module.exports = {
  parseMarketplaceInput,
  formatMarketplaceSource
}
