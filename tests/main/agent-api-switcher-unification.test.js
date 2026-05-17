import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chatInputToolbarPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInputToolbar.vue')
const chatInputPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/ChatInput.vue')
const agentChatTabPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/AgentChatTab.vue')
const notebookChatPanelPath = path.resolve(__dirname, '../../src/renderer/pages/notebook/components/ChatPanel.vue')
const embeddedAgentPanelPath = path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue')
const agentLeftContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/AgentLeftContent.vue')
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')

describe('agent api switcher unification', () => {
  it('hosts the shared api profile switcher in ChatInputToolbar', () => {
    const source = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(source).toContain('showApiProfileSwitcher')
    expect(source).toContain('api-profile-selector')
    expect(source).toContain('api-profile-dropdown')
    expect(source).toContain("'api-profile-selected'")
    expect(source).toContain('toggleApiDropdown')
    expect(source).toContain('selectApiProfile')
  })

  it('passes api profile switcher props through ChatInput into AgentChatTab', () => {
    const chatInputSource = fs.readFileSync(chatInputPath, 'utf-8')
    const agentChatTabSource = fs.readFileSync(agentChatTabPath, 'utf-8')

    expect(chatInputSource).toContain(':api-profile-id="apiProfileId"')
    expect(chatInputSource).toContain(':api-profiles="apiProfiles"')
    expect(chatInputSource).toContain(':show-api-profile-switcher="showApiProfileSwitcher"')
    expect(chatInputSource).toContain("@api-profile-selected=\"$emit('api-profile-selected', $event)\"")

    expect(agentChatTabSource).toContain(':show-api-profile-switcher="Boolean(props.sessionId)"')
    expect(agentChatTabSource).toContain(':api-profile-disabled="isStreaming || !props.sessionId"')
    expect(agentChatTabSource).toContain('@api-profile-selected="handleApiProfileSelected"')
    expect(agentChatTabSource).not.toContain("if (props.sessionType !== 'chat') return")
    expect(agentChatTabSource).toContain('watch(() => props.apiProfileId, (apiProfileId) => {')
    expect(agentChatTabSource).toContain('watch(() => props.modelId, (modelId) => {')
    expect(agentChatTabSource).not.toContain('watch(() => [props.apiProfileId, props.modelId],')
    expect(agentChatTabSource).toContain('switchAgentApiProfile')
  })

  it('removes duplicated notebook and embedded api switchers and leaves left list as display only', () => {
    const notebookSource = fs.readFileSync(notebookChatPanelPath, 'utf-8')
    const embeddedSource = fs.readFileSync(embeddedAgentPanelPath, 'utf-8')
    const leftSource = fs.readFileSync(agentLeftContentPath, 'utf-8')
    const mainContentSource = fs.readFileSync(mainContentPath, 'utf-8')

    expect(notebookSource).not.toContain('class="api-switcher"')
    expect(notebookSource).toContain(':show-api-profile-switcher="true"')
    expect(notebookSource).toContain(':api-profile-disabled="isStreaming || !props.sessionId"')
    expect(notebookSource).toContain('@api-profile-selected="handleApiProfileSelected"')

    expect(embeddedSource).not.toContain('embedded-profile-switcher')
    expect(embeddedSource).toContain('@api-profile-selected="handleApiProfileSelected"')

    expect(leftSource).not.toContain('toggleProfileDropdown')
    expect(leftSource).not.toContain('handleSwitchProfile')
    expect(leftSource).not.toContain('profile-dropdown')
    expect(leftSource).toContain('class="profile-badge"')
    expect(leftSource).toContain('const updateConversationRuntime = ({ sessionId, apiProfileId, modelId } = {}) => {')
    expect(leftSource).toContain('conversations.value.splice(index, 1, {')

    expect(mainContentSource).not.toContain('@agent-profile-updated=')
    expect(mainContentSource).toContain('@api-profile-selected="handleAgentProfileUpdated"')
    expect(mainContentSource).toContain('leftPanelRef.value?.updateAgentConversationRuntime?.({')
  })
})
