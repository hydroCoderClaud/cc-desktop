/**
 * Global constants for main process
 */

// API Configuration Defaults
const API_DEFAULTS = {
  BASE_URL: 'https://api.anthropic.com',
  MODEL: 'claude-sonnet-4-6',
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

// First-run provider templates. API Profiles hold credentials and the selected model.
const SERVICE_PROVIDERS = {
  qwen: {
    label: '千问tokenplan',
    baseUrl: 'https://coding.dashscope.aliyuncs.com/apps/anthropic',
    defaultModels: [
      'qwen3.7-plus',
      'qwen3.7-max',
      'qwen-image-2.0-pro',
      'wan2.7-image-pro',
      'deepseek-v4-pro',
      'deepseek-v4-flash',
      'kimi-k2.7-code',
      'glm-5.2'
    ]
  },
  deepseek: {
    label: 'deepseek',
    baseUrl: 'https://api.deepseek.com/anthropic',
    defaultModels: [
      'deepseek-v4-flash[1m]',
      'deepseek-v4-pro[1m]'
    ]
  }
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
  PROFILE_ICONS
};
