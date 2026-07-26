import { describe, expect, it } from 'vitest'
import { createRequire } from 'module'

const requireCjs = createRequire(import.meta.url)
const { buildCurrentImHistoryRow } = requireCjs('../../src/main/managers/im-command-policy.js')

describe('IM command history policy', () => {
  it('prefers the linked project path over a stale conversation cwd', () => {
    const row = buildCurrentImHistoryRow({
      sessionId: 'im-canonical-path',
      dbRow: {
        session_id: 'im-canonical-path',
        title: 'Canonical IM conversation',
        cwd: 'C:/legacy/stale-cwd',
        project_path: 'C:/projects/canonical-root',
        status: 'idle'
      },
      liveSession: {
        id: 'im-canonical-path',
        cwd: 'C:/live/stale-cwd',
        projectPath: 'C:/projects/live-root'
      },
      imChannel: 'feishu'
    })

    expect(row.cwd).toBe('C:/projects/canonical-root')
  })
})
