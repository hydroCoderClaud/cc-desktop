import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn(() => [])
  }
}))

describe('ScheduledTaskService', () => {
  it('normalizes legacy model tier aliases to agent-supported tiers', async () => {
    const { ScheduledTaskService } = await import('../../src/main/managers/scheduled-task-service.js')
    const service = new ScheduledTaskService({}, { on: vi.fn() })

    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'balanced' }).modelTier).toBe('sonnet')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'powerful' }).modelTier).toBe('opus')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'fast' }).modelTier).toBe('haiku')
    expect(service._normalizeTaskInput({ name: 'a', prompt: 'b', scheduleType: 'interval', intervalMinutes: 5, modelTier: 'sonnet' }).modelTier).toBe('sonnet')
  })
})
