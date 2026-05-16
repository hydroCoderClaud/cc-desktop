import { describe, it, expect, beforeEach } from 'vitest'
import Database from '../mocks/better-sqlite3.js'

describe('Hydrology station backend', () => {
  beforeEach(() => {
    globalThis.resetMemoryDB?.()
  })

  it('persists and queries stations via hydrology database', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()
    const service = new StationService(db)

    const saved = service.saveStation({
      code: 'HD001',
      name: '黄田站',
      basin: '黄田流域',
      observationTypes: ['waterLevel', 'airTemperature']
    })

    expect(saved.id).toBeTruthy()
    expect(saved.code).toBe('HD001')
    expect(service.listStations()).toHaveLength(1)
    expect(service.getStation(saved.id)?.name).toBe('黄田站')
  })

  it('rejects duplicate station codes', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()
    const service = new StationService(db)

    service.saveStation({
      code: 'HD002',
      name: '东港站',
      observationTypes: ['waterLevel']
    })

    expect(() => service.saveStation({
      code: 'HD002',
      name: '东港二站',
      observationTypes: ['waterLevel']
    })).toThrow('站码已存在')
  })

  it('deletes station together with hydrology related records', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService, SOURCE_TYPES } = await import('../../src/main/hydrology/realtime-service.js')
    const { ReviewTaskService } = await import('../../src/main/hydrology/review-task-service.js')
    const { QualityCheckService } = await import('../../src/main/hydrology/quality-check-service.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const reviewTaskService = new ReviewTaskService(db)
    const realtimeService = new RealtimeService(db, { reviewTaskService })
    const qualityCheckService = new QualityCheckService({ stationService, realtimeService, hydrologyDatabase: db })
    const station = stationService.saveStation({
      code: 'HD003',
      name: '删除联动站',
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
      value: 5.2,
      unit: 'm'
    })

    qualityCheckService.runStationQualityCheck({
      stationId: station.id,
      observationType: 'waterLevel'
    })

    expect(realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })).toHaveLength(1)
    expect(reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    }).length).toBeGreaterThan(0)
    expect(qualityCheckService.getLatestRunSummary({
      stationId: station.id,
      observationType: 'waterLevel',
      scopeType: 'station'
    })).toBeTruthy()

    const deleted = stationService.deleteStation(station.id)
    expect(deleted.success).toBe(true)
    expect(stationService.getStation(station.id)).toBeNull()
    expect(realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })).toHaveLength(0)
    expect(reviewTaskService.listReviewTasks({
      stationId: station.id,
      observationType: 'waterLevel',
      status: 'all'
    })).toHaveLength(0)
    expect(qualityCheckService.getLatestRunSummary({
      stationId: station.id,
      observationType: 'waterLevel',
      scopeType: 'station'
    })).toBeNull()
  })
})
