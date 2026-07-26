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

  it('preserves the selected project identity and ensures browsed folders before creation', () => {
    const source = fs.readFileSync(modalPath, 'utf-8')

    expect(source).toContain('const selectedProject = ref(null)')
    expect(source).toContain('const selectedCwd = computed(() => selectedProject.value?.path || null)')
    expect(source).toContain("intent: 'agent-workspace'")
    expect(source).toContain('const message = useMessage()')
    expect(source).toContain("message.error(err?.message || '无法将所选目录作为 Agent 项目')")
    expect(source).toContain("emit('project-ensured')")
    expect(source).toContain('projectId: selectedProject.value?.projectId || selectedProject.value?.id || null')
    expect(source).toContain('cwd: selectedProject.value?.path || null')
  })
})
