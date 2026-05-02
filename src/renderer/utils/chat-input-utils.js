const KNOWN_ABSOLUTE_PATH_ROOTS = new Set([
  '/Applications',
  '/Library',
  '/System',
  '/Users',
  '/Volumes',
  '/bin',
  '/etc',
  '/opt',
  '/private',
  '/sbin',
  '/tmp',
  '/usr',
  '/var'
])

export function isLikelyAbsolutePathInput(text) {
  if (typeof text !== 'string') return false

  const value = text.trim()
  if (!value.startsWith('/')) return false
  if (value === '/') return false

  if (KNOWN_ABSOLUTE_PATH_ROOTS.has(value)) return true

  const secondSlashIndex = value.indexOf('/', 1)
  if (secondSlashIndex === -1) return false

  const rootSegment = value.slice(0, secondSlashIndex)
  return KNOWN_ABSOLUTE_PATH_ROOTS.has(rootSegment)
}

export function shouldOpenSlashPanel({ text, slashCommandsSupported }) {
  if (!slashCommandsSupported || typeof text !== 'string') return false
  if (!text.startsWith('/')) return false
  if (text.includes(' ')) return false
  if (isLikelyAbsolutePathInput(text)) return false

  return true
}

export function shouldBlockAsUnavailableSlash({ text, slashUnavailable }) {
  if (!slashUnavailable || typeof text !== 'string') return false
  if (!text.startsWith('/')) return false
  if (text.includes(' ') && !isLikelyAbsolutePathInput(text)) return true
  if (isLikelyAbsolutePathInput(text)) return false

  return true
}
