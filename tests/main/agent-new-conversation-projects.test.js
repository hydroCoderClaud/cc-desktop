import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const repoRoot = path.resolve(__dirname, '../..')
const modalPath = path.join(
  repoRoot,
  'src/renderer/pages/main/components/agent/AgentNewConversationModal.vue'
)

describe('Agent new conversation project picker', () => {
  it('loads recent project choices from projects instead of historical sessions', () => {
    const source = fs.readFileSync(modalPath, 'utf-8')

    expect(source).toContain('window.electronAPI?.getProjects')
    expect(source).toContain('window.electronAPI.getProjects(false)')
    expect(source).not.toContain('listAgentSessions')
    expect(source).not.toContain('getSessionImChannel')
  })
})
