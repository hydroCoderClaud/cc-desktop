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
      getStation: vi.fn((stationId) => ({ id: stationId, name: '测试站' }))
    }
    const realtimeService = {
      listRealtimeSlots: vi.fn(() => [{ id: 'slot-1', slotTime: '2026-05-17 00:00' }]),
      getRealtimeSlotDetail: vi.fn((slotId) => ({ slot: { id: slotId }, reviewTasks: [] }))
    }
    const reviewTaskService = {
      listReviewTasks: vi.fn(() => [{ id: 'task-1', status: 'needs_review' }])
    }
    const qualityCheckService = {
      getLatestRunSummary: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 3 })),
      runStationQualityCheck: vi.fn(() => ({ stationId: 'st-1', checkedSlotCount: 3, hitCount: 1 }))
    }

    const options = await buildHydrologyCapabilityQueryOptions({
      stationService,
      realtimeService,
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
    const { tools, stationService, realtimeService } = await createOptions()

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
  })

  it('returns empty options outside hydrology embedded sessions', async () => {
    const options = await buildHydrologyCapabilityQueryOptions({
      stationService: {},
      realtimeService: {},
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
