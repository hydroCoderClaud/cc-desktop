import { describe, it, expect } from 'vitest'

import {
  buildBuiltinSlashCommands,
  filterSlashCommands,
  mergeSlashCommands,
  normalizeSlashCommands,
  parseSlashCommand,
  shouldAutoSubmitSlashCommand
} from '../../src/renderer/utils/slash-commands.js'

describe('slash command utils', () => {
  const t = (key) => key

  it('parses slash command name and args', () => {
    expect(parseSlashCommand('/compact now')).toEqual({
      isSlashCommand: true,
      raw: '/compact now',
      commandName: '/compact',
      args: 'now',
      lowerName: '/compact'
    })

    expect(parseSlashCommand('hello')).toEqual({
      isSlashCommand: false,
      raw: 'hello',
      commandName: '',
      args: '',
      lowerName: ''
    })
  })

  it('normalizes sdk command objects and strings', () => {
    expect(normalizeSlashCommands([
      'review',
      { name: 'memory', description: 'Open memory', argumentHint: '<query>' }
    ], {
      source: 'sdk',
      icon: 'zap'
    })).toEqual([
      {
        name: '/review',
        description: '',
        argumentHint: '',
        source: 'sdk',
        icon: 'zap',
        autoSubmit: false
      },
      {
        name: '/memory',
        description: 'Open memory',
        argumentHint: '<query>',
        source: 'sdk',
        icon: 'zap',
        autoSubmit: false
      }
    ])
  })

  it('merges builtin and sdk commands without duplicates', () => {
    const builtins = buildBuiltinSlashCommands(t)
    const merged = mergeSlashCommands(
      builtins,
      [
        { name: 'help', description: 'sdk help' },
        { name: 'memory', description: 'Memory tools' }
      ]
    )

    expect(merged.find(command => command.name === '/help')?.source).toBe('local')
    expect(merged.find(command => command.name === '/schedule')?.argumentHint).toBe('[prompt]')
    expect(merged.find(command => command.name === '/memory')?.description).toBe('Memory tools')
  })

  it('filters commands by name, description and argument hint', () => {
    const commands = normalizeSlashCommands([
      { name: 'memory', description: 'Browse memory', argumentHint: '<query>' },
      { name: 'review', description: 'Review current diff' }
    ])

    expect(filterSlashCommands(commands, '/mem')).toHaveLength(1)
    expect(filterSlashCommands(commands, 'diff')).toHaveLength(1)
    expect(filterSlashCommands(commands, 'query')).toHaveLength(1)
  })

  it('only auto-submits commands that explicitly opt in', () => {
    expect(shouldAutoSubmitSlashCommand({
      name: '/help',
      autoSubmit: true
    })).toBe(true)

    expect(shouldAutoSubmitSlashCommand({
      name: '/memory',
      autoSubmit: false
    })).toBe(false)

    expect(shouldAutoSubmitSlashCommand({
      name: '/review',
      autoSubmit: true,
      argumentHint: '<pr>'
    })).toBe(false)
  })
})
