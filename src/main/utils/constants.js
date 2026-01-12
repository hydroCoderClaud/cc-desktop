/**
 * Global constants for main process
 */

// API Configuration Defaults
const API_DEFAULTS = {
  BASE_URL: 'https://api.anthropic.com',
  MODEL: 'claude-sonnet-4-5-20250929',
  AUTH_TYPE: 'api_key',
  ANTHROPIC_VERSION: '2023-06-01'
};

// Proxy Defaults
const PROXY_DEFAULTS = {
  HTTPS_PROXY: 'http://127.0.0.1:7890',
  HTTP_PROXY: 'http://127.0.0.1:7890'
};

// Timeout Settings
const TIMEOUTS = {
  API_TEST_GLOBAL: 15000,      // 15 seconds for connection test
  API_TEST_REQUEST: 10000,     // 10 seconds for individual request
  MODEL_FETCH_GLOBAL: 10000,   // 10 seconds for model fetching
  MODEL_FETCH_REQUEST: 8000    // 8 seconds for individual request
};

// Default Models (for initialization)
const DEFAULT_MODELS = [
  { id: 'opus-4.5', name: 'claude-opus-4-5-20251101', label: 'Opus 4.5 - 最强大' },
  { id: 'sonnet-4.5', name: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 - 平衡（推荐）' },
  { id: 'haiku-4', name: 'claude-haiku-4-0-20250107', label: 'Haiku 4 - 最快' }
];

// Profile Icons
const PROFILE_ICONS = [
  '🟣', '🔵', '🟢', '🟡', '🟠', '🔴',
  '⚫', '⚪', '🟤', '🔷', '🔶', '🔸',
  '🌟', '⭐', '✨', '💫', '🚀', '🎯'
];

module.exports = {
  API_DEFAULTS,
  PROXY_DEFAULTS,
  TIMEOUTS,
  DEFAULT_MODELS,
  PROFILE_ICONS
};
