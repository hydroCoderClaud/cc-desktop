const { RULE_CATEGORY, RULE_SEVERITY, REVIEW_TASK_STATUS, createRuleHit } = require('../rule-types')

const missingManualRule = {
  code: 'W-001',
  name: '人工观测值缺失',
  category: RULE_CATEGORY.completeness,
  severityDefault: RULE_SEVERITY.warning,
  run(context = {}) {
    const slot = context.slot || {}
    const expectedSources = context.expectedSources || {}
    if (!expectedSources.manual || typeof slot.manualValue === 'number') {
      return []
    }

    return [
      createRuleHit({
        ruleCode: this.code,
        ruleName: this.name,
        ruleCategory: this.category,
        severity: this.severityDefault,
        status: REVIEW_TASK_STATUS.needsReview,
        stationId: slot.stationId,
        observationType: slot.observationType,
        slotTime: slot.slotTime,
        title: '人工观测值缺失',
        decisionMessage: '当前时槽缺少人工观测值，无法直接完成人工值校核。',
        suggestedAction: '请补录人工观测值，或人工确认当前时槽无人工记录。',
        evidenceSummary: `时槽 ${slot.slotTime || '--'} 未找到人工观测值。`,
        anomalyType: 'missing_manual',
        metrics: {
          manualValue: null
        }
      })
    ]
  }
}

module.exports = {
  missingManualRule
}
