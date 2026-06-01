import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chatInputPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInput.vue')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const chatInputToolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')
const tabManagementPath = path.resolve(__dirname, '../../src/renderer/composables/useTabManagement.js')
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')
const notebookChatPanelPath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/ChatPanel.vue')

describe('chat input IM binding props', () => {
  it('passes session IM channel from the active tab into the toolbar', () => {
    const agentChatTabSource = fs.readFileSync(agentChatTabPath, 'utf-8')
    const chatInputSource = fs.readFileSync(chatInputPath, 'utf-8')
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(agentChatTabSource).toContain(':session-im-channel="props.sessionImChannel || null"')
    expect(agentChatTabSource).toContain(':session-title="props.sessionTitle"')
    expect(chatInputSource).toContain('sessionImChannel:')
    expect(chatInputSource).toContain('sessionTitle:')
    expect(chatInputSource).toContain(':session-title="sessionTitle"')
    expect(chatInputSource).toContain(':session-im-channel="sessionImChannel"')
    expect(toolbarSource).toContain('sessionTitle: { type: String, default: \'\' }')
    expect(toolbarSource).toContain('sessionImChannel: { type: String, default: null }')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'dingtalk\'')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'weixin\'')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'feishu\'')
  })

  it('preserves IM channel when opening persisted agent sessions as tabs', () => {
    const tabManagementSource = fs.readFileSync(tabManagementPath, 'utf-8')

    expect(tabManagementSource).toContain('existingTab.imChannel = agentSession.imChannel || null')
    expect(tabManagementSource).toContain('imChannel: agentSession.imChannel || null')
  })

  it('passes IM channel when opening a tab from external IM session-created events', () => {
    const mainContentSource = fs.readFileSync(mainContentPath, 'utf-8')

    expect(mainContentSource).toContain(':session-title="tab.title"')
    expect(mainContentSource).toContain('const tab = ensureAgentTab({')
    expect(mainContentSource).toContain('imChannel: imType,')
  })

  it('prefixes all toolbar quick-send IM messages with the current session label', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(toolbarSource).toContain('const buildOutboundImText = (rawText) => {')
    expect(toolbarSource).toContain("t('agent.imQuickSendSessionPrefix', { title: normalizeSessionTitle() })")
    expect(toolbarSource).toContain('text: buildOutboundImText(dingtalkText.value)')
    expect(toolbarSource).toContain('text: buildOutboundImText(weixinText.value)')
    expect(toolbarSource).toContain('text: buildOutboundImText(feishuText.value)')
    expect(toolbarSource).toContain('text: buildOutboundImText(enterpriseWeixinText.value)')
  })

  it('adds an IM unbind action to all bound quick-send dropdowns', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(toolbarSource).toContain("{{ t('agent.imQuickUnbind') }}")
    expect(toolbarSource).toContain('const confirmUnbindImTarget = async () => {')
    expect(toolbarSource).toContain('const unbindDingTalkTarget = async () => {')
    expect(toolbarSource).toContain('const unbindWeixinTarget = async () => {')
    expect(toolbarSource).toContain('const unbindFeishuTarget = async () => {')
    expect(toolbarSource).toContain('const unbindEnterpriseWeixinTarget = async () => {')
    expect(toolbarSource).toContain('unbindSessionDingTalkTarget')
    expect(toolbarSource).toContain('unbindSessionWeixinTarget')
    expect(toolbarSource).toContain('unbindSessionFeishuTarget')
    expect(toolbarSource).toContain('unbindSessionEnterpriseWeixinTarget')
  })

  it('passes notebook session binding state into the shared toolbar and registers all IM listeners', () => {
    const notebookSource = fs.readFileSync(notebookChatPanelPath, 'utf-8')

    expect(notebookSource).toContain(':session-title="currentSessionTitle"')
    expect(notebookSource).toContain(':session-source="currentSessionSource"')
    expect(notebookSource).toContain(':session-im-channel="currentSessionImChannel"')
    expect(notebookSource).toContain('setupExternalImMessageListeners()')
    expect(notebookSource).not.toContain('setupWeixinListeners()')
  })
})
