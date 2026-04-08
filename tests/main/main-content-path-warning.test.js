import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const mainContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/MainContent.vue')

describe('MainContent path warning flow', () => {
  it('declares invoke before confirmation branch uses it', () => {
    const source = fs.readFileSync(mainContentPath, 'utf-8')

    const importLine = "import { useIPC } from '@composables/useIPC'"
    const invokeDeclaration = 'const { invoke } = useIPC()'

    expect(source).toContain(importLine)
    expect(source).toContain(invokeDeclaration)

    const declarationIndex = source.indexOf(invokeDeclaration)
    const unhideCallIndex = source.indexOf("await invoke('unhideProject'")
    const createCallIndex = source.indexOf("await invoke('createProject'")

    expect(declarationIndex).toBeGreaterThan(-1)
    expect(unhideCallIndex).toBeGreaterThan(-1)
    expect(createCallIndex).toBeGreaterThan(-1)
    expect(declarationIndex).toBeLessThan(unhideCallIndex)
    expect(declarationIndex).toBeLessThan(createCallIndex)
  })
})
