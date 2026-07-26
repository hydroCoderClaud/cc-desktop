import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')
const leftPanelPath = path.join(repoRoot, 'src/renderer/pages/main/components/LeftPanel.vue')
const mainContentPath = path.join(repoRoot, 'src/renderer/pages/main/components/MainContent.vue')

describe('project tree refresh wiring', () => {
  it('forwards the reactive project list and propagates ensured/new-project changes upward', () => {
    const source = fs.readFileSync(leftPanelPath, 'utf-8')

    expect(source).toContain(':projects="projects"')
    expect(source).toContain('@projects-changed="handleProjectsChanged"')
    expect(source).toContain('@project-ensured="handleProjectsChanged"')
    expect(source).toContain('const handleNewConvCreate = async ({ projectId, cwd, apiProfileId }) =>')
    expect(source).toContain('projectId: projectId || null')
    expect(source).toContain('handleProjectsChanged()')
    expect(source).toContain("emit('projects-changed')")
  })

  it('reloads MainContent projects when the sidebar reports a project mutation', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).toContain('@projects-changed="handleProjectsChanged"')
    expect(source).toContain('const handleProjectsChanged = async () => {')
    expect(source).toContain('await loadProjects()')
  })
})
