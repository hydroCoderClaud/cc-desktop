import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const slashCommandsPath = path.resolve(__dirname, '../../src/renderer/utils/slash-commands.js')
const localCommandsPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentLocalCommands.js')
const chatInputPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInput.vue')
const toolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')

describe('session app chat wiring', () => {
  it('registers a built-in /session-app command', () => {
    const source = fs.readFileSync(slashCommandsPath, 'utf-8')

    expect(source).toContain("name: '/session-app'")
    expect(source).toContain("description: t('agent.cmdSessionApp')")
  })

  it('creates and submits Session App drafts through local commands', () => {
    const source = fs.readFileSync(localCommandsPath, 'utf-8')

    expect(source).toContain("toolName: 'SessionAppDraft'")
    expect(source).toContain('const submitSessionAppDraft = async ({ messageId, draft, behavior = {} }) => {')
    expect(source).toContain('window.electronAPI.createSessionApp')
    expect(source).toContain('window.electronAPI.updateSessionApp')
    expect(source).toContain('window.electronAPI.launchSessionApp')
    expect(source).toContain("if (lower === '/session-app')")
  })

  it('routes the toolbar Session App action through ChatInput into AgentChatTab', () => {
    const toolbarSource = fs.readFileSync(toolbarPath, 'utf-8')
    const inputSource = fs.readFileSync(chatInputPath, 'utf-8')
    const chatTabSource = fs.readFileSync(agentChatTabPath, 'utf-8')

    expect(toolbarSource).toContain("@click=\"emit('session-app')\"")
    expect(inputSource).toContain('@session-app="handleSessionApp"')
    expect(inputSource).toContain("emit('session-app', inputText.value.trim())")
    expect(chatTabSource).toContain('@session-app="handleSessionAppDraftCreate"')
    expect(chatTabSource).toContain("toolName === 'SessionAppDraft'")
  })

  it('opens launched Session App conversations in MainContent', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain('@session-app-launched="handleSessionAppLaunched"')
    expect(source).toContain('const handleSessionAppLaunched = async (session) => {')
    expect(source).toContain('ensureAgentTab(session)')
    expect(source).toContain('reloadAgentConversations?.()')
    expect(source).toContain('onSessionAppOpenConversationRequested')
    expect(source).toContain('await switchMode(AppMode.AGENT)')
    expect(source).toContain('handleAgentSelected(session)')
  })
})
