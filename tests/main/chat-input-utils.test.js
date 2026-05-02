import { describe, it, expect } from 'vitest'

import {
  isLikelyAbsolutePathInput,
  shouldOpenSlashPanel,
  shouldBlockAsUnavailableSlash
} from '../../src/renderer/utils/chat-input-utils.js'

describe('chat input utils', () => {
  it('treats mac absolute paths as non-slash input', () => {
    expect(isLikelyAbsolutePathInput('/Users/mac/Documents')).toBe(true)
    expect(isLikelyAbsolutePathInput('/Volumes/Data/test.png')).toBe(true)
    expect(isLikelyAbsolutePathInput('/tmp/demo')).toBe(true)
    expect(isLikelyAbsolutePathInput('/Applications')).toBe(true)
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
  })
})
