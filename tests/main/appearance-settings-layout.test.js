import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const viewPath = path.resolve(__dirname, '../../src/renderer/pages/appearance-settings/components/AppearanceSettingsContent.vue')

describe('AppearanceSettingsContent layout', () => {
  it('keeps the header visual hierarchy while aligning it with the content', () => {
    const source = fs.readFileSync(viewPath, 'utf-8')

    expect(source).toContain('class="settings-header appearance-settings-header"')
    expect(source).toContain('class="appearance-settings-header-actions" :wrap="true"')
    expect(source).toContain('margin: 0 0 24px;')
    expect(source).toContain('padding: 24px;')
    expect(source).toContain('border-radius: 12px 12px 0 0;')
    expect(source).not.toContain('settings-footer')
    expect(source).not.toContain("t('globalSettings.terminalSettings')")
    expect(source).not.toContain('getTerminalSettings')
  })
})
