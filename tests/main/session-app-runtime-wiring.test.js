import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const sessionManagerPath = path.resolve(__dirname, '../../src/main/agent-session-manager.js')

describe('session app runtime wiring', () => {
  it('derives session app query options from the current app definition', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf-8')

    expect(source).toContain('_buildSessionAppQueryOptions(session)')
    expect(source).toContain('const sessionAppOptions = this._buildSessionAppQueryOptions(session)')
    expect(source).toContain('sessionAppOptions?.systemPrompt')
    expect(source).toContain('appendSystemPrompt = mergeSystemPrompts(')
    expect(source).toContain('this.sessionDatabase.getSessionApp(session.sessionAppId)')
  })

  it('records Session App identity in the query snapshot for diagnostics', () => {
    const source = fs.readFileSync(sessionManagerPath, 'utf-8')

    expect(source).toContain('sessionAppId: session?.sessionAppId || null')
    expect(source).not.toContain('sessionAppVersion: session?.sessionAppVersion || null')
  })
})
