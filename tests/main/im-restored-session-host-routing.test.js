import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')
const notebookWorkspacePath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/NotebookWorkspace.vue')
const embeddedAgentPanelPath = path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue')

describe('IM restored session host routing', () => {
  it('uses the shared host router before falling back to agent tabs', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain("import { createImSessionHostRouter } from '@utils/im-session-host-router'")
    expect(source).toContain('const { restoreSpecializedHost } = createImSessionHostRouter({')
    expect(source).toContain('const { session: resolvedSession, restored } = await restoreSpecializedHost(sessionId)')
    expect(source).toContain('const tab = ensureAgentTab({')
    expect(source).toContain('const messageHandlerName = `on${meta.listenerPrefix}MessageReceived`')
    expect(source).toContain('await restoreSpecializedHost(data.sessionId)')
  })

  it('exposes a notebook restore hook by session id', () => {
    const source = fs.readFileSync(notebookWorkspacePath, 'utf-8')

    expect(source).toContain('const restoreSessionById = async (sessionId) => {')
    expect(source).toContain('const notebooks = await window.electronAPI.notebookList()')
    expect(source).toContain('return loadNotebook(targetNotebook)')
    expect(source).toContain('Notebook session mapping is unavailable: ${normalizedSessionId}')
    expect(source).toContain('defineExpose({')
    expect(source).toContain('restoreSessionById')
  })

  it('consumes embedded restore requests and applies the requested session after mount', () => {
    const source = fs.readFileSync(embeddedAgentPanelPath, 'utf-8')

    expect(source).toContain('const consumeRequestedRestoreSessionId = () => {')
    expect(source).toContain('const restoreRequestedSession = async () => {')
    expect(source).toContain('const requestedSession = await agentApi.value.getAgentSession(requestedSessionId).catch(() => null)')
    expect(source).toContain('applySession(activeSession)')
    expect(source).toContain('const restoredRequestedSession = await restoreRequestedSession()')
    expect(source).toContain('if (restoredRequestedSession) {')
    expect(source).not.toContain('await restoreRequestedSession()\n})')
  })
})
