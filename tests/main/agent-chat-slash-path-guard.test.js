import fs from 'fs'
import path from 'path'
import { describe, it, expect } from 'vitest'

const useAgentChatPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentChat.js')

describe('useAgentChat slash path guard', () => {
  it('does not treat every leading slash input as a slash command', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')

    expect(source).toContain("getLeadingSlashInputKind(trimmed) === 'slash-command'")
    expect(source).not.toContain("if (trimmed && !trimmed.startsWith('/'))")
    expect(source).not.toContain("userMessages.length === 1 && trimmed && !trimmed.startsWith('/')")
  })

  it('only sends an explicit model when the user changed it', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')

    expect(source).toContain("if (selectedModelChangeSource !== 'user')")
    expect(source).toContain("selectedModelChangeSource = 'user'")
  })
})
