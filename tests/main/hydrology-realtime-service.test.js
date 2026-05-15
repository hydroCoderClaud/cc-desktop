import { describe, it, expect, beforeEach } from 'vitest'
import Database from '../mocks/better-sqlite3.js'

function buildTelemetryWindow(slotTime) {
  const slotDate = new Date(`${slotTime.replace(' ', 'T')}:00+08:00`)
  return {
    first: new Date(slotDate.getTime() - 55 * 60 * 1000).toISOString(),
    last: slotDate.toISOString()
  }
}

describe('Hydrology realtime backend', () => {
  beforeEach(() => {
    globalThis.resetMemoryDB?.()
  })

  it('seeds realtime observations and exposes slot detail', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService } = await import('../../src/main/hydrology/realtime-service.js')
    const { RealtimeDemoSeeder } = await import('../../src/main/hydrology/realtime-demo-seeder.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const realtimeService = new RealtimeService(db)
    const realtimeDemoSeeder = new RealtimeDemoSeeder(realtimeService)
    const station = stationService.saveStation({
      code: 'HD100',
      name: '青溪站',
      observationTypes: ['waterLevel', 'airTemperature'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: true
      }
    })

    realtimeDemoSeeder.seedStationObservations(station)

    const slots = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })

    expect(slots.length).toBe(72)
    expect(slots[0].telemetryValue).not.toBeNull()

    const detail = realtimeService.getRealtimeSlotDetail(slots[0].id)
    const telemetryWindow = buildTelemetryWindow(slots[0].slotTime)
    expect(detail.slot.id).toBe(slots[0].id)
    expect(detail.telemetryObservations.length).toBe(12)
    expect(detail.telemetryObservations[0].observedAt).toBe(telemetryWindow.first)
    expect(detail.telemetryObservations[11].observedAt).toBe(telemetryWindow.last)
    expect(detail.anomalies).toEqual([])
  })

  it('applies manual correction and refreshes chosen slot value', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService } = await import('../../src/main/hydrology/realtime-service.js')
    const { RealtimeDemoSeeder } = await import('../../src/main/hydrology/realtime-demo-seeder.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const realtimeService = new RealtimeService(db)
    const realtimeDemoSeeder = new RealtimeDemoSeeder(realtimeService)
    const station = stationService.saveStation({
      code: 'HD101',
      name: '东港站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: false
      }
    })

    realtimeDemoSeeder.seedStationObservations(station)
    const slot = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })[0]

    const correction = realtimeService.applyCorrection({
      stationId: station.id,
      observationType: 'waterLevel',
      targetTime: slot.slotTime,
      beforeValue: slot.chosenValue,
      afterValue: 4.99,
      reason: '人工复核确认录入错误'
    })

    expect(correction.afterValue).toBe(4.99)

    const refreshed = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    }).find((item) => item.id === slot.id)

    expect(refreshed.chosenValue).toBe(4.99)
    expect(refreshed.hasAnomaly).toBe(false)
    const detail = realtimeService.getRealtimeSlotDetail(slot.id)
    expect(detail.slot.manualValue).toBe(4.99)
    expect(detail.anomalies).toEqual([])
  })

  it('supports realtime filters and trend queries', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService } = await import('../../src/main/hydrology/realtime-service.js')
    const { RealtimeDemoSeeder } = await import('../../src/main/hydrology/realtime-demo-seeder.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const realtimeService = new RealtimeService(db)
    const realtimeDemoSeeder = new RealtimeDemoSeeder(realtimeService)
    const station = stationService.saveStation({
      code: 'HD102',
      name: '白石站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: true
      }
    })

    realtimeDemoSeeder.seedStationObservations(station)
    const slots = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    }).sort((left, right) => left.slotTime.localeCompare(right.slotTime))

    expect(slots.length).toBeGreaterThan(2)

    const filtered = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel',
      compareStatus: 'slightly_diff',
      fromTime: slots[1].slotTime,
      toTime: slots[2].slotTime
    })

    expect(filtered).toHaveLength(2)
    expect(filtered.every((item) => item.compareStatus === 'slightly_diff')).toBe(true)

    const slotTrend = realtimeService.listRealtimeTrend({
      stationId: station.id,
      observationType: 'waterLevel',
      fromTime: slots[1].slotTime,
      toTime: slots[2].slotTime,
      viewMode: 'slot'
    })

    expect(slotTrend.series.find((item) => item.sourceType === 'manual')?.points.length).toBe(2)
    expect(slotTrend.series.find((item) => item.sourceType === 'telemetry')?.points.length).toBe(2)

    const rawTrend = realtimeService.listRealtimeTrend({
      stationId: station.id,
      observationType: 'waterLevel',
      fromTime: slots[1].slotTime,
      toTime: slots[2].slotTime,
      viewMode: 'raw'
    })

    expect(rawTrend.series.find((item) => item.sourceType === 'telemetry')?.points.length).toBeGreaterThan(2)
  })

  it('tops up legacy demo data to full three-day coverage', async () => {
    const { HydrologyDatabase } = await import('../../src/main/hydrology/hydrology-database.js')
    const { StationService } = await import('../../src/main/hydrology/station-service.js')
    const { RealtimeService, SOURCE_TYPES } = await import('../../src/main/hydrology/realtime-service.js')
    const { RealtimeDemoSeeder } = await import('../../src/main/hydrology/realtime-demo-seeder.js')

    const db = new HydrologyDatabase({
      userDataPath: 'C:/tmp/cc-desktop-test',
      Database
    })
    db.init()

    const stationService = new StationService(db)
    const realtimeService = new RealtimeService(db)
    const realtimeDemoSeeder = new RealtimeDemoSeeder(realtimeService)
    const station = stationService.saveStation({
      code: 'HD103',
      name: '临江站',
      observationTypes: ['waterLevel'],
      dataSources: {
        manual: true,
        telemetry: true,
        videoOcr: true
      }
    })

    const now = new Date()
    now.setMinutes(0, 0, 0)
    for (let hoursAgo = 3; hoursAgo >= 0; hoursAgo -= 1) {
      const hourDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
      realtimeService.saveObservation({
        stationId: station.id,
        observationType: 'waterLevel',
        sourceType: SOURCE_TYPES.manual,
        observedAt: hourDate.toISOString(),
        value: Number((5.1 + hoursAgo * 0.02).toFixed(2)),
        unit: 'm'
      })
    }

    expect(realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })).toHaveLength(4)

    realtimeDemoSeeder.seedStationObservations(station)

    const slots = realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: 'waterLevel'
    })

    expect(slots).toHaveLength(72)
    const detail = realtimeService.getRealtimeSlotDetail(slots[0].id)
    const telemetryWindow = buildTelemetryWindow(slots[0].slotTime)
    expect(detail.telemetryObservations).toHaveLength(12)
    expect(detail.telemetryObservations[0].observedAt).toBe(telemetryWindow.first)
    expect(detail.telemetryObservations[11].observedAt).toBe(telemetryWindow.last)
  })
})
