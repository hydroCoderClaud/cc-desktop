const { LATEST_MODEL_ALIASES } = require('./constants')

const MODEL_TIERS = ['sonnet', 'opus', 'haiku']

function normalizeModelValue(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function isModelTier(value) {
  return MODEL_TIERS.includes(normalizeModelValue(value))
}

function resolveTierModel(profile, tier) {
  const normalizedTier = normalizeModelValue(tier)
  if (!normalizedTier) return LATEST_MODEL_ALIASES.sonnet

  const selectedModelId = normalizeModelValue(profile?.selectedModelId)
  const selectedModelTier = normalizeModelValue(profile?.selectedModelTier)
  if (selectedModelId && selectedModelTier === normalizedTier) {
    return selectedModelId
  }

  const mappedModel = normalizeModelValue(profile?.modelMapping?.[normalizedTier])
  if (mappedModel) return mappedModel

  return LATEST_MODEL_ALIASES[normalizedTier] || normalizedTier
}

function resolveProfileModel(profile, selectedModel) {
  const explicitModel = normalizeModelValue(selectedModel)
  if (explicitModel) {
    return isModelTier(explicitModel)
      ? resolveTierModel(profile, explicitModel)
      : explicitModel
  }

  const selectedModelId = normalizeModelValue(profile?.selectedModelId)
  if (selectedModelId) return selectedModelId

  const selectedTier = normalizeModelValue(profile?.selectedModelTier)
  if (selectedTier) return resolveTierModel(profile, selectedTier)

  return LATEST_MODEL_ALIASES.sonnet
}

module.exports = {
  MODEL_TIERS,
  isModelTier,
  resolveTierModel,
  resolveProfileModel
}
