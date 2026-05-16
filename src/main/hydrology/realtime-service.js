const SOURCE_TYPES = {
  manual: 'manual',
  telemetry: 'telemetry',
  videoOcr: 'video_ocr',
  corrected: 'corrected'
}

const COMPARE_STATUS = {
  notCompared: 'not_compared',
  consistent: 'consistent',
  slightlyDiff: 'slightly_diff',
  significantDiff: 'significant_diff',
  conflict: 'conflict',
  missingReference: 'missing_reference'
}

const GOVERNANCE_STATUS = {
  normalized: 'normalized',
  corrected: 'corrected'
}

const { ReviewTaskService } = require('./review-task-service')
const { parseReviewTaskRow } = require('./review-task-helpers')

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatSlotTime(date) {
  const d = new Date(date)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00`
}

function normalizeObservedAt(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效时间: ${value}`)
  }
  return {
    date,
    observedAt: date.toISOString(),
    slotTime: formatSlotTime(date)
  }
}

function normalizeSlotTimeValue(value) {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(typeof value === 'string' ? value.replace(' ', 'T') : value)
  if (Number.isNaN(date.getTime())) {
    throw new Error(`无效时槽时间: ${value}`)
  }
  return formatSlotTime(date)
}

function toNumber(value) {
  if (value == null || value === '') return null
  const normalized = Number(value)
  return Number.isNaN(normalized) ? null : normalized
}

function toTimestamp(value) {
  if (!value) return null
  const normalized = typeof value === 'string' ? value.replace(' ', 'T') : value
  const date = normalized instanceof Date ? normalized : new Date(normalized)
  const timestamp = date.getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

function normalizeObservationInput(input = {}) {
  const observationId = String(input.id || '').trim() || null
  const stationId = String(input.stationId || '').trim()
  const observationType = String(input.observationType || '').trim()
  const sourceType = String(input.sourceType || '').trim()
  if (!stationId) throw new Error('站点 ID 不能为空')
  if (!observationType) throw new Error('观测类型不能为空')
  if (!sourceType) throw new Error('来源类型不能为空')

  const { observedAt, slotTime: derivedSlotTime } = normalizeObservedAt(input.observedAt || input.slotTime || Date.now())
  const slotTime = normalizeSlotTimeValue(input.slotTime) || derivedSlotTime
  const value = toNumber(input.value)
  if (value == null) throw new Error('观测值不能为空')

  return {
    id: observationId,
    stationId,
    observationType,
    sourceType,
    observedAt,
    slotTime,
    value,
    unit: String(input.unit || '').trim() || null,
    sourceRefId: String(input.sourceRefId || '').trim() || null,
    governanceStatus: String(input.governanceStatus || GOVERNANCE_STATUS.normalized).trim(),
    reviewStatus: String(input.reviewStatus || 'none').trim(),
    qualityFlag: String(input.qualityFlag || 'normal').trim(),
    metadata: input.metadata && typeof input.metadata === 'object' ? input.metadata : {}
  }
}

function normalizeCorrectionInput(input = {}) {
  const stationId = String(input.stationId || '').trim()
  const observationType = String(input.observationType || '').trim()
  if (!stationId) throw new Error('站点 ID 不能为空')
  if (!observationType) throw new Error('观测类型不能为空')

  const { observedAt, slotTime } = normalizeObservedAt(input.targetTime || input.observedAt)
  const beforeValue = toNumber(input.beforeValue)
  const afterValue = toNumber(input.afterValue)
  if (beforeValue == null || afterValue == null) {
    throw new Error('修正前后数值不能为空')
  }

  return {
    stationId,
    observationType,
    targetTime: observedAt,
    slotTime,
    beforeValue,
    afterValue,
    reason: String(input.reason || '').trim() || '人工修正',
    approver: String(input.approver || '').trim() || '系统用户'
  }
}

function parseRow(row) {
  if (!row) return null
  return {
    id: row.id,
    stationId: row.station_id,
    observationType: row.observation_type,
    sourceType: row.source_type,
    observedAt: row.observed_at,
    slotTime: row.slot_time,
    value: row.value,
    unit: row.unit,
    sourceRefId: row.source_ref_id || null,
    governanceStatus: row.governance_status,
    reviewStatus: row.review_status,
    qualityFlag: row.quality_flag,
    metadata: JSON.parse(row.metadata || '{}'),
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function parseStationRow(row) {
  if (!row) return null
  return {
    id: row.id,
    code: row.code || '',
    name: row.name || '',
    observationTypes: JSON.parse(row.observation_types || '[]'),
    dataSources: JSON.parse(row.data_sources || '{}'),
    validationRules: JSON.parse(row.validation_rules || '{}')
  }
}

function normalizeRealtimeFilters(filters = {}) {
  const date = String(filters.date || '').trim()
  let fromTime = toTimestamp(filters.fromTime)
  let toTime = toTimestamp(filters.toTime)
  if (date && fromTime == null && toTime == null) {
    fromTime = toTimestamp(`${date}T00:00:00`)
    toTime = toTimestamp(`${date}T23:59:59`)
  }

  return {
    stationId: String(filters.stationId || '').trim(),
    observationType: String(filters.observationType || '').trim() || null,
    compareStatus: String(filters.compareStatus || '').trim() && filters.compareStatus !== 'all'
      ? String(filters.compareStatus).trim()
      : null,
    hasAnomaly: filters.hasAnomaly === true || filters.hasAnomaly === 'true',
    viewMode: String(filters.viewMode || 'slot').trim() === 'raw' ? 'raw' : 'slot',
    date: date || null,
    fromTime,
    toTime
  }
}

function matchesTimeRange(value, filters) {
  const timestamp = toTimestamp(value)
  if (timestamp == null) return false
  if (filters.fromTime != null && timestamp < filters.fromTime) return false
  if (filters.toTime != null && timestamp > filters.toTime) return false
  return true
}

function getExpectedSources(station, observationType) {
  const dataSources = station?.dataSources || {}
  return {
    manual: !!dataSources.manual,
    telemetry: !!dataSources.telemetry,
    videoOcr: observationType === 'waterLevel' && !!dataSources.videoOcr
  }
}

function getStationRuleProfile(station, observationType) {
  return station?.validationRules?.[observationType] || {}
}

function getTelemetrySlotWindow(slotTime) {
  const slotDate = new Date(String(slotTime).replace(' ', 'T'))
  if (Number.isNaN(slotDate.getTime())) {
    return { start: null, end: null }
  }
  return {
    start: slotDate.getTime() - (55 * 60 * 1000),
    end: slotDate.getTime()
  }
}

function getTelemetryRepresentativeObservation(observations, slotTime) {
  if (!Array.isArray(observations) || observations.length === 0) return null
  const telemetryWindow = getTelemetrySlotWindow(slotTime)
  if (telemetryWindow.end == null) return null

  for (let index = observations.length - 1; index >= 0; index -= 1) {
    const item = observations[index]
    if (toTimestamp(item?.observedAt) === telemetryWindow.end) {
      return item
    }
  }
  return null
}

function filterObservationsForSlot(observations, slotTime) {
  if (!Array.isArray(observations) || observations.length === 0) return []
  const telemetryWindow = getTelemetrySlotWindow(slotTime)

  return observations.filter((item) => {
    if (item.sourceType !== SOURCE_TYPES.telemetry) return true
    const timestamp = toTimestamp(item.observedAt)
    if (timestamp == null || telemetryWindow.start == null || telemetryWindow.end == null) return false
    return timestamp >= telemetryWindow.start && timestamp <= telemetryWindow.end
  })
}

function buildCompareStatus(values) {
  const present = values.filter((value) => typeof value === 'number')
  if (present.length <= 1) return COMPARE_STATUS.missingReference

  const min = Math.min(...present)
  const max = Math.max(...present)
  const diff = Math.abs(max - min)
  if (diff === 0) return COMPARE_STATUS.consistent
  if (diff <= 0.05) return COMPARE_STATUS.slightlyDiff
  if (diff <= 0.2) return COMPARE_STATUS.significantDiff
  return COMPARE_STATUS.conflict
}

function buildMissingFlags(slot, expectedSources) {
  const flags = []
  if (expectedSources.manual && slot.manualValue == null) flags.push('missing_manual')
  if (expectedSources.telemetry && slot.telemetryValue == null) flags.push('missing_telemetry')
  if (expectedSources.videoOcr && slot.videoOcrValue == null) flags.push('missing_video_ocr')
  return flags
}

function createDerivedAnomaly(slotId, slotTime, anomalyType, severity, description) {
  return {
    id: `derived-${slotId}-${anomalyType}`,
    slotTime,
    anomalyType,
    severity,
    description,
    status: 'open',
    derived: true
  }
}

function buildDerivedAnomalies(slot) {
  const missingFlags = Array.isArray(slot.missingFlags) ? slot.missingFlags : []
  const derived = missingFlags.map((flag) => {
    if (flag === 'missing_manual') {
      return createDerivedAnomaly(slot.id, slot.slotTime, flag, 'warning', '当前时槽缺少人工观测值')
    }
    if (flag === 'missing_telemetry') {
      return createDerivedAnomaly(slot.id, slot.slotTime, flag, 'warning', '当前时槽缺少遥测参考值')
    }
    return createDerivedAnomaly(slot.id, slot.slotTime, flag, 'warning', '当前时槽缺少视频识别值')
  })

  return derived
}

function getSeriesName(sourceType) {
  if (sourceType === SOURCE_TYPES.manual) return '人工值'
  if (sourceType === SOURCE_TYPES.telemetry) return '遥测参考值'
  if (sourceType === SOURCE_TYPES.videoOcr) return '视频识别值'
  if (sourceType === SOURCE_TYPES.corrected) return '人工修正值'
  return sourceType
}

function getChosenSourceType({ manual, telemetry, videoOcr }) {
  if (manual?.value != null) return SOURCE_TYPES.manual
  if (telemetry?.value != null) return SOURCE_TYPES.telemetry
  if (videoOcr?.value != null) return SOURCE_TYPES.videoOcr
  return null
}

function toSlotDeleteSourceTypes(sourceTypes = []) {
  const allowed = new Set([SOURCE_TYPES.manual, SOURCE_TYPES.videoOcr, SOURCE_TYPES.corrected])
  const normalized = Array.isArray(sourceTypes)
    ? sourceTypes.map((item) => String(item || '').trim()).filter((item) => allowed.has(item))
    : []
  return normalized.length > 0
    ? Array.from(new Set(normalized))
    : [SOURCE_TYPES.manual, SOURCE_TYPES.videoOcr, SOURCE_TYPES.corrected]
}

class RealtimeService {
  constructor(hydrologyDatabase, options = {}) {
    this.db = hydrologyDatabase
    this.reviewTaskService = options.reviewTaskService || new ReviewTaskService(hydrologyDatabase)
  }

  refreshSlotState(stationId, observationType, slotTime) {
    const observations = filterObservationsForSlot(
      this.db.listObservationsBySlot(stationId, observationType, slotTime).map(parseRow),
      slotTime
    )
    if (observations.length === 0) {
      const existingSlot = this.db.getObservationSlotByKey(stationId, observationType, slotTime)
      if (existingSlot?.id) {
        this.db.deleteObservationSlotById(existingSlot.id)
      }
      this.reviewTaskService?.syncSlotReviewTasks({
        station: parseStationRow(this.db.getStationById?.(stationId)),
        slot: {
          stationId,
          observationType,
          slotTime,
          chosenValue: null,
          manualValue: null,
          correctedValue: null,
          telemetryValue: null,
          videoOcrValue: null,
          compareStatus: COMPARE_STATUS.notCompared,
          missingFlags: []
        },
        previousSlot: null,
        observations: [],
        expectedSources: {},
        stationRules: {}
      })
      return null
    }

    const slotAggregate = this.buildSlotAggregate(stationId, observationType, slotTime)
    this.db.upsertObservationSlot(slotAggregate)
    this.syncReviewTasksForSlot(stationId, observationType, slotTime, slotAggregate)
    return slotAggregate
  }

  saveObservation(input) {
    const observation = normalizeObservationInput(input)
    const saved = this.db.createObservation(observation)
    this.refreshSlotState(observation.stationId, observation.observationType, observation.slotTime)
    return parseRow(saved)
  }

  updateObservation(input = {}) {
    const observationId = String(input.id || '').trim()
    if (!observationId) throw new Error('观测记录 ID 不能为空')
    const existing = this.db.getObservationById(observationId)
    if (!existing) throw new Error('观测记录不存在')
    const existingParsed = parseRow(existing)
    const hasExplicitObservedAt = Object.prototype.hasOwnProperty.call(input, 'observedAt')
    const hasExplicitSlotTime = Object.prototype.hasOwnProperty.call(input, 'slotTime')

    const observation = normalizeObservationInput({
      ...existingParsed,
      slotTime: hasExplicitObservedAt && !hasExplicitSlotTime ? undefined : existingParsed.slotTime,
      ...input,
      id: observationId,
      stationId: existing.station_id,
      observationType: existing.observation_type,
      sourceType: existing.source_type
    })
    const saved = this.db.updateObservation(observation)
    if (existingParsed.slotTime !== observation.slotTime) {
      this.refreshSlotState(existingParsed.stationId, existingParsed.observationType, existingParsed.slotTime)
    }
    this.refreshSlotState(observation.stationId, observation.observationType, observation.slotTime)
    return parseRow(saved)
  }

  deleteObservation(observationId) {
    const id = String(observationId || '').trim()
    if (!id) throw new Error('观测记录 ID 不能为空')
    const existing = this.db.getObservationById(id)
    if (!existing) throw new Error('观测记录不存在')
    const parsed = parseRow(existing)
    this.db.deleteObservation(id)
    this.refreshSlotState(parsed.stationId, parsed.observationType, parsed.slotTime)
    return {
      id: parsed.id,
      stationId: parsed.stationId,
      observationType: parsed.observationType,
      slotTime: parsed.slotTime,
      sourceType: parsed.sourceType
    }
  }

  deleteSlotObservations(input = {}) {
    const stationId = String(input.stationId || '').trim()
    const observationType = String(input.observationType || '').trim()
    const slotTime = normalizeSlotTimeValue(input.slotTime)
    if (!stationId) throw new Error('站点 ID 不能为空')
    if (!observationType) throw new Error('观测类型不能为空')
    if (!slotTime) throw new Error('时槽时间不能为空')

    const sourceTypes = toSlotDeleteSourceTypes(input.sourceTypes)
    const observations = this.db.listObservationsBySlot(stationId, observationType, slotTime).map(parseRow)
    const deletable = observations.filter((item) => sourceTypes.includes(item.sourceType))

    deletable.forEach((item) => {
      this.db.deleteObservation(item.id)
    })

    this.refreshSlotState(stationId, observationType, slotTime)
    return {
      stationId,
      observationType,
      slotTime,
      deletedCount: deletable.length,
      deletedObservationIds: deletable.map((item) => item.id),
      deletedSourceTypes: sourceTypes
    }
  }

  listRealtimeSlots(filters = {}) {
    const normalized = normalizeRealtimeFilters(filters)
    if (!normalized.stationId) throw new Error('站点 ID 不能为空')

    const rows = this.db.listObservationSlots(normalized.stationId, normalized.observationType)
    return rows
      .map((row) => ({
        id: row.id,
        stationId: row.station_id,
        observationType: row.observation_type,
        slotTime: row.slot_time,
        manualValue: row.manual_value,
        correctedValue: row.corrected_value ?? null,
        telemetryValue: row.telemetry_value,
        videoOcrValue: row.video_ocr_value,
        chosenValue: row.chosen_value,
        compareStatus: row.compare_status,
        missingFlags: JSON.parse(row.missing_flags || '[]'),
        hasAnomaly: !!row.has_anomaly,
        anomalyCount: row.anomaly_count || 0,
        createdAt: row.created_at || null,
        updatedAt: row.updated_at || null
      }))
      .filter((slot) => {
        if (!matchesTimeRange(slot.slotTime, normalized)) return false
        if (normalized.compareStatus && slot.compareStatus !== normalized.compareStatus) return false
        if (normalized.hasAnomaly && !slot.hasAnomaly) return false
        return true
      })
  }

  getRealtimeSlotDetail(slotId) {
    if (!slotId) throw new Error('时槽 ID 不能为空')
    const slot = this.db.getObservationSlotById(slotId)
    if (!slot) return null

    const observations = filterObservationsForSlot(
      this.db.listObservationsBySlot(slot.station_id, slot.observation_type, slot.slot_time).map(parseRow),
      slot.slot_time
    )

    const manualObservation = observations.find((item) => item.sourceType === SOURCE_TYPES.manual) || null
    const correctedObservation = observations.find((item) => item.sourceType === SOURCE_TYPES.corrected) || null
    const telemetryObservations = observations.filter((item) => item.sourceType === SOURCE_TYPES.telemetry)
    const videoOcrObservation = observations.find((item) => item.sourceType === SOURCE_TYPES.videoOcr) || null
    const telemetryObservation = getTelemetryRepresentativeObservation(telemetryObservations, slot.slot_time)
    const chosenSourceType = getChosenSourceType({
      manual: manualObservation,
      telemetry: telemetryObservation,
      videoOcr: videoOcrObservation
    })
    const slotPayload = {
      id: slot.id,
      slotTime: slot.slot_time,
      compareStatus: slot.compare_status,
      missingFlags: JSON.parse(slot.missing_flags || '[]')
    }
    const persistedAnomalies = this.db.listAnomaliesBySlot(slot.station_id, slot.observation_type, slot.slot_time)
      .map((row) => ({
        id: row.id,
        slotTime: row.slot_time,
        anomalyType: row.anomaly_type,
        severity: row.severity,
        description: row.description,
        status: row.status
      }))
    const persistedAnomalyKeys = new Set(
      persistedAnomalies
        .map((item) => item.anomalyType || item.id)
        .filter(Boolean)
    )
    const anomalyMap = new Map()
    persistedAnomalies
      .filter((item) => item.status !== 'closed')
      .forEach((item) => anomalyMap.set(item.anomalyType || item.id, item))
    buildDerivedAnomalies(slotPayload).forEach((item) => {
      const dedupeKey = item.anomalyType || item.id
      if (persistedAnomalyKeys.has(dedupeKey)) {
        return
      }
      if (!anomalyMap.has(dedupeKey)) {
        anomalyMap.set(dedupeKey, item)
      }
    })
    const reviewTasks = this.db
      .listReviewTasks(slot.station_id, slot.observation_type, 'all')
      .filter((row) => row.slot_time === slot.slot_time)
      .map(parseReviewTaskRow)

    return {
      slot: {
        id: slot.id,
        stationId: slot.station_id,
        observationType: slot.observation_type,
        slotTime: slot.slot_time,
        manualValue: slot.manual_value,
        correctedValue: slot.corrected_value ?? null,
        telemetryValue: slot.telemetry_value,
        videoOcrValue: slot.video_ocr_value,
        chosenValue: slot.chosen_value,
        chosenSourceType,
        compareStatus: slot.compare_status,
        missingFlags: JSON.parse(slot.missing_flags || '[]')
      },
      manualObservation,
      correctedObservation,
      telemetryObservations,
      videoOcrObservation,
      sourceObservations: observations,
      anomalies: Array.from(anomalyMap.values()),
      reviewTasks
    }
  }

  listRealtimeTrend(filters = {}) {
    const normalized = normalizeRealtimeFilters(filters)
    if (!normalized.stationId) throw new Error('站点 ID 不能为空')
    if (!normalized.observationType) throw new Error('观测类型不能为空')

    if (normalized.viewMode === 'raw') {
      const slots = this.listRealtimeSlots(normalized)
      const observations = slots
        .flatMap((slot) => this.db.listObservationsBySlot(normalized.stationId, normalized.observationType, slot.slotTime))
        .map(parseRow)
        .filter((item) => {
          if (item.sourceType !== SOURCE_TYPES.telemetry) return true
          const slot = slots.find((current) => current.slotTime === item.slotTime)
          if (!slot) return false
          return filterObservationsForSlot([item], slot.slotTime).length > 0
        })
        .filter((item) => matchesTimeRange(item.observedAt, normalized))

      const groups = new Map()
      observations.forEach((item) => {
        if (!groups.has(item.sourceType)) {
          groups.set(item.sourceType, [])
        }
        groups.get(item.sourceType).push([item.observedAt, item.value])
      })

      return {
        stationId: normalized.stationId,
        observationType: normalized.observationType,
        viewMode: normalized.viewMode,
        fromTime: normalized.fromTime != null ? new Date(normalized.fromTime).toISOString() : null,
        toTime: normalized.toTime != null ? new Date(normalized.toTime).toISOString() : null,
        series: Array.from(groups.entries())
          .map(([sourceType, points]) => ({
            name: getSeriesName(sourceType),
            sourceType,
            points: points.sort((left, right) => toTimestamp(left[0]) - toTimestamp(right[0]))
          }))
          .filter((item) => item.points.length > 0)
      }
    }

    const slots = this.listRealtimeSlots(normalized)
    const slotSeries = [
      { name: '人工值', sourceType: SOURCE_TYPES.manual, accessor: (slot) => slot.manualValue },
      { name: '遥测参考值', sourceType: SOURCE_TYPES.telemetry, accessor: (slot) => slot.telemetryValue },
      { name: '视频识别值', sourceType: SOURCE_TYPES.videoOcr, accessor: (slot) => slot.videoOcrValue },
      { name: '采用值', sourceType: 'chosen', accessor: (slot) => slot.chosenValue }
    ]

    return {
      stationId: normalized.stationId,
      observationType: normalized.observationType,
      viewMode: normalized.viewMode,
      fromTime: normalized.fromTime != null ? new Date(normalized.fromTime).toISOString() : null,
      toTime: normalized.toTime != null ? new Date(normalized.toTime).toISOString() : null,
      series: slotSeries
        .map((item) => ({
          name: item.name,
          sourceType: item.sourceType,
          points: slots
            .filter((slot) => typeof item.accessor(slot) === 'number')
            .map((slot) => [slot.slotTime, item.accessor(slot)])
        }))
        .filter((item) => item.points.length > 0)
    }
  }

  applyCorrection(input) {
    const correction = normalizeCorrectionInput(input)
    const savedCorrection = this.db.createCorrection(correction)

    this.saveObservation({
      stationId: correction.stationId,
      observationType: correction.observationType,
      sourceType: SOURCE_TYPES.corrected,
      observedAt: correction.targetTime,
      value: correction.afterValue,
      sourceRefId: savedCorrection.id,
      governanceStatus: GOVERNANCE_STATUS.corrected,
      reviewStatus: 'corrected',
      qualityFlag: 'normal',
      metadata: {
        correctionId: savedCorrection.id,
        reason: correction.reason,
        approver: correction.approver,
        beforeValue: correction.beforeValue
      }
    })

    const slotAggregate = this.buildSlotAggregate(correction.stationId, correction.observationType, correction.slotTime)
    this.db.upsertObservationSlot(slotAggregate)
    this.syncReviewTasksForSlot(correction.stationId, correction.observationType, correction.slotTime, slotAggregate)
    return {
      id: savedCorrection.id,
      stationId: correction.stationId,
      observationType: correction.observationType,
      targetTime: correction.targetTime,
      beforeValue: correction.beforeValue,
      afterValue: correction.afterValue,
      reason: correction.reason,
      approver: correction.approver
    }
  }

  buildSlotAggregate(stationId, observationType, slotTime) {
    const observations = filterObservationsForSlot(
      this.db.listObservationsBySlot(stationId, observationType, slotTime).map(parseRow),
      slotTime
    )
    const station = parseStationRow(this.db.getStationById?.(stationId))
    const expectedSources = getExpectedSources(station, observationType)

    const manual = observations.find((item) => item.sourceType === SOURCE_TYPES.manual) || null
    const telemetryList = observations.filter((item) => item.sourceType === SOURCE_TYPES.telemetry)
    const telemetry = getTelemetryRepresentativeObservation(telemetryList, slotTime)
    const videoOcr = observations.find((item) => item.sourceType === SOURCE_TYPES.videoOcr) || null

    const corrected = observations.find((item) => item.sourceType === SOURCE_TYPES.corrected) || null
    const chosenValue = manual?.value ?? telemetry?.value ?? videoOcr?.value ?? null
    const compareStatus = buildCompareStatus([manual?.value, telemetry?.value, videoOcr?.value].filter((item) => item != null))
    const missingFlags = buildMissingFlags({
      manualValue: manual?.value ?? null,
      telemetryValue: telemetry?.value ?? null,
      videoOcrValue: videoOcr?.value ?? null
    }, expectedSources)
    const derivedAnomalies = buildDerivedAnomalies({
      id: `${stationId}-${observationType}-${slotTime}`,
      slotTime,
      compareStatus,
      missingFlags
    })

    return {
      stationId,
      observationType,
      slotTime,
      manualValue: manual?.value ?? null,
      correctedValue: corrected?.value ?? null,
      telemetryValue: telemetry?.value ?? null,
      videoOcrValue: videoOcr?.value ?? null,
      chosenValue,
      compareStatus,
      missingFlags,
      hasAnomaly: derivedAnomalies.length > 0,
      anomalyCount: derivedAnomalies.length
    }
  }

  syncReviewTasksForSlot(stationId, observationType, slotTime, slotAggregate = null) {
    if (!this.reviewTaskService) {
      return {
        hits: [],
        ruleEvaluations: []
      }
    }

    const slot = slotAggregate || this.buildSlotAggregate(stationId, observationType, slotTime)
    const previousSlotRow = this.db.getPreviousObservationSlot(stationId, observationType, slotTime)
    const observations = filterObservationsForSlot(
      this.db.listObservationsBySlot(stationId, observationType, slotTime).map(parseRow),
      slotTime
    )
    const station = parseStationRow(this.db.getStationById?.(stationId))
    const expectedSources = getExpectedSources(station, observationType)
    const stationRules = getStationRuleProfile(station, observationType)
    const previousSlot = previousSlotRow
      ? {
          stationId: previousSlotRow.station_id,
          observationType: previousSlotRow.observation_type,
          slotTime: previousSlotRow.slot_time,
          manualValue: previousSlotRow.manual_value,
          correctedValue: previousSlotRow.corrected_value ?? null,
          telemetryValue: previousSlotRow.telemetry_value,
          videoOcrValue: previousSlotRow.video_ocr_value,
          chosenValue: previousSlotRow.chosen_value,
          compareStatus: previousSlotRow.compare_status,
          missingFlags: JSON.parse(previousSlotRow.missing_flags || '[]')
        }
      : null

    return this.reviewTaskService.syncSlotReviewTasks({
      station,
      slot: {
        ...slot,
        stationId,
        observationType,
        slotTime
      },
      previousSlot,
      observations,
      expectedSources,
      stationRules
    })
  }
}

module.exports = {
  RealtimeService,
  SOURCE_TYPES,
  COMPARE_STATUS,
  GOVERNANCE_STATUS
}
