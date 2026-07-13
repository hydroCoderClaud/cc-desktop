import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ipcHandlersPath = path.resolve(__dirname, '../../src/main/ipc-handlers.js')

describe('legacy settings window singleton wiring', () => {
  it('routes static settings handlers through the singleton window helper', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain("safeRequire('./utils/singleton-window-registry', 'singleton-window-registry')")
    expect(source).toContain('const singletonSubWindows = createSingletonWindowRegistry?.()')
    expect(source).toContain("openSingletonSubWindow('model-settings'")
    expect(source).toContain("openSingletonSubWindow('channel-settings'")
    expect(source).toContain("openSingletonSubWindow('global-settings'")
    expect(source).toContain("openSingletonSubWindow('appearance-settings'")
    expect(source).toContain("openSingletonSubWindow('profile-manager'")
    expect(source).toContain("openSingletonSubWindow('provider-manager'")
  })

  it('keys workbench instances by their semantic context and leaves embedded apps alone', () => {
    const source = fs.readFileSync(ipcHandlersPath, 'utf-8')

    expect(source).toContain('const buildSettingsWorkbenchWindowKey = (options = {}) => {')
    expect(source).toContain('options.sessionAppId')
    expect(source).toContain('openSingletonSubWindow(buildSettingsWorkbenchWindowKey(options)')
    expect(source).toContain('const embeddedAppWindows = new Map()')
    expect(source).toContain('const window = createSubWindow({')
  })
})
