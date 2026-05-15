const { RULE_CATEGORY, RULE_SEVERITY, REVIEW_TASK_STATUS, createRuleHit } = require('../rule-types')

function resolveSeverity(compareStatus) {
  if (compareStatus === 'conflict') return RULE_SEVERITY.critical
  if (compareStatus === 'significant_diff') return RULE_SEVERITY.warning
  if (compareStatus === 'slightly_diff') return RULE_SEVERITY.info
  return null
}

function resolveTitle(compareStatus) {
  if (compareStatus === 'conflict') return '多源数值冲突'
  if (compareStatus === 'significant_diff') return '多源数值明显偏差'
  return '多源数值轻微偏差'
}

const sourceConsistencyRule = {
  code: 'W-002',
  name: '人工值与参考来源一致性检查',
  category: RULE_CATEGORY.consistency,
  severityDefault: RULE_SEVERITY.warning,
  run(context = {}) {
    const slot = context.slot || {}
    const expectedSources = context.expectedSources || {}
    const compareStatus = String(slot.compareStatus || '').trim()
    const severity = resolveSeverity(compareStatus)
    if (!severity) {
      return []
    }

    const compareTargets = []
    if (typeof slot.telemetryValue === 'number') compareTargets.push('遥测参考值')
    if (expectedSources.videoOcr && typeof slot.videoOcrValue === 'number') compareTargets.push('视频识别值')

    return [
      createRuleHit({
        ruleCode: this.code,
        ruleName: this.name,
        ruleCategory: this.category,
        severity,
        status: REVIEW_TASK_STATUS.needsReview,
        stationId: slot.stationId,
        observationType: slot.observationType,
        slotTime: slot.slotTime,
        title: resolveTitle(compareStatus),
        decisionMessage: '人工值与参考来源之间存在可见偏差，需要人工复核来源可信度与采用值。',
        suggestedAction: '请核对人工值、遥测参考值、视频识别值，并确认最终采用值。',
        evidenceSummary: `人工值与${compareTargets.join(' / ') || '参考来源'}的比对状态为 ${compareStatus}。`,
        anomalyType: 'source_inconsistency',
        metrics: {
          compareStatus,
          manualValue: slot.manualValue ?? null,
          telemetryValue: slot.telemetryValue ?? null,
          videoOcrValue: slot.videoOcrValue ?? null,
          chosenValue: slot.chosenValue ?? null
        }
      })
    ]
  }
}

module.exports = {
  sourceConsistencyRule
}
