import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const useAgentChatPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentChat.js')
const useAgentLocalCommandsPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentLocalCommands.js')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')
const leftPanelPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/LeftPanel.vue')

describe('agent /clear session recreation wiring', () => {
  it('routes /clear through the local command handler instead of clearing messages locally', () => {
    const source = fs.readFileSync(useAgentChatPath, 'utf-8')
    const localCommandSource = fs.readFileSync(useAgentLocalCommandsPath, 'utf-8')

    expect(source).toContain("if (parsedSlashCommand.lowerName === '/clear')")
    expect(source).toContain('return await handleLocalSlashCommand(parsedSlashCommand)')
    expect(localCommandSource).toContain("if (lower === '/clear')")
    expect(localCommandSource).toContain('await options.onClearRequested()')
    expect(source).not.toContain('Agent 模式：仅清空前端显示')
    expect(source).not.toContain("messages.value = []")
  })

  it('emits a clear-session request from AgentChatTab', () => {
    const source = fs.readFileSync(agentChatTabPath, 'utf-8')

    expect(source).toContain("'request-clear-session'")
    expect(source).toContain('onClearRequested: () => {')
    expect(source).toContain("emit('request-clear-session')")
  })

  it('recreates the agent session from MainContent and swaps tabs', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain('@request-clear-session="handleAgentClearSession(tab.sessionId)"')
    expect(source).toContain('const handleAgentClearSession = async (sessionId) => {')
    expect(source).toContain('clearAndRecreateAgentSession({ sessionId })')
    expect(source).toContain('closeAgentTabFully(oldTab)')
    expect(source).toContain('ensureAgentTab(result.session)')
  })

  it('exposes an agent conversation reload hook on LeftPanel', () => {
    const source = fs.readFileSync(leftPanelPath, 'utf-8')

    expect(source).toContain('reloadAgentConversations: () => agentLeftContentRef.value?.loadConversations?.()')
  })
})
