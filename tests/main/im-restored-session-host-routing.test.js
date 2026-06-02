import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')
const notebookWorkspacePath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/NotebookWorkspace.vue')
const embeddedAgentPanelPath = path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue')

describe('IM restored session host routing', () => {
  it('classifies restored sessions and routes notebook or embedded hosts before falling back to agent tabs', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain('const getSessionHostKind = (session) => {')
    expect(source).toContain("if (session.type === 'notebook') return 'notebook'")
    expect(source).toContain("if (session.clientType === 'embedded') return 'embedded'")
    expect(source).toContain('const routingSession = await window.electronAPI?.getAgentSessionRouting?.(sessionId).catch(() => null)')
    expect(source).toContain('const resolvedSession = session || routingSession')
    expect(source).toContain('const restored = await restoreNotebookSessionHost(resolvedSession)')
    expect(source).toContain('const restored = await restoreEmbeddedSessionHost(resolvedSession)')
    expect(source).toContain('const tab = ensureAgentTab({')
  })

  it('exposes a notebook restore hook by session id', () => {
    const source = fs.readFileSync(notebookWorkspacePath, 'utf-8')

    expect(source).toContain('const restoreSessionById = async (sessionId) => {')
    expect(source).toContain('const notebooks = await window.electronAPI.notebookList()')
    expect(source).toContain('await loadNotebook(targetNotebook)')
    expect(source).toContain('defineExpose({')
    expect(source).toContain('restoreSessionById')
  })

  it('consumes embedded restore requests and applies the requested session after mount', () => {
    const source = fs.readFileSync(embeddedAgentPanelPath, 'utf-8')

    expect(source).toContain('const consumeRequestedRestoreSessionId = () => {')
    expect(source).toContain('const restoreRequestedSession = async () => {')
    expect(source).toContain('const requestedSession = await agentApi.value.getAgentSession(requestedSessionId).catch(() => null)')
    expect(source).toContain('applySession(activeSession)')
    expect(source).toContain('await restoreRequestedSession()')
  })
})
