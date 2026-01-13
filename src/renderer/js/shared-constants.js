/**
 * Shared Constants
 * Used across multiple modules (profile-manager, provider-manager, etc.)
 */

// Model tiers - used for model tier selection and mapping
const MODEL_TIERS = ['opus', 'sonnet', 'haiku'];

// Official service providers - these don't need model mapping
const OFFICIAL_PROVIDERS = ['official', 'proxy'];

// Default global models for official/proxy services
const DEFAULT_MODELS = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001'
};
