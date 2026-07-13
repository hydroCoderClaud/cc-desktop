import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const viewPath = path.resolve(__dirname, '../../src/renderer/pages/global-settings/components/GlobalSettingsContent.vue')

describe('GlobalSettingsContent message queue reset', () => {
  it('reuses message queue persistence during reset', () => {
    const source = fs.readFileSync(viewPath, 'utf-8')

    expect(source).toContain('const persistMessageQueueSetting = async (enabled) => {')
    expect(source).toContain('const handleQueueToggle = async (enabled) => {')
    expect(source).toContain('await persistMessageQueueSetting(enabled)')
    expect(source).toContain('await persistMessageQueueSetting(DEFAULTS.messageQueue)')
  })

  it('keeps the global settings actions in one aligned header', () => {
    const source = fs.readFileSync(viewPath, 'utf-8')

    expect(source).toContain('class="settings-header global-settings-header"')
    expect(source).toContain('class="global-settings-header-actions" :wrap="true"')
    expect(source).toContain('<n-button @click="handleReset">')
    expect(source).toContain('<n-button @click="handleClose">')
    expect(source.match(/@click="handleSave"/g)).toHaveLength(1)
    expect(source).not.toContain('settings-footer')
    expect(source).toContain('margin: 0 0 24px;')
    expect(source).toContain('padding: 24px;')
    expect(source).toContain('border-radius: 12px 12px 0 0;')
  })
})
