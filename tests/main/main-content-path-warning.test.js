import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')

describe('MainContent project directory opening', () => {
  it('does not keep the retired special-character path warning flow', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    expect(source).not.toContain('result.pathWarning')
    expect(source).not.toContain('pathWarningTitle')
    expect(source).not.toContain("await invoke('unhideProject'")
    expect(source).not.toContain("await invoke('createProject'")
    expect(source).not.toContain("import { useIPC } from '@composables/useIPC'")
  })
})
