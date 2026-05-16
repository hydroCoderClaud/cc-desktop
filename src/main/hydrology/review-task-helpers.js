function parseReviewTaskRow(row) {
  if (!row) return null
  return {
    id: row.id,
    stationId: row.station_id,
    observationType: row.observation_type,
    slotTime: row.slot_time,
    ruleCode: row.rule_code,
    ruleName: row.rule_name,
    ruleCategory: row.rule_category,
    severity: row.severity,
    status: row.status,
    title: row.title,
    decisionMessage: row.decision_message,
    suggestedAction: row.suggested_action || '',
    evidenceSummary: row.evidence_summary || '',
    anomalyType: row.anomaly_type || null,
    metrics: JSON.parse(row.metrics || '{}'),
    resolvedBy: row.resolved_by || null,
    resolutionNote: row.resolution_note || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null
  }
}

function buildAutoResolutionNote(slot) {
  return `时槽 ${slot.slotTime} 规则复算后未再命中，系统自动收敛`
}

function resolveAnomalyType(hit) {
  return hit?.anomalyType || hit?.anomaly_type || null
}

function isPersistableObservationAnomalyHit(hit) {
  const anomalyType = resolveAnomalyType(hit)
  return typeof anomalyType === 'string' && !anomalyType.startsWith('missing_video_reference')
}

function toObservationAnomalyPayload(hit, overrides = {}) {
  if (!hit) return null

  const anomalyType = resolveAnomalyType(hit)
  return {
    stationId: overrides.stationId || hit.stationId || hit.station_id,
    observationType: overrides.observationType || hit.observationType || hit.observation_type,
    slotTime: overrides.slotTime || hit.slotTime || hit.slot_time,
    anomalyType,
    severity: overrides.severity || hit.severity,
    description: overrides.description || hit.decisionMessage || hit.description || '',
    status: overrides.status || hit.status,
    evidenceRef: overrides.evidenceRef || hit.evidenceSummary || hit.evidence_ref || null,
    resolutionNote: overrides.resolutionNote || hit.resolutionNote || hit.resolution_note || null
  }
}

module.exports = {
  parseReviewTaskRow,
  buildAutoResolutionNote,
  resolveAnomalyType,
  isPersistableObservationAnomalyHit,
  toObservationAnomalyPayload
}
