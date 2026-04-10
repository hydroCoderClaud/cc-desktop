export function createPendingGenerationDraft({ notebookId, toolId, sourceIds, expectedRelPath, expectedAbsPath, prompt }) {
  return {
    notebookId,
    toolId,
    sourceIds: Array.isArray(sourceIds) ? [...sourceIds] : [],
    expectedRelPath,
    expectedAbsPath,
    prompt
  }
}

export function buildDraftGenerationRequest(notebookId, draft) {
  return {
    notebookId,
    toolId: draft?.toolId || '',
    sourceIds: Array.isArray(draft?.sourceIds) ? [...draft.sourceIds] : [],
    expectedRelPath: draft?.expectedRelPath || ''
  }
}

export function createOptimisticGenerationAchievement({
  achievementId,
  toolId,
  toolName,
  outputType,
  expectedAbsPath,
  sourceIds,
  prompt
}) {
  return {
    id: achievementId,
    name: `${toolName || toolId || 'achievement'} - ${new Date().toLocaleDateString()}`,
    type: outputType || 'report',
    toolId: toolId || null,
    toolName: toolName || null,
    path: expectedAbsPath || null,
    category: outputType || 'report',
    sourceIds: Array.isArray(sourceIds) ? [...sourceIds] : [],
    prompt: prompt || '',
    status: 'generating',
    selected: false,
    createdAt: new Date().toISOString()
  }
}
