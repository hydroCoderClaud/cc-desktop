const { SOURCE_TYPES } = require('./realtime-service')
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const SLOT_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/

function findObservationBySource(observations, sourceType, observedAt = null) {
  return observations.find((item) => {
    if (item.sourceType !== sourceType) return false
    if (!observedAt) return true
    return item.observedAt === observedAt
  }) || null
}

function filterObservationsForSlot(observations, slotTime) {
  if (!Array.isArray(observations) || observations.length === 0) return []
  const slotTimestamp = toTimestamp(slotTime)
  if (slotTimestamp == null) return []

  const windowStart = slotTimestamp - (55 * 60 * 1000)
  const windowEnd = slotTimestamp

  return observations.filter((item) => {
    if (item.sourceType !== SOURCE_TYPES.telemetry) return true
    const timestamp = toTimestamp(item.observedAt)
    if (timestamp == null) return false
    return timestamp >= windowStart && timestamp <= windowEnd
  })
}

function formatSlotTime(date) {
  const timestamp = toTimestamp(date)
  if (timestamp == null) {
    throw new Error(`无效时间: ${date}`)
  }
  const d = new Date(timestamp + SHANGHAI_OFFSET_MS)
  const pad = (value) => String(value).padStart(2, '0')
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:00`
}

function parseShanghaiSlotTime(value) {
  const match = SLOT_TIME_PATTERN.exec(String(value || '').trim())
  if (!match) return null
  const [, year, month, day, hour, minute, second = '0'] = match
  return Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ) - SHANGHAI_OFFSET_MS
}

function toTimestamp(value) {
  if (!value) return null
  if (value instanceof Date) {
    const timestamp = value.getTime()
    return Number.isNaN(timestamp) ? null : timestamp
  }
  if (typeof value === 'string') {
    const slotTimestamp = parseShanghaiSlotTime(value)
    if (slotTimestamp != null) {
      return slotTimestamp
    }
  }
  const date = new Date(value)
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

class RealtimeDemoSeeder {
  constructor(realtimeService) {
    this.realtimeService = realtimeService
    this.db = realtimeService?.db || null
  }

  seedStationObservations(station) {
    if (!station?.id || !this.realtimeService || !this.db) return []

    const preferredType = Array.isArray(station.observationTypes) && station.observationTypes.length > 0
      ? station.observationTypes[0]
      : 'waterLevel'

    const now = new Date()
    now.setMinutes(0, 0, 0)
    const observationTypes = Array.isArray(station.observationTypes) ? station.observationTypes : ['waterLevel']
    const seedHours = 72
    const touchedSlots = new Map()

    const markTouchedSlot = (stationId, observationType, slotTime) => {
      touchedSlots.set(`${stationId}::${observationType}::${slotTime}`, {
        stationId,
        observationType,
        slotTime
      })
    }

    const seedAllSlots = () => {
      for (let hoursAgo = seedHours - 1; hoursAgo >= 0; hoursAgo -= 1) {
        const hourDate = new Date(now.getTime() - hoursAgo * 60 * 60 * 1000)
        for (const observationType of observationTypes) {
          const slotTime = formatSlotTime(hourDate)
          const existingObservations = filterObservationsForSlot(
            this.db.listObservationsBySlot(station.id, observationType, slotTime).map((row) => ({
              sourceType: row.source_type,
              observedAt: row.observed_at
            })),
            slotTime
          )

          const baseValue = observationType === 'waterLevel'
            ? 5.12 + hoursAgo * 0.03
            : 22.5 - hoursAgo * 0.4
          const manualEnabled = !!station.dataSources?.manual
          const telemetryEnabled = !!station.dataSources?.telemetry
          const videoEnabled = observationType === 'waterLevel' && !!station.dataSources?.videoOcr

          if (manualEnabled && !findObservationBySource(existingObservations, SOURCE_TYPES.manual)) {
            this.realtimeService.saveObservation({
              stationId: station.id,
              observationType,
              sourceType: SOURCE_TYPES.manual,
              observedAt: hourDate.toISOString(),
              value: Number(baseValue.toFixed(2)),
              unit: observationType === 'waterLevel' ? 'm' : '℃'
            }, { skipRefresh: true })
            markTouchedSlot(station.id, observationType, slotTime)
          }

          if (telemetryEnabled) {
            for (let minutesBefore = 55; minutesBefore >= 0; minutesBefore -= 5) {
              const telemetryDate = new Date(hourDate.getTime() - minutesBefore * 60 * 1000)
              const telemetryObservedAt = telemetryDate.toISOString()
              if (findObservationBySource(existingObservations, SOURCE_TYPES.telemetry, telemetryObservedAt)) {
                continue
              }
              this.realtimeService.saveObservation({
                stationId: station.id,
                observationType,
                sourceType: SOURCE_TYPES.telemetry,
                observedAt: telemetryObservedAt,
                slotTime,
                value: Number((baseValue + ((55 - minutesBefore) / 5) * 0.002).toFixed(2)),
                unit: observationType === 'waterLevel' ? 'm' : '℃'
              }, { skipRefresh: true })
              markTouchedSlot(station.id, observationType, slotTime)
            }
          }

          if (videoEnabled) {
            const ocrDate = new Date(hourDate)
            ocrDate.setMinutes(2, 0, 0)
            const ocrObservedAt = ocrDate.toISOString()
            if (findObservationBySource(existingObservations, SOURCE_TYPES.videoOcr, ocrObservedAt)) {
              continue
            }
            this.realtimeService.saveObservation({
              stationId: station.id,
              observationType,
              sourceType: SOURCE_TYPES.videoOcr,
              observedAt: ocrObservedAt,
              value: Number((baseValue + 0.01).toFixed(2)),
              unit: 'm',
              metadata: { confidence: 0.93 }
            }, { skipRefresh: true })
            markTouchedSlot(station.id, observationType, slotTime)
          }
        }
      }
    }

    const transaction = this.db?.db?.transaction?.bind(this.db.db)
    if (transaction) {
      transaction(seedAllSlots)()
    } else {
      seedAllSlots()
    }

    for (const slot of touchedSlots.values()) {
      this.realtimeService.refreshSlotState(slot.stationId, slot.observationType, slot.slotTime, {
        syncReviewTasks: false
      })
    }

    return this.realtimeService.listRealtimeSlots({
      stationId: station.id,
      observationType: preferredType
    })
  }
}

module.exports = {
  RealtimeDemoSeeder
}
