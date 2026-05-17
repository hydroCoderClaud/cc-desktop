import { describe, expect, it, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  createSdkMcpServer: config => config,
  tool: (name, description, inputSchema, handler) => ({
    name,
    description,
    inputSchema,
    handler
  })
}))

const {
  buildHydrologyCapabilityQueryOptions,
  HYDROLOGY_ALLOWED_TOOLS
} = await import('../../src/main/managers/hydrology-capability-query-options.js')

describe('hydrology capability query options', () => {
  function parseToolPayload(result) {
    expect(result?.content?.[0]?.type).toBe('text')
    return JSON.parse(result.content[0].text)
  }

  async function createOptions() {
    const stationService = {
      listStations: vi.fn(() => [{ id: 'st-1', name: '测试站' }]),
      getStation: vi.fn((stationId) => ({ id: stationId, name: '测试站' })),
      saveStation: vi.fn((station) => ({ id: station.id || 'st-2', ...station })),
      deleteStation: vi.fn((stationId) => ({ changes: 1, stationId }))
    }
    const realtimeService = {
      listRealtimeSlots: vi.fn(() => [{ id: 'slot-1', slotTime: '2026-05-17 00:00' }]),
      getRealtimeSlotDetail: vi.fn((slotId) => ({ slot: { id: slotId }, reviewTasks: [] })),
      listRealtimeTrend: vi.fn(() => [{ time: '2026-05-17 00:00', value: 1.2 }]),
      saveObservation: vi.fn((observation) => ({ id: 'obs-1', ...observation })),
      updateObservation: vi.fn((observation) => ({ ...observation })),
      deleteObservation: vi.fn((observationId) => ({ id: observationId })),
      deleteSlotObservations: vi.fn((payload) => ({ deletedCount: 1, ...payload })),
      applyCorrection: vi.fn((correction) => ({ id: 'corr-1', ...correction }))
    }
    const realtimeDemoSeeder = {
      seedStationObservations: vi.fn((station) => ({ stationId: station?.id || null, seededSlotCount: 72 }))
    }
    const reviewTaskService = {
      listReviewTasks: vi.fn(() => [{ id: 'task-1', status: 'needs_review' }]),
      resolveReviewTask: vi.fn((taskId, payload) => ({ id: taskId, status: 'resolved', ...payload })),
      deleteReviewTask: vi.fn((taskId) => ({ taskId, deleted: true })),
      deleteReviewTasks: vi.fn((taskIds) => ({ taskIds, deletedCount: taskIds.length }))
    }
    const qualityCheckService = {
      getLatestRunSummary: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 3 })),
      runStationQualityCheck: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 3, hitCount: 1 }))
    }

    const options = await buildHydrologyCapabilityQueryOptions({
      stationService,
      realtimeService,
      realtimeDemoSeeder,
      reviewTaskService,
      qualityCheckService,
      session: {
        clientType: 'embedded',
        clientMeta: {
          appId: 'hydrology-workbench'
        }
      }
    })

    const tools = Object.fromEntries(
      options.mcpServers.hydrology.tools.map(tool => [tool.name, tool])
    )

    return {
      options,
      tools,
      stationService,
      realtimeService,
      realtimeDemoSeeder,
      reviewTaskService,
      qualityCheckService
    }
  }

  it('exposes hydrology tool allowlist and system prompt for hydrology embedded sessions', async () => {
    const { options } = await createOptions()

    expect(Object.keys(options.mcpServers)).toEqual(['hydrology'])
    expect(options.allowedTools).toEqual(HYDROLOGY_ALLOWED_TOOLS)
    expect(options.appendSystemPrompt).toContain('hydrology MCP server')
    expect(options.appendSystemPrompt).toContain('embeddedapp tools for current UI state')
  })

  it('calls station and realtime services through tool handlers', async () => {
    const { tools, stationService, realtimeService, realtimeDemoSeeder } = await createOptions()

    const listPayload = parseToolPayload(await tools.station_list.handler())
    expect(listPayload.stations).toEqual([{ id: 'st-1', name: '测试站' }])
    expect(stationService.listStations).toHaveBeenCalledOnce()

    const stationPayload = parseToolPayload(await tools.station_get.handler({ stationId: 'st-1' }))
    expect(stationPayload.station).toEqual({ id: 'st-1', name: '测试站' })
    expect(stationService.getStation).toHaveBeenCalledWith('st-1')

    const slotsPayload = parseToolPayload(await tools.realtime_slots_list.handler({ stationId: 'st-1' }))
    expect(slotsPayload.slots).toEqual([{ id: 'slot-1', slotTime: '2026-05-17 00:00' }])
    expect(realtimeService.listRealtimeSlots).toHaveBeenCalledWith({ stationId: 'st-1' })

    const slotDetailPayload = parseToolPayload(await tools.realtime_slot_get.handler({ slotId: 'slot-1' }))
    expect(slotDetailPayload.detail).toEqual({ slot: { id: 'slot-1' }, reviewTasks: [] })
    expect(realtimeService.getRealtimeSlotDetail).toHaveBeenCalledWith('slot-1')

    const trendPayload = parseToolPayload(await tools.realtime_trend_list.handler({ stationId: 'st-1' }))
    expect(trendPayload.trend).toEqual([{ time: '2026-05-17 00:00', value: 1.2 }])
    expect(realtimeService.listRealtimeTrend).toHaveBeenCalledWith({ stationId: 'st-1' })

    const seedPayload = parseToolPayload(await tools.realtime_demo_seed.handler({ stationId: 'st-1' }))
    expect(seedPayload.result).toEqual({ stationId: 'st-1', seededSlotCount: 72 })
    expect(stationService.getStation).toHaveBeenCalledWith('st-1')
    expect(realtimeDemoSeeder.seedStationObservations).toHaveBeenCalledWith({ id: 'st-1', name: '测试站' })

    const saveStationPayload = parseToolPayload(await tools.station_save.handler({
      station: { code: 'S1', name: '测试站' }
    }))
    expect(saveStationPayload.station).toEqual({ id: 'st-2', code: 'S1', name: '测试站' })
    expect(stationService.saveStation).toHaveBeenCalledWith({ code: 'S1', name: '测试站' })

    const deleteStationPayload = parseToolPayload(await tools.station_delete.handler({ stationId: 'st-1' }))
    expect(deleteStationPayload.result).toEqual({ changes: 1, stationId: 'st-1' })
    expect(stationService.deleteStation).toHaveBeenCalledWith('st-1')

    const createObservationPayload = parseToolPayload(await tools.realtime_observation_create.handler({
      observation: { stationId: 'st-1', observationType: 'waterLevel', sourceType: 'manual', slotTime: '2026-05-17 00:00', value: 1.2 }
    }))
    expect(createObservationPayload.observation.id).toBe('obs-1')
    expect(realtimeService.saveObservation).toHaveBeenCalled()

    const updateObservationPayload = parseToolPayload(await tools.realtime_observation_update.handler({
      observation: { id: 'obs-1', value: 1.3 }
    }))
    expect(updateObservationPayload.observation).toEqual({ id: 'obs-1', value: 1.3 })
    expect(realtimeService.updateObservation).toHaveBeenCalledWith({ id: 'obs-1', value: 1.3 })

    const deleteObservationPayload = parseToolPayload(await tools.realtime_observation_delete.handler({ observationId: 'obs-1' }))
    expect(deleteObservationPayload.result).toEqual({ id: 'obs-1' })
    expect(realtimeService.deleteObservation).toHaveBeenCalledWith('obs-1')

    const deleteSlotPayload = parseToolPayload(await tools.realtime_slot_delete.handler({
      stationId: 'st-1',
      observationType: 'waterLevel',
      slotTime: '2026-05-17 00:00'
    }))
    expect(deleteSlotPayload.result.deletedCount).toBe(1)
    expect(realtimeService.deleteSlotObservations).toHaveBeenCalled()

    const correctionPayload = parseToolPayload(await tools.realtime_correction_apply.handler({
      correction: { stationId: 'st-1', observationType: 'waterLevel', targetTime: '2026-05-17T00:00:00.000Z', beforeValue: 1.2, afterValue: 1.1 }
    }))
    expect(correctionPayload.correction.id).toBe('corr-1')
    expect(realtimeService.applyCorrection).toHaveBeenCalled()
  })

  it('calls review and quality-check services through tool handlers', async () => {
    const { tools, reviewTaskService, qualityCheckService } = await createOptions()

    const tasksPayload = parseToolPayload(await tools.review_tasks_list.handler({ stationId: 'st-1' }))
    expect(tasksPayload.tasks).toEqual([{ id: 'task-1', status: 'needs_review' }])
    expect(reviewTaskService.listReviewTasks).toHaveBeenCalledWith({ stationId: 'st-1' })

    const summaryPayload = parseToolPayload(await tools.review_latest_run_summary_get.handler({ stationId: 'st-1' }))
    expect(summaryPayload.summary).toEqual({ stationId: 'st-1', checkedSlotCount: 3 })
    expect(qualityCheckService.getLatestRunSummary).toHaveBeenCalledWith({ stationId: 'st-1' })

    const runPayload = parseToolPayload(await tools.quality_check_run.handler({ stationId: 'st-1' }))
    expect(runPayload.result).toEqual({ stationId: 'st-1', checkedSlotCount: 3, hitCount: 1 })
    expect(qualityCheckService.runStationQualityCheck).toHaveBeenCalledWith({ stationId: 'st-1' })

    const resolvePayload = parseToolPayload(await tools.review_task_resolve.handler({
      taskId: 'task-1',
      payload: { resolvedBy: 'tester', resolutionNote: 'ok' }
    }))
    expect(resolvePayload.task).toEqual({ id: 'task-1', status: 'resolved', resolvedBy: 'tester', resolutionNote: 'ok' })
    expect(reviewTaskService.resolveReviewTask).toHaveBeenCalledWith('task-1', { resolvedBy: 'tester', resolutionNote: 'ok' })

    const deleteTaskPayload = parseToolPayload(await tools.review_task_delete.handler({ taskId: 'task-1' }))
    expect(deleteTaskPayload.result).toEqual({ taskId: 'task-1', deleted: true })
    expect(reviewTaskService.deleteReviewTask).toHaveBeenCalledWith('task-1')

    const deleteTasksPayload = parseToolPayload(await tools.review_tasks_delete.handler({ taskIds: ['task-1', 'task-2'] }))
    expect(deleteTasksPayload.result).toEqual({ taskIds: ['task-1', 'task-2'], deletedCount: 2 })
    expect(reviewTaskService.deleteReviewTasks).toHaveBeenCalledWith(['task-1', 'task-2'])
  })

  it('returns empty options outside hydrology embedded sessions', async () => {
    const options = await buildHydrologyCapabilityQueryOptions({
      stationService: {},
      realtimeService: {},
      realtimeDemoSeeder: {},
      reviewTaskService: {},
      qualityCheckService: {},
      session: {
        clientType: 'host',
        clientMeta: {
          appId: 'hydrology-workbench'
        }
      }
    })

    expect(options).toEqual({})
  })
})
