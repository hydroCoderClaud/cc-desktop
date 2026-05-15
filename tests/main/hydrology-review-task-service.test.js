import { beforeEach, describe, expect, it } from 'vitest'
import Database from '../mocks/better-sqlite3.js'

describe('Hydrology review task backend', () => {
  beforeEach(() => {
    globalThis.resetMemoryDB?.()
  })

  it('creates and resolves review tasks for missing manual data', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService, SOURCE_TYPES } = await import('../../src/main/hydrology/realtime-service.js')
    const { ReviewTaskService } = await import('../../src/main/hydrology/review-task-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const reviewTaskService = new ReviewTaskService(db)
    const realtimeService = new RealtimeService(db, { reviewTaskService })
    const station = stationService.saveStation({
      code: 'HD201',
      name: '缺测试验站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: false
      }
    })

    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.telemetry,
      observedAt: '2026-05-14T00:00:00.000Z',
      slotTime: '2026-05-14 08:00',
      value: 5.18,
      unit: 'm'
    })

    const tasks = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    })

    expect(tasks).toHaveLength(1)
    expect(tasks[0].ruleCode).toBe('W-001')
    expect(tasks[0].status).toBe('needs_review')
    expect(tasks[0].anomalyType).toBe('missing_manual')

    const detail = realtimeService.getRealtimeSlotDetail(
      realtimeService.listRealtimeSlots({
        stationId: station.id,
        observationType: 'waterLevel'
      })[0].id
    )
    expect(detail.anomalies.some((item) => item.anomalyType === 'missing_manual')).toBe(true)

    const resolved = reviewTaskService.resolveReviewTask(tasks[0].id, {
      resolvedBy: '审核员A',
      resolutionNote: '已确认该时槽无人工记录',
      status: 'resolved'
    })

    expect(resolved.status).toBe('resolved')
    expect(resolved.resolvedBy).toBe('审核员A')

    const remaining = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'needs_review'
    })
    expect(remaining.some((item) => item.ruleCode === 'W-001')).toBe(false)

    const allAfterResolve = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    })
    expect(allAfterResolve[0].status).toBe('resolved')

    const detailAfterResolve = realtimeService.getRealtimeSlotDetail(
      realtimeService.listRealtimeSlots({
        stationId: station.id,
        observationType: 'waterLevel'
      })[0].id
    )
    expect(detailAfterResolve.anomalies.find((item) => item.anomalyType === 'missing_manual')?.status).toBe('closed')
  })

  it('creates consistency review tasks without polluting realtime detail anomalies', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService, SOURCE_TYPES } = await import('../../src/main/hydrology/realtime-service.js')
    const { ReviewTaskService } = await import('../../src/main/hydrology/review-task-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const reviewTaskService = new ReviewTaskService(db)
    const realtimeService = new RealtimeService(db, { reviewTaskService })
    const station = stationService.saveStation({
      code: 'HD202',
      name: '一致性试验站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: true
      }
    })

    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.manual,
      observedAt: '2026-05-14T00:00:00.000Z',
      slotTime: '2026-05-14 08:00',
      value: 5,
      unit: 'm'
    })
    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.telemetry,
      observedAt: '2026-05-14T00:00:00.000Z',
      slotTime: '2026-05-14 08:00',
      value: 5.18,
      unit: 'm'
    })
    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.videoOcr,
      observedAt: '2026-05-14T00:02:00.000Z',
      value: 5.2,
      unit: 'm'
    })

    const tasks = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    })

    expect(tasks.some((item) => item.ruleCode === 'W-002')).toBe(true)

    const slots = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })
    const detail = realtimeService.getRealtimeSlotDetail(slots[0].id)
    expect(detail.anomalies).toEqual([])
  })

  it('auto resolves stale missing-data review tasks after manual backfill', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService, SOURCE_TYPES } = await import('../../src/main/hydrology/realtime-service.js')
    const { ReviewTaskService } = await import('../../src/main/hydrology/review-task-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const reviewTaskService = new ReviewTaskService(db)
    const realtimeService = new RealtimeService(db, { reviewTaskService })
    const station = stationService.saveStation({
      code: 'HD203',
      name: '自动收敛试验站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: false
      }
    })

    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.telemetry,
      observedAt: '2026-05-14T00:00:00.000Z',
      slotTime: '2026-05-14 08:00',
      value: 5.18,
      unit: 'm'
    })

    const created = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'needs_review'
    })
    expect(created).toHaveLength(1)
    expect(created[0].ruleCode).toBe('W-001')

    realtimeService.saveObservation({
      stationId: station.id,
      observationType: 'waterLevel',
      sourceType: SOURCE_TYPES.manual,
      observedAt: '2026-05-14T00:00:00.000Z',
      slotTime: '2026-05-14 08:00',
      value: 5.17,
      unit: 'm'
    })

    const pendingAfterBackfill = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'needs_review'
    })
    expect(pendingAfterBackfill.some((item) => item.ruleCode === 'W-001')).toBe(false)

    const allAfterBackfill = reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    })
    const missingManualTask = allAfterBackfill.find((item) => item.ruleCode === 'W-001')
    expect(missingManualTask).toBeTruthy()
    expect(missingManualTask.status).toBe('resolved')
    expect(missingManualTask.resolvedBy).toBe('system')
    expect(missingManualTask.resolutionNote).toContain('系统自动收敛')

    const detailAfterBackfill = realtimeService.getRealtimeSlotDetail(
      realtimeService.listRealtimeSlots({
        stationId: station.id,
        observationType: 'waterLevel'
      })[0].id
    )
    expect(detailAfterBackfill.anomalies.find((item) => item.anomalyType === 'missing_manual')?.status).toBe('closed')
  })
})
