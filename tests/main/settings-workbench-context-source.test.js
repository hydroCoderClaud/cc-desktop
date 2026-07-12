import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const workbenchPath = path.resolve(__dirname, '../../src/renderer/pages/settings-workbench/components/SettingsWorkbenchContent.vue')

describe('settings workbench context sources', () => {
  it('sources directory identities from projects instead of legacy cwd fallbacks', () => {
    const source = fs.readFileSync(workbenchPath, 'utf-8')

    expect(source).toContain('getCapabilityProjects')
    expect(source).toContain('ensureWorkspaceProject')
    expect(source).not.toContain('listAgentSessions')
    expect(source).not.toContain('notebookList')
    expect(source).not.toContain('recentContextPaths')
    expect(source).not.toContain("value: 'agent'")
    expect(source).not.toContain("value: 'recent'")
  })

  it('shows temporary context names without using the full path as the label', () => {
    const source = fs.readFileSync(workbenchPath, 'utf-8')

    expect(source).toContain('label: getBaseName(temporaryContextPath.value)')
    expect(source).toContain('path: temporaryContextPath.value')
    expect(source).not.toContain('label: temporaryContextPath.value')
  })
})
