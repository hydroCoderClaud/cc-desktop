import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const localCommandsPath = path.resolve(__dirname, '../../src/renderer/composables/useAgentLocalCommands.js')
const workbenchPath = path.resolve(__dirname, '../../src/renderer/pages/settings-workbench/components/SessionAppsWorkbenchTab.vue')

describe('session app payload cloneability guards', () => {
  it('sanitizes main agent chat draft IPC payloads before invoking electron APIs', () => {
    const source = fs.readFileSync(localCommandsPath, 'utf-8')

    expect(source).toContain('const toPlainPayload = (value) => {')
    expect(source).toContain('const payload = toPlainPayload(normalizeSessionAppDraft(draft))')
    expect(source).toContain('window.electronAPI.updateSessionApp(toPlainPayload({')
    expect(source).toContain('window.electronAPI.createSessionApp(payload)')
    expect(source).toContain('window.electronAPI.launchSessionApp(toPlainPayload({')
  })

  it('sanitizes workbench session app IPC payloads before invoking electron APIs', () => {
    const source = fs.readFileSync(workbenchPath, 'utf-8')

    expect(source).toContain('function toPlainPayload(value) {')
    expect(source).toContain('window.electronAPI.createSessionApp(toPlainPayload({')
    expect(source).toContain('window.electronAPI.updateSessionApp(toPlainPayload({')
    expect(source).toContain('window.electronAPI.launchSessionApp(toPlainPayload({')
    expect(source).toContain('window.electronAPI.openSessionAppConversation(session.id)')
    expect(source).not.toContain('window.electronAPI.reopenAgentSession?.(session.id)')
  })
})
