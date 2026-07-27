import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentLeftContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/AgentLeftContent.vue')

describe('AgentLeftContent project tree expansion', () => {
  it('takes reactive projects as the tree source and ensures browsed folders before selecting them', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain('projects: {')
    expect(source).toContain('useAgentPanel({ projects: computed(() => props.projects) })')
    expect(source).toContain("intent: 'agent-workspace'")
    expect(source).toContain('const message = useMessage()')
    expect(source).toContain("message.error(err?.message || '无法将所选目录作为 Agent 项目')")
    expect(source).toContain("emit('projects-changed')")
    expect(source).toContain('selectCwd(`project:${project.id}`)')
  })

  it('renames only project-tree roots through the dedicated project rename API', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain("key: 'rename'")
    expect(source).toContain('const startProjectRename = (group) =>')
    expect(source).toContain('window.electronAPI.renameProject({ projectId, name })')
    expect(source).toContain("emit('projects-changed')")
    expect(source).toContain('editingProjectId !== null && editingProjectId === group.projectId')
    expect(source).toContain('if (isSavingProjectRename.value || !group?.projectId')
    expect(source).not.toContain("directory.projectName === t('agent.chat')")
  })

  it('creates project-scoped conversations by projectId and preserves the fallback group as read-only', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8')

    expect(source).toContain('projectId: group.projectId')
    expect(source).toContain('cwd: group.path')
    expect(source).toContain("directory.isFallback")
    expect(source).toContain("t('agent.uncategorizedConversations')")
    expect(source).toContain('group.isFallback || !group.path')
  })

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
