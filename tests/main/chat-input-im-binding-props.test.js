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

const sliceSource = (source, startMarker, endMarker) => {
  const start = source.indexOf(startMarker)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = source.indexOf(endMarker, start + startMarker.length)
  expect(end).toBeGreaterThan(start)
  return source.slice(start, end)
}

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
    expect(chatInputSource).toContain(':draft-images="attachedImages"')
    expect(toolbarSource).toContain('sessionTitle: { type: String, default: \'\' }')
    expect(toolbarSource).toContain('sessionImChannel: { type: String, default: null }')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'dingtalk\'')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'weixin\'')
    expect(toolbarSource).toContain('return !resolvedImBindingSource.value || resolvedImBindingSource.value === \'feishu\'')
  })

  it('keeps desktop slash commands enabled for IM-bound sessions', () => {
    const agentChatTabSource = fs.readFileSync(agentChatTabPath, 'utf-8')

    expect(agentChatTabSource).toContain(':slash-commands-supported="true"')
    expect(agentChatTabSource).toContain(':enable-slash-commands="hasActiveSession"')
    expect(agentChatTabSource).not.toContain('enableSlashCommands: !isExternalImChannel(props.sessionImChannel)')
  })

  it('preserves IM channel when opening persisted agent sessions as tabs', () => {
    const tabManagementSource = fs.readFileSync(tabManagementPath, 'utf-8')

    expect(tabManagementSource).toContain('existingTab.imChannel = agentSession.imChannel || null')
    expect(tabManagementSource).toContain('imChannel: agentSession.imChannel || null')
  })

  it('preserves project identity metadata when opening persisted agent sessions as tabs', () => {
    const tabManagementSource = fs.readFileSync(tabManagementPath, 'utf-8')

    expect(tabManagementSource).toContain('existingTab.cwdAuto = agentSession.cwdAuto === true')
    expect(tabManagementSource).toContain('existingTab.projectPath = agentSession.projectPath || existingTab.projectPath || null')
    expect(tabManagementSource).toContain('existingTab.projectKind = agentSession.projectKind || existingTab.projectKind || null')
    expect(tabManagementSource).toContain('cwdAuto: agentSession.cwdAuto === true')
    expect(tabManagementSource).toContain('projectPath: agentSession.projectPath || null')
    expect(tabManagementSource).toContain('projectKind: agentSession.projectKind || null')
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
    expect(toolbarSource).toContain('const collectOutboundImages = () => {')
    expect(toolbarSource).toContain("t('agent.imQuickSendSessionPrefix', { title: normalizeSessionTitle() })")
    expect(toolbarSource).toContain('text: buildOutboundImText(resolvedDraftText.value)')
    expect(toolbarSource).toContain('images: collectOutboundImages()')
  })

  it('clears the shared draft after a successful IM quick-send', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')
    const chatInputSource = fs.readFileSync(chatInputPath, 'utf-8')
    const weixinClickHandler = sliceSource(toolbarSource, 'const handleWeixinButtonClick = () => {', 'const toggleWeixinDropdown = () => {')
    const weixinSendHandler = sliceSource(toolbarSource, 'const sendWeixinQuickMessage = async () => {', 'const sendFeishuQuickMessage = async () => {')

    expect(toolbarSource).toContain("emit('clear')")
    expect(weixinClickHandler).not.toContain('requireDraftContent')
    expect(weixinClickHandler).toContain('toggleWeixinDropdown()')
    expect(weixinSendHandler).toContain('if (!requireDraftContent()) return')
    expect(chatInputSource).toContain('@clear="handleClear"')
    expect(chatInputSource).toContain("attachedImages.value = []")
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

  it('lets the shared toolbar react immediately when session IM channel changes', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(toolbarSource).toContain("watch(() => props.sessionImChannel, (nextChannel) => {")
    expect(toolbarSource).toContain("if (nextChannel !== 'dingtalk') {")
    expect(toolbarSource).toContain("if (nextChannel === 'dingtalk') {")
    expect(toolbarSource).toContain('void loadDingTalkTargets()')
    expect(toolbarSource).toContain('void loadWeixinTargets()')
    expect(toolbarSource).toContain('void loadFeishuTargets()')
    expect(toolbarSource).toContain('void loadEnterpriseWeixinTargets()')
  })

  it('loads enterprise weixin quick-send targets from the merged target list before falling back to contacts', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(toolbarSource).toContain('enterpriseWeixinApi?.listEnterpriseWeixinTargets')
    expect(toolbarSource).toContain('? enterpriseWeixinApi.listEnterpriseWeixinTargets()')
    expect(toolbarSource).toContain(': enterpriseWeixinApi?.listEnterpriseWeixinContacts')
  })

  it('supports editing enterprise weixin group local aliases inside the quick-send dropdown', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')
    const preloadSource = fs.readFileSync(path.resolve(__dirname, '../../src/preload/preload.js'), 'utf-8')
    const embeddedPanelSource = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue'), 'utf-8')

    expect(toolbarSource).toContain("const isEnterpriseWeixinChatTarget = (target) => target?.targetType === 'chat'")
    expect(toolbarSource).toContain("{{ t('agent.imQuickAliasEdit') }}")
    expect(toolbarSource).toContain("enterpriseWeixinApi?.renameEnterpriseWeixinKnownChat")
    expect(toolbarSource).toContain("const saveEnterpriseWeixinAlias = async (target) => {")
    expect(preloadSource).toContain("renameEnterpriseWeixinKnownChat: (payload) => ipcRenderer.invoke('enterprise-weixin:renameKnownChat', payload)")
    expect(embeddedPanelSource).toContain("renameEnterpriseWeixinKnownChat: api.renameEnterpriseWeixinKnownChat?.bind(api)")
  })

  it('supports editing dingtalk group local aliases inside the quick-send dropdown', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')
    const preloadSource = fs.readFileSync(path.resolve(__dirname, '../../src/preload/preload.js'), 'utf-8')
    const embeddedPanelSource = fs.readFileSync(path.resolve(__dirname, '../../src/renderer/components/embedded-agent/EmbeddedAgentPanel.vue'), 'utf-8')

    expect(toolbarSource).toContain("const isDingTalkChatTarget = (target) => target?.targetType === 'chat'")
    expect(toolbarSource).toContain("dingtalkApi?.renameDingTalkKnownChat")
    expect(toolbarSource).toContain("const saveDingTalkAlias = async (target) => {")
    expect(toolbarSource).toContain("{{ t('agent.imQuickAliasEdit') }}")
    expect(preloadSource).toContain("renameDingTalkKnownChat: (payload) => ipcRenderer.invoke('dingtalk:renameKnownChat', payload)")
    expect(embeddedPanelSource).toContain("renameDingTalkKnownChat: api.renameDingTalkKnownChat?.bind(api)")
  })

  it('dispatches an IM binding refresh event after quick-send binding changes', () => {
    const toolbarSource = fs.readFileSync(chatInputToolbarPath, 'utf-8')

    expect(toolbarSource).toContain("const notifyImBindingUpdated = () => {")
    expect(toolbarSource).toContain("window.dispatchEvent(new CustomEvent('agent-session:im-binding-updated'")
    expect(toolbarSource).toContain('notifyImBindingUpdated()')
  })
})
