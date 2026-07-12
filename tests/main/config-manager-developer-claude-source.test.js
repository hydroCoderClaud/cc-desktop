import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:\\temp\\cc-desktop-test-config-defaults'),
    getName: vi.fn(() => 'claude-code-desktop-test'),
    getVersion: vi.fn(() => '1.0.0-test')
  },
  ipcMain: {
    handle: vi.fn(),
    on: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

const ConfigManager = require('../../src/main/config-manager.js')

describe('ConfigManager developer Claude source', () => {
  it('defaults developer Claude source to bundled', () => {
    const manager = new ConfigManager({
      userDataPath: 'C:\\temp\\cc-desktop-test-config-defaults'
    })

    expect(manager.getConfig().settings.developerClaudeSource).toBe('bundled')
  })

  it('normalizes invalid developer Claude source to bundled', async () => {
    const manager = new ConfigManager({
      userDataPath: 'C:\\temp\\cc-desktop-test-config-defaults'
    })

    await manager.updateSettings({ developerClaudeSource: 'anything-else' })

    expect(manager.getConfig().settings.developerClaudeSource).toBe('bundled')
  })

  it('normalizes explicit system developer Claude source to bundled', async () => {
    const manager = new ConfigManager({
      userDataPath: 'C:\\temp\\cc-desktop-test-config-defaults'
    })

    await manager.updateSettings({ developerClaudeSource: 'system' })

    expect(manager.getConfig().settings.developerClaudeSource).toBe('bundled')
  })

  it('normalizes dirty persisted developer Claude source on load', () => {
    const userDataPath = 'C:\\temp\\cc-desktop-test-config-dirty-load'
    fs.mkdirSync(userDataPath, { recursive: true })
    fs.writeFileSync(
      path.join(userDataPath, 'config.json'),
      JSON.stringify({
        settings: {
          developerClaudeSource: 'system '
        }
      }),
      'utf8'
    )

    const manager = new ConfigManager({ userDataPath })

    expect(manager.getConfig().settings.developerClaudeSource).toBe('bundled')
  })
})
