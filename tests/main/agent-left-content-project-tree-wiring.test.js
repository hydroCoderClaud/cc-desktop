import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentLeftContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/AgentLeftContent.vue')

describe('AgentLeftContent project tree expansion', () => {
  it('only auto-expands a newly active session once', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain('const pendingActiveProjectExpansionId = ref(null)')
    expect(source).toContain('pendingActiveProjectExpansionId.value = sessionId || null')
    expect(source).toContain('watch([projectConversationGroups, externalImConversations], ensurePendingActiveProjectExpanded)')
    expect(source).not.toContain('watch(projectConversationGroups, ensureActiveProjectExpanded)')
  })

  it('uses open-session state for directory emphasis and keeps conversation rows icon-free', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain("'has-open-conversation': group.hasOpenConversation")
    expect(source).toContain('.project-group-header.has-open-conversation .project-title')
    expect(source).toContain('@dragstart="handleProjectDragStart($event, group)"')
    expect(source).not.toContain('getConversationBaseIcon')
    expect(source).not.toContain('conv-icon-group')
    expect(source).toContain('class="conv-marker im-source-marker"')
  })

  it('renders automatic IM sessions in a separate collapsible group', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain('v-if="externalImConversations.length"')
    expect(source).toContain("{{ t('agent.externalConversations') }}")
    expect(source).toContain('@click="toggleExternalImExpanded"')
    expect(source).toContain('expandExternalImGroup()')
  })
})
