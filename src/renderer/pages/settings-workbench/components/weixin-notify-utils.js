export function hasSendableCapturedTarget(capturedTargets = [], accountId = null) {
  if (!Array.isArray(capturedTargets) || capturedTargets.length === 0) return false
  return capturedTargets.some(target =>
    target &&
    (!accountId || target.accountId === accountId) &&
    target.hasContextToken
  )
}

export function collectSendableTargetIds(targets = [], accountId = null) {
  const ids = new Set()
  for (const target of Array.isArray(targets) ? targets : []) {
    if (!target?.id) continue
    if (accountId && target.accountId !== accountId) continue
    if (!target.hasContextToken) continue
    ids.add(target.id)
  }
  return ids
}

export function hasNewSendableTarget(targets = [], accountId = null, baselineTargetIds = new Set()) {
  const nextIds = collectSendableTargetIds(targets, accountId)
  for (const targetId of nextIds) {
    if (!baselineTargetIds.has(targetId)) {
      return true
    }
  }
  return false
}
