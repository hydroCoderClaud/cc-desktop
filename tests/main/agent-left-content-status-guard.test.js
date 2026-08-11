import { describe, expect, it } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentLeftContentPath = path.resolve(__dirname, '../../src/renderer/pages/main/components/agent/AgentLeftContent.vue')

describe('AgentLeftContent activeSessionEnded handling', () => {
  it('keeps closed sessions closed when activeSessionEnded status events arrive', () => {
    const source = fs.readFileSync(agentLeftContentPath, 'utf-8').replace(/\r\n/g, '\n')

    expect(source).toContain('if (data.activeSessionEnded) {')
    expect(source).toContain("conv.status = 'closed'")
    expect(source).toContain("data.cliExited\n          ? (data.cliExitWasError ? 'error' : 'closed')\n          : data.status")
  })
})
