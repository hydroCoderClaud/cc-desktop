function normalizeSlashCommandName(name) {
  const raw = typeof name === 'string' ? name.trim() : ''
  if (!raw) return ''
  return raw.startsWith('/') ? raw : `/${raw}`
}

export function parseSlashCommand(input) {
  const raw = typeof input === 'string' ? input.trim() : ''
  if (!raw.startsWith('/')) {
    return {
      isSlashCommand: false,
      raw,
      commandName: '',
      args: '',
      lowerName: ''
    }
  }

  const withoutSlash = raw.slice(1).trim()
  if (!withoutSlash) {
    return {
      isSlashCommand: true,
      raw,
      commandName: '/',
      args: '',
      lowerName: '/'
    }
  }

  const [head, ...rest] = withoutSlash.split(/\s+/)
  const commandName = normalizeSlashCommandName(head)
  return {
    isSlashCommand: true,
    raw,
    commandName,
    args: rest.join(' ').trim(),
    lowerName: commandName.toLowerCase()
  }
}

export function normalizeSlashCommandEntry(entry, defaults = {}) {
  if (!entry) return null

  if (typeof entry === 'string') {
    const name = normalizeSlashCommandName(entry)
    if (!name) return null
    return {
      name,
      description: '',
      argumentHint: '',
      source: defaults.source || 'sdk',
      icon: defaults.icon || 'zap',
      autoSubmit: defaults.autoSubmit ?? false
    }
  }

  if (typeof entry !== 'object') return null

  const name = normalizeSlashCommandName(entry.name)
  if (!name) return null

  return {
    name,
    description: typeof entry.description === 'string'
      ? entry.description
      : (typeof entry.desc === 'string' ? entry.desc : ''),
    argumentHint: typeof entry.argumentHint === 'string'
      ? entry.argumentHint
      : (typeof entry.argument_hint === 'string' ? entry.argument_hint : ''),
    source: entry.source || defaults.source || 'sdk',
    icon: entry.icon || defaults.icon || 'zap',
    autoSubmit: entry.autoSubmit ?? defaults.autoSubmit ?? false
  }
}

export function normalizeSlashCommands(entries, defaults = {}) {
  if (!Array.isArray(entries)) return []

  const normalized = []
  const seen = new Set()

  for (const entry of entries) {
    const command = normalizeSlashCommandEntry(entry, defaults)
    if (!command) continue
    const key = command.name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    normalized.push(command)
  }

  return normalized
}

export function mergeSlashCommands(...lists) {
  const merged = []
  const seen = new Set()

  for (const list of lists) {
    for (const command of normalizeSlashCommands(list)) {
      const key = command.name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      merged.push(command)
    }
  }

  return merged
}

export function filterSlashCommands(commands, query) {
  const normalizedQuery = typeof query === 'string'
    ? query.trim().toLowerCase().replace(/^\//, '')
    : ''

  const commandList = normalizeSlashCommands(commands)
  if (!normalizedQuery) return commandList

  return commandList.filter(command => {
    const haystack = [
      command.name.toLowerCase().replace(/^\//, ''),
      command.description.toLowerCase(),
      command.argumentHint.toLowerCase()
    ]
    return haystack.some(item => item.includes(normalizedQuery))
  })
}

export function shouldAutoSubmitSlashCommand(command) {
  const normalized = normalizeSlashCommandEntry(command)
  if (!normalized) return false
  return Boolean(normalized.autoSubmit && !normalized.argumentHint)
}

export function buildBuiltinSlashCommands(t) {
  return normalizeSlashCommands([
    {
      name: '/compact',
      icon: 'compress',
      description: t('agent.cmdCompact'),
      source: 'hybrid',
      autoSubmit: true
    },
    {
      name: '/cost',
      icon: 'info',
      description: t('agent.cmdCost'),
      source: 'local',
      autoSubmit: true
    },
    {
      name: '/status',
      icon: 'terminal',
      description: t('agent.cmdStatus'),
      source: 'local',
      autoSubmit: true
    },
    {
      name: '/help',
      icon: 'info',
      description: t('agent.cmdHelp'),
      source: 'local',
      autoSubmit: true
    },
    {
      name: '/clear',
      icon: 'close',
      description: t('agent.cmdClear'),
      source: 'local',
      autoSubmit: true
    }
  ])
}
