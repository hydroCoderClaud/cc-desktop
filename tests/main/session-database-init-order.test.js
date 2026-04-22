import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => 'C:/tmp/cc-desktop-test')
  }
}))

describe('SessionDatabase init order', () => {
  it('runs migrations before creating indexes', async () => {
    const { SessionDatabase } = await import('../../src/main/session-database.js')

    class FakeDatabase {
      constructor() {
        this.pragma = vi.fn()
      }
    }

    const db = new SessionDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database: FakeDatabase
    })

    const calls = []
    db.createTables = vi.fn(() => calls.push('createTables'))
    db.runMigrations = vi.fn(() => calls.push('runMigrations'))
    db.createIndexes = vi.fn(() => calls.push('createIndexes'))
    db._seedDefaultData = vi.fn(() => calls.push('seed'))

    db.init()

    expect(calls).toEqual([
      'createTables',
      'runMigrations',
      'createIndexes',
      'seed'
    ])
  })
})
