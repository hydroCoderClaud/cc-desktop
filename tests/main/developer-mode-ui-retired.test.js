import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '../..')
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf-8')

describe('Developer mode UI retirement', () => {
  it('does not expose Developer mode entries in the left panel', () => {
    const source = read('src/renderer/pages/main/components/LeftPanel.vue')

    expect(source).not.toContain('LeftPanelDeveloperPane')
    expect(source).not.toContain('mode.switchToDeveloper')
    expect(source).not.toContain("mode: isAgentMode.value ? 'agent' : 'developer'")
  })

  it('does not mount Developer terminal content in main content', () => {
    const source = read('src/renderer/pages/main/components/MainContent.vue')

    expect(source).not.toContain("import RightPanel from './RightPanel/index.vue'")
    expect(source).not.toContain("import TerminalTab from './TerminalTab.vue'")
    expect(source).not.toContain('<RightPanel')
    expect(source).not.toContain('<TerminalTab')
    expect(source).not.toContain('main.developerWelcome')
    expect(source).toContain('openAgentNewConversation')
    expect(source).not.toContain('handleNewSession?.()')
  })

  it('does not offer Developer mode from Notebook navigation', () => {
    const source = read('src/renderer/pages/notebook/components/NotebookTopNav.vue')

    expect(source).not.toContain('developerModeEnabled')
    expect(source).not.toContain('mode.switchToDeveloper')
  })

  it('does not show the Developer mode enable switch in global settings', () => {
    const source = read('src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')

    expect(source).not.toContain("t('globalSettings.enableDeveloperMode')")
    expect(source).not.toContain('formData.enableDeveloperMode')
  })

  it('does not offer a system Claude runtime option in global settings', () => {
    const source = read('src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')
    const zhLocale = read('src/renderer/locales/zh-CN.js')
    const enLocale = read('src/renderer/locales/en-US.js')

    expect(source).not.toContain('developerClaudeSourceOptions')
    expect(source).not.toContain("value: 'system'")
    expect(source).not.toContain('formData.developerClaudeSource')
    expect(zhLocale).not.toContain('系统 Claude')
    expect(enLocale).not.toContain('System Claude')
  })
})
