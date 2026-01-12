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
  API_TEST: 30000,           // 30 seconds for connection test
  API_REQUEST: 120000        // 120 seconds (2 minutes) for actual requests
};

// Service Providers
const SERVICE_PROVIDERS = {
  official: { label: '官方 API', needsMapping: false },
  proxy: { label: '中转服务', needsMapping: false },
  zhipu: { label: '智谱AI', needsMapping: true },
  minimax: { label: 'MiniMax', needsMapping: true },
  qwen: { label: '阿里千问', needsMapping: true },
  other: { label: '其他第三方', needsMapping: true }
};

// Model Tiers
const MODEL_TIERS = {
  opus: {
    label: 'Claude Opus',
    description: '最强大的模型，适合复杂任务',
    icon: '🚀'
  },
  sonnet: {
    label: 'Claude Sonnet',
    description: '平衡性能与速度',
    icon: '⚡'
  },
  haiku: {
    label: 'Claude Haiku',
    description: '快速响应',
    icon: '💨'
  }
};

// Default Global Models (for official/proxy services)
const DEFAULT_GLOBAL_MODELS = {
  opus: 'claude-opus-4-5-20251101',
  sonnet: 'claude-sonnet-4-5-20250929',
  haiku: 'claude-haiku-4-5-20251001'
};

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
  SERVICE_PROVIDERS,
  MODEL_TIERS,
  DEFAULT_GLOBAL_MODELS,
  PROFILE_ICONS
};
