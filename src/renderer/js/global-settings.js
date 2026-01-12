/**
 * Global Settings Manager
 * Handles global model configuration and timeout settings
 */

const { ipcRenderer } = require('electron');

// Default values
const DEFAULTS = {
  globalModels: {
    opus: 'claude-opus-4-5-20251101',
    sonnet: 'claude-sonnet-4-5-20250929',
    haiku: 'claude-haiku-4-5-20251001'
  },
  timeout: {
    test: 30,      // seconds
    request: 120   // seconds
  }
};

/**
 * Initialize the page
 */
async function init() {
  console.log('[Global Settings] Initializing...');
  await loadSettings();
}

/**
 * Load current settings from backend
 */
async function loadSettings() {
  try {
    // Get global models
    const globalModels = await ipcRenderer.invoke('config:getGlobalModels');
    console.log('[Global Settings] Loaded global models:', globalModels);

    // Populate model inputs
    document.getElementById('globalOpus').value = globalModels.opus || DEFAULTS.globalModels.opus;
    document.getElementById('globalSonnet').value = globalModels.sonnet || DEFAULTS.globalModels.sonnet;
    document.getElementById('globalHaiku').value = globalModels.haiku || DEFAULTS.globalModels.haiku;

    // Get timeout settings
    const timeout = await ipcRenderer.invoke('config:getTimeout');
    console.log('[Global Settings] Loaded timeout:', timeout);

    // Populate timeout inputs (convert ms to seconds)
    document.getElementById('testTimeout').value = (timeout.test || DEFAULTS.timeout.test * 1000) / 1000;
    document.getElementById('requestTimeout').value = (timeout.request || DEFAULTS.timeout.request * 1000) / 1000;

  } catch (error) {
    console.error('[Global Settings] Error loading settings:', error);
    showMessage('加载设置失败: ' + error.message, 'error');
  }
}

/**
 * Save settings to backend
 */
async function saveSettings() {
  try {
    // Collect model values
    const globalModels = {
      opus: document.getElementById('globalOpus').value.trim(),
      sonnet: document.getElementById('globalSonnet').value.trim(),
      haiku: document.getElementById('globalHaiku').value.trim()
    };

    // Validate model names
    if (!globalModels.opus || !globalModels.sonnet || !globalModels.haiku) {
      showMessage('请填写所有模型名称', 'error');
      return;
    }

    // Collect timeout values (convert seconds to ms)
    const timeout = {
      test: parseInt(document.getElementById('testTimeout').value) * 1000,
      request: parseInt(document.getElementById('requestTimeout').value) * 1000
    };

    // Validate timeout values
    if (timeout.test < 5000 || timeout.test > 120000) {
      showMessage('连接测试超时必须在 5-120 秒之间', 'error');
      return;
    }

    if (timeout.request < 10000 || timeout.request > 600000) {
      showMessage('请求超时必须在 10-600 秒之间', 'error');
      return;
    }

    console.log('[Global Settings] Saving global models:', globalModels);
    console.log('[Global Settings] Saving timeout:', timeout);

    // Save to backend
    await ipcRenderer.invoke('config:updateGlobalModels', globalModels);
    await ipcRenderer.invoke('config:updateTimeout', timeout);

    showMessage('设置已保存', 'success');

  } catch (error) {
    console.error('[Global Settings] Error saving settings:', error);
    showMessage('保存失败: ' + error.message, 'error');
  }
}

/**
 * Reset all settings to defaults
 */
async function resetToDefaults() {
  if (!confirm('确定要恢复默认设置吗？')) {
    return;
  }

  try {
    // Reset global models
    document.getElementById('globalOpus').value = DEFAULTS.globalModels.opus;
    document.getElementById('globalSonnet').value = DEFAULTS.globalModels.sonnet;
    document.getElementById('globalHaiku').value = DEFAULTS.globalModels.haiku;

    // Reset timeout
    document.getElementById('testTimeout').value = DEFAULTS.timeout.test;
    document.getElementById('requestTimeout').value = DEFAULTS.timeout.request;

    // Save to backend
    await ipcRenderer.invoke('config:updateGlobalModels', DEFAULTS.globalModels);
    await ipcRenderer.invoke('config:updateTimeout', {
      test: DEFAULTS.timeout.test * 1000,
      request: DEFAULTS.timeout.request * 1000
    });

    showMessage('已恢复默认设置', 'success');

  } catch (error) {
    console.error('[Global Settings] Error resetting to defaults:', error);
    showMessage('恢复默认失败: ' + error.message, 'error');
  }
}

/**
 * Show status message
 * @param {string} message - Message to display
 * @param {string} type - Message type ('success' or 'error')
 */
function showMessage(message, type) {
  const messageEl = document.getElementById('statusMessage');
  messageEl.textContent = message;
  messageEl.className = `status-message ${type}`;
  messageEl.style.display = 'block';

  // Auto-hide after 3 seconds
  setTimeout(() => {
    messageEl.style.display = 'none';
  }, 3000);
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', init);
