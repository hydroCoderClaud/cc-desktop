import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const agentDbPath = path.resolve(__dirname, '../../src/main/database/agent-db.js')

describe('agent db session app persistence wiring', () => {
  it('keeps the session app columns aligned with the insert placeholder count', () => {
    const source = fs.readFileSync(agentDbPath, 'utf-8')
    const valuesMatch = source.match(/VALUES \(([^)]*)\)/)

    expect(valuesMatch).toBeTruthy()
    expect(valuesMatch[1].match(/\?/g)?.length || 0).toBe(19)
    expect(source).toContain('session_app_id, session_app_input, created_at, updated_at')
  })
})
