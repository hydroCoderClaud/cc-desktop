const { HydrologyRuleEngine } = require('./rules/rule-engine')
const {
  parseReviewTaskRow,
  buildAutoResolutionNote,
  isPersistableObservationAnomalyHit,
  toObservationAnomalyPayload,
  resolveAnomalyType
} = require('./review-task-helpers')

class ReviewTaskService {
  constructor(hydrologyDatabase, options = {}) {
    this.db = hydrologyDatabase
    this.ruleEngine = options.ruleEngine || new HydrologyRuleEngine()
  }

  syncSlotReviewTasks(input = {}) {
    const {
      station,
      slot,
      previousSlot = null,
      observations = [],
      expectedSources = {},
      stationRules = {}
    } = input
    if (!station?.id || !slot?.slotTime || !slot?.observationType) {
      return []
    }

    const executionResult = this.ruleEngine.evaluate({
      station,
      slot,
      previousSlot,
      observations,
      expectedSources,
      stationRules,
      metadata: {
        stationCode: station.code,
        stationName: station.name
      }
    })
    const hits = Array.isArray(executionResult?.hits) ? executionResult.hits : []
    const activeRuleCodes = hits
      .map((hit) => String(hit.ruleCode || '').trim())
      .filter(Boolean)

    hits.forEach((hit) => {
      this.db.upsertReviewTask(hit)
      if (isPersistableObservationAnomalyHit(hit)) {
        this.db.upsertObservationAnomaly(toObservationAnomalyPayload(hit, {
          status: hit.status === 'resolved' ? 'closed' : 'open'
        }))
      }
    })

    const staleResolution = this.db.resolveStaleReviewTasks({
      stationId: slot.stationId,
      observationType: slot.observationType,
      slotTime: slot.slotTime,
      activeRuleCodes,
      status: 'resolved',
      resolvedBy: 'system',
      resolutionNote: buildAutoResolutionNote(slot)
    })

    for (const task of staleResolution.tasks || []) {
      if (!isPersistableObservationAnomalyHit(task)) continue
      const anomalyPayload = toObservationAnomalyPayload(task, {
        status: 'closed',
        resolutionNote: task.resolution_note || buildAutoResolutionNote(slot)
      })
      this.db.updateAnomalyStatus(anomalyPayload)
    }

    const activeAnomalyTypes = new Set(
      hits
        .filter((hit) => isPersistableObservationAnomalyHit(hit))
        .map((hit) => resolveAnomalyType(hit))
        .filter(Boolean)
    )
    const persistedAnomalies = this.db.listAnomaliesBySlot(station.id, slot.observationType, slot.slotTime)
    for (const anomaly of persistedAnomalies) {
      if (anomaly.status === 'closed') continue
      if (!anomaly.anomaly_type) continue
      if (activeAnomalyTypes.has(anomaly.anomaly_type)) continue
      this.db.updateAnomalyStatus({
        stationId: station.id,
        observationType: slot.observationType,
        slotTime: slot.slotTime,
        anomalyType: anomaly.anomaly_type,
        status: 'closed',
        resolutionNote: buildAutoResolutionNote(slot)
      })
    }

    return {
      hits,
      ruleEvaluations: Array.isArray(executionResult?.evaluations) ? executionResult.evaluations : []
    }
  }

  listReviewTasks(filters = {}) {
    const stationId = String(filters.stationId || '').trim()
    if (!stationId) throw new Error('站点 ID 不能为空')
    const observationType = String(filters.observationType || '').trim() || null
    const status = String(filters.status || '').trim() || null
    return this.db
      .listReviewTasks(stationId, observationType, status)
      .map(parseReviewTaskRow)
  }

  resolveReviewTask(taskId, payload = {}) {
    if (!taskId) throw new Error('审核任务 ID 不能为空')
    const next = this.db.resolveReviewTask(taskId, payload)
    const parsed = parseReviewTaskRow(next)
    if (isPersistableObservationAnomalyHit(parsed)) {
      this.db.updateAnomalyStatus(toObservationAnomalyPayload(parsed, {
        status: parsed.status === 'resolved' ? 'closed' : 'open',
        resolutionNote: parsed.resolutionNote
      }))
    }
    return parsed
  }

  deleteReviewTask(taskId) {
    const id = String(taskId || '').trim()
    if (!id) throw new Error('审核任务 ID 不能为空')
    return {
      taskId: id,
      deleted: (this.db.deleteReviewTask(id)?.changes || 0) > 0
    }
  }

  deleteReviewTasks(taskIds = []) {
    const ids = Array.isArray(taskIds) ? taskIds.map((item) => String(item || '').trim()).filter(Boolean) : []
    if (ids.length === 0) {
      return {
        deletedCount: 0,
        taskIds: []
      }
    }
    return this.db.deleteReviewTasks(ids)
  }
}

module.exports = {
  ReviewTaskService
}
