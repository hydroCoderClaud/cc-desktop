const { SOURCE_TYPES } = require('./realtime-service')

function findObservationBySource(observations, sourceType, observedAt = null) {
  return observations.find((item) => {
    if (item.sourceType !== sourceType) return false
    if (!observedAt) return true
    return item.observedAt === observedAt
  }) || null
}

function filterObservationsForSlot(observations, slotTime) {
  if (!Array.isArray(observations) || observations.length === 0) return []
  const slotDate = new Date(String(slotTime).replace(' ', 'T'))
  if (Number.isNaN(slotDate.getTime())) return []

  const windowStart = slotDate.getTime() - (55 * 60 * 1000)
  const windowEnd = slotDate.getTime()

  return observations.filter((item) => {
    if (item.sourceType !== SOURCE_TYPES.telemetry) return true
    const timestamp = new Date(item.observedAt).getTime()
    if (Number.isNaN(timestamp)) return false
    return timestamp >= windowStart && timestamp <= windowEnd
  })
}

function formatSlotTime(date) {
  const d = new Date(date)
  const pad = (value) => String(value).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
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
          })
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
            })
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
          })
        }
      }
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
