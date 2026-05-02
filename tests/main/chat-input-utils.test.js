import { describe, it, expect } from 'vitest'

import {
  isLikelyAbsolutePathInput,
  getLeadingSlashInputKind,
  shouldOpenSlashPanel,
  shouldBlockAsUnavailableSlash
} from '../../src/renderer/utils/chat-input-utils.js'

describe('chat input utils', () => {
  it('treats mac absolute paths as non-slash input', () => {
    expect(isLikelyAbsolutePathInput('/Users/mac/Documents')).toBe(true)
    expect(isLikelyAbsolutePathInput('/Volumes/Data/test.png')).toBe(true)
    expect(isLikelyAbsolutePathInput('/tmp/demo')).toBe(true)
    expect(isLikelyAbsolutePathInput('/Applications')).toBe(true)
    expect(isLikelyAbsolutePathInput('/Users/mac/My Project')).toBe(true)
  })

  it('does not treat slash commands as absolute paths', () => {
    expect(isLikelyAbsolutePathInput('/help')).toBe(false)
    expect(shouldOpenSlashPanel({ text: '/help', slashCommandsSupported: true })).toBe(true)
    expect(shouldBlockAsUnavailableSlash({ text: '/help', slashUnavailable: true })).toBe(true)
  })

  it('keeps plain slash commands available when they contain args', () => {
    expect(shouldBlockAsUnavailableSlash({ text: '/init project', slashUnavailable: true })).toBe(true)
  })

  it('does not open slash panel for absolute paths', () => {
    expect(shouldOpenSlashPanel({ text: '/Users/mac/Documents', slashCommandsSupported: true })).toBe(false)
    expect(shouldBlockAsUnavailableSlash({ text: '/Users/mac/Documents', slashUnavailable: true })).toBe(false)
    expect(shouldOpenSlashPanel({ text: '/Users/mac/My Project', slashCommandsSupported: true })).toBe(false)
    expect(shouldBlockAsUnavailableSlash({ text: '/Users/mac/My Project', slashUnavailable: true })).toBe(false)
  })

  it('classifies leading slash input consistently', () => {
    expect(getLeadingSlashInputKind('/help')).toBe('slash-command')
    expect(getLeadingSlashInputKind('/init project')).toBe('slash-command')
    expect(getLeadingSlashInputKind('/Users/mac/Documents')).toBe('absolute-path')
    expect(getLeadingSlashInputKind('/Users/mac/My Project summarize this folder')).toBe('absolute-path')
    expect(getLeadingSlashInputKind('hello')).toBe('plain')
  })

  it('recognizes more absolute-path roots and keeps them out of slash flow', () => {
    expect(getLeadingSlashInputKind('/private/tmp/report.txt')).toBe('absolute-path')
    expect(getLeadingSlashInputKind('/usr/local/bin/node --version')).toBe('absolute-path')
    expect(getLeadingSlashInputKind('/var/log/system.log tail this')).toBe('absolute-path')
    expect(shouldOpenSlashPanel({ text: '/private/tmp/report.txt', slashCommandsSupported: true })).toBe(false)
    expect(shouldBlockAsUnavailableSlash({ text: '/usr/local/bin/node --version', slashUnavailable: true })).toBe(false)
  })

  it('still treats bare slash-like commands as slash commands', () => {
    expect(getLeadingSlashInputKind('/')).toBe('slash-command')
    expect(getLeadingSlashInputKind('/unknown')).toBe('slash-command')
    expect(shouldOpenSlashPanel({ text: '/', slashCommandsSupported: true })).toBe(true)
    expect(shouldBlockAsUnavailableSlash({ text: '/unknown', slashUnavailable: true })).toBe(true)
  })
})
