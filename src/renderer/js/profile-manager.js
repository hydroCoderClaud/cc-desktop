/**
 * Profile Manager
 * 管理多个 API 配置
 */

// 全局状态
let profiles = [];
let currentProfile = null;
let editingProfileId = null;
let editingModelId = null;

// 可用图标（只保留第一排8个）
const availableIcons = ['🟣', '🔵', '🟢', '🟠', '🟡', '🔴', '⚪', '⚫'];
let selectedIcon = '🟣';

/**
 * 初始化
 */
async function init() {
  console.log('[Profile Manager] Initializing...');

  // 加载当前 Profile
  await loadCurrentProfile();

  // 加载所有 Profiles
  await loadProfiles();

  // 初始化图标选择器
  initIconPicker();

  // 绑定事件
  bindEvents();
}

/**
 * 加载当前 Profile
 */
async function loadCurrentProfile() {
  try {
    currentProfile = await window.electronAPI.getCurrentProfile();

    if (currentProfile) {
      document.getElementById('currentIcon').textContent = currentProfile.icon || '🟣';
      document.getElementById('currentName').textContent = currentProfile.name;
    } else {
      document.getElementById('currentIcon').textContent = '❌';
      document.getElementById('currentName').textContent = '未配置';
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to load current profile:', error);
    showAlert('加载当前配置失败', 'error');
  }
}

/**
 * 加载所有 Profiles
 */
async function loadProfiles() {
  try {
    profiles = await window.electronAPI.listAPIProfiles();
    renderProfiles();
  } catch (error) {
    console.error('[Profile Manager] Failed to load profiles:', error);
    showAlert('加载配置列表失败', 'error');
  }
}

/**
 * HTML转义函数，防止XSS攻击
 */
function escapeHtml(text) {
  if (text == null) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 渲染 Profiles 列表
 */
function renderProfiles() {
  const listEl = document.getElementById('profilesList');

  if (!profiles || profiles.length === 0) {
    listEl.innerHTML = '<p style="text-align: center; color: #666; padding: 20px;">暂无配置，请添加新配置</p>';
    return;
  }

  listEl.innerHTML = profiles.map(profile => {
    const isDefault = profile.isDefault;
    const cardClass = isDefault ? 'profile-card current' : 'profile-card';

    return `
      <div class="${cardClass}">
        <div class="profile-header">
          <div class="profile-title">
            <span class="profile-icon">${escapeHtml(profile.icon || '🟣')}</span>
            <span class="profile-name">${escapeHtml(profile.name)}</span>
          </div>
          <div class="profile-header-right">
            ${isDefault ? '<span class="badge badge-default">默认</span>' : ''}
            <div class="profile-actions-inline">
              ${!isDefault ? `<button class="btn-inline btn-secondary" onclick="setDefault('${escapeHtml(profile.id)}')">默认</button>` : ''}
              <button class="btn-inline btn-secondary" onclick="editProfile('${escapeHtml(profile.id)}')">编辑</button>
              <button class="btn-inline btn-danger" onclick="deleteProfile('${escapeHtml(profile.id)}')">删除</button>
            </div>
          </div>
        </div>
        <div class="profile-details-compact">
          <div class="detail-row">
            <div class="detail-item-inline">
              <span class="detail-label">类别：</span>
              <span class="detail-value">${getCategoryName(profile.category)}</span>
            </div>
            ${profile.description ? `
            <div class="detail-item-inline">
              <span class="detail-label">描述：</span>
              <span class="detail-value">${escapeHtml(profile.description)}</span>
            </div>` : '<div class="detail-item-inline"></div>'}
            <div class="detail-item-inline">
              <span class="detail-label">最后使用：</span>
              <span class="detail-value">${formatDate(profile.lastUsed)}</span>
            </div>
          </div>
          <div class="detail-row">
            <div class="detail-item-inline">
              <span class="detail-label">API地址：</span>
              <span class="detail-value">${escapeHtml(profile.baseUrl)}</span>
            </div>
            <div class="detail-item-inline">
              <span class="detail-label">模型：</span>
              <span class="detail-value">${escapeHtml(profile.model)}</span>
            </div>
            <div class="detail-item-inline">
              <span class="detail-label">代理：</span>
              <span class="detail-value">${profile.useProxy ? '已启用' : '未启用'}</span>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 初始化图标选择器
 */
function initIconPicker() {
  const pickerEl = document.getElementById('iconPicker');
  pickerEl.innerHTML = availableIcons.map(icon =>
    `<div class="icon-option" data-icon="${icon}" onclick="selectIcon('${icon}')">${icon}</div>`
  ).join('');
}

/**
 * 选择图标
 */
function selectIcon(icon) {
  selectedIcon = icon;

  // 更新视觉状态
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.remove('selected');
    if (el.dataset.icon === icon) {
      el.classList.add('selected');
    }
  });
}

/**
 * 打开添加 Profile 模态框
 */
async function openAddModal() {
  editingProfileId = null;
  document.getElementById('modalTitle').textContent = '添加 API 配置';

  // 重置表单
  document.getElementById('profileForm').reset();
  document.getElementById('profileCategory').value = 'official';
  document.getElementById('profileBaseUrl').value = 'https://api.anthropic.com';
  document.getElementById('profileModel').value = 'claude-sonnet-4-5-20250929';
  selectedIcon = '🟣';

  // 默认选中 API Key（官方标准）
  document.getElementById('authTypeKey').checked = true;

  // 更新模型输入提示
  updateProfileModelInputHint('official');

  // 新建配置时，显示默认模型列表（不实际加载）
  loadDefaultModels();

  // 重置图标选择
  document.querySelectorAll('.icon-option').forEach(el => {
    el.classList.remove('selected');
    if (el.dataset.icon === '🟣') {
      el.classList.add('selected');
    }
  });

  // 显示模态框
  document.getElementById('editModal').classList.add('visible');
}

/**
 * 打开编辑 Profile 模态框
 */
async function editProfile(profileId) {
  editingProfileId = profileId;
  document.getElementById('modalTitle').textContent = '编辑 API 配置';

  try {
    const profile = await window.electronAPI.getAPIProfile(profileId);

    if (!profile) {
      showAlert('配置不存在', 'error');
      return;
    }

    // 填充表单
    document.getElementById('profileName').value = profile.name;
    document.getElementById('profileCategory').value = profile.category || 'official';
    document.getElementById('profileAuthToken').value = profile.authToken;

    // 设置认证方式
    const authType = profile.authType || 'api_key';
    if (authType === 'api_key') {
      document.getElementById('authTypeKey').checked = true;
    } else {
      document.getElementById('authTypeToken').checked = true;
    }

    document.getElementById('profileBaseUrl').value = profile.baseUrl;
    document.getElementById('profileModel').value = profile.model;
    document.getElementById('profileUseProxy').checked = profile.useProxy;
    document.getElementById('profileHttpsProxy').value = profile.httpsProxy || '';
    document.getElementById('profileHttpProxy').value = profile.httpProxy || '';
    document.getElementById('profileDescription').value = profile.description || '';

    // 设置图标
    selectedIcon = profile.icon || '🟣';
    document.querySelectorAll('.icon-option').forEach(el => {
      el.classList.remove('selected');
      if (el.dataset.icon === selectedIcon) {
        el.classList.add('selected');
      }
    });

    // 显示/隐藏代理字段
    if (profile.useProxy) {
      document.getElementById('proxyFields').classList.add('visible');
    }

    // 更新模型输入提示
    updateProfileModelInputHint(profile.category || 'official');

    // 加载自定义模型列表
    await loadCustomModels();

    // 确保模型值被正确设置（在 loadCustomModels 之后重新设置，避免时序问题）
    document.getElementById('profileModel').value = profile.model;

    // 显示模态框
    document.getElementById('editModal').classList.add('visible');
  } catch (error) {
    console.error('[Profile Manager] Failed to load profile:', error);
    showAlert('加载配置失败', 'error');
  }
}

/**
 * 关闭模态框
 */
function closeEditModal() {
  document.getElementById('editModal').classList.remove('visible');
  editingProfileId = null;
}

/**
 * 保存 Profile
 */
async function saveProfile(event) {
  event.preventDefault();

  const formData = new FormData(event.target);

  // 获取模型映射（仅第三方服务）
  const serviceProvider = formData.get('serviceProvider') || 'official';
  let modelMapping = null;

  if (serviceProvider !== 'official' && serviceProvider !== 'proxy') {
    const opus = document.getElementById('mappingOpus').value.trim();
    const sonnet = document.getElementById('mappingSonnet').value.trim();
    const haiku = document.getElementById('mappingHaiku').value.trim();

    if (opus || sonnet || haiku) {
      modelMapping = { opus, sonnet, haiku };
    }
  }

  const profileData = {
    name: formData.get('name'),
    serviceProvider: serviceProvider,
    authToken: formData.get('authToken'),
    authType: formData.get('authType') || 'api_key',
    description: formData.get('description') || '',
    baseUrl: formData.get('baseUrl') || 'https://api.anthropic.com',
    selectedModelTier: formData.get('selectedModelTier') || 'sonnet',
    modelMapping: modelMapping,
    requestTimeout: parseInt(formData.get('requestTimeout')) * 1000 || 120000,
    disableNonessentialTraffic: formData.get('disableNonessentialTraffic') === 'on',
    useProxy: formData.get('useProxy') === 'on',
    httpsProxy: formData.get('httpsProxy') || '',
    httpProxy: formData.get('httpProxy') || '',
    icon: selectedIcon
  };

  try {
    if (editingProfileId) {
      // 更新现有 Profile
      await window.electronAPI.updateAPIProfile({
        profileId: editingProfileId,
        updates: profileData
      });
      showModalAlert('✓ 配置已保存', 'success');
    } else {
      // 添加新 Profile
      const newProfile = await window.electronAPI.addAPIProfile(profileData);
      showModalAlert('✓ 配置已添加', 'success');

      // 如果是新增，将 editingProfileId 设置为新 Profile 的 ID，以便继续编辑
      if (newProfile && newProfile.id) {
        editingProfileId = newProfile.id;
        document.getElementById('modalTitle').textContent = '编辑 API 配置';
      }
    }

    // 不关闭模态框，保持打开状态供继续编辑

    // 重新加载列表以显示最新状态
    await loadProfiles();
    await loadCurrentProfile();
  } catch (error) {
    console.error('[Profile Manager] Failed to save profile:', error);
    showModalAlert('✗ 保存配置失败', 'error');
  }
}

// 注意：已移除 switchProfile 功能
// Profile 选择将在会话启动时进行

/**
 * 设置默认 Profile
 */
async function setDefault(profileId) {
  try {
    const success = await window.electronAPI.setDefaultProfile(profileId);

    if (success) {
      // 静默更新，不显示提示
      await loadCurrentProfile();
      await loadProfiles();
    } else {
      showAlert('设置失败', 'error');
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to set default:', error);
    showAlert('设置失败', 'error');
  }
}

/**
 * 删除 Profile
 */
async function deleteProfile(profileId) {
  if (!confirm('确定要删除此配置吗？')) {
    return;
  }

  try {
    const success = await window.electronAPI.deleteAPIProfile(profileId);

    if (success) {
      showAlert('配置已删除', 'success');
      await loadCurrentProfile();
      await loadProfiles();
    } else {
      showAlert('删除失败', 'error');
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to delete profile:', error);
    showAlert('删除失败', 'error');
  }
}

/**
 * 显示提示
 */
function showAlert(message, type = 'success') {
  const alertEl = document.getElementById('alert');
  alertEl.className = `alert alert-${type} visible`;
  alertEl.textContent = message;

  setTimeout(() => {
    alertEl.classList.remove('visible');
  }, 3000);
}

/**
 * 在模态框内显示提示
 */
function showModalAlert(message, type = 'success') {
  const alertEl = document.getElementById('modalAlert');
  if (!alertEl) {
    // 如果模态框内没有 alert 元素，回退到主 alert
    showAlert(message, type);
    return;
  }
  
  alertEl.className = `alert alert-${type} visible`;
  alertEl.textContent = message;
  alertEl.style.display = 'block';

  // 3秒后自动隐藏
  setTimeout(() => {
    alertEl.classList.remove('visible');
    setTimeout(() => {
      alertEl.style.display = 'none';
    }, 300);
  }, 3000);
}

/**
 * 获取类别名称
 */
function getCategoryName(category) {
  const categoryMap = {
    'official': '官方 API',
    'proxy': '中转服务',
    'third_party': '第三方服务'
  };
  return categoryMap[category] || '未知';
}

/**
 * 格式化日期
 */
function formatDate(isoString) {
  if (!isoString) return '未知';

  const date = new Date(isoString);
  const now = new Date();
  const diff = now - date;

  // 少于 1 分钟
  if (diff < 60000) {
    return '刚刚';
  }

  // 少于 1 小时
  if (diff < 3600000) {
    return `${Math.floor(diff / 60000)} 分钟前`;
  }

  // 少于 1 天
  if (diff < 86400000) {
    return `${Math.floor(diff / 3600000)} 小时前`;
  }

  // 超过 1 天
  return date.toLocaleDateString('zh-CN');
}

/**
 * 更新模型输入提示
 */
function updateProfileModelInputHint(category) {
  const modelDescription = document.getElementById('profileModelDescription');
  const modelHint = document.getElementById('profileModelHint');
  const manageModelsBtn = document.getElementById('manageModelsBtn');

  // 根据服务类别显示不同的提示
  if (category === 'official' || category === 'proxy') {
    modelDescription.textContent = '选择要使用的模型版本（可通过"获取模型列表"自动获取）';
    if (modelHint) {
      modelHint.style.display = 'none';
    }
  } else if (category === 'third_party') {
    modelDescription.textContent = '选择要使用的模型版本';
    if (modelHint) {
      modelHint.style.display = 'block';
    }
  } else {
    modelDescription.textContent = '选择要使用的模型版本';
    if (modelHint) {
      modelHint.style.display = 'none';
    }
  }

  if (manageModelsBtn) {
    manageModelsBtn.style.display = 'inline-block';
  }
}

/**
 * 切换密码可见性
 */
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  const button = document.getElementById('toggle' + inputId.charAt(0).toUpperCase() + inputId.slice(1));
  
  if (input.type === 'password') {
    input.type = 'text';
    button.textContent = '🙈';
    button.title = '隐藏';
  } else {
    input.type = 'password';
    button.textContent = '👁️';
    button.title = '显示/隐藏';
  }
}

/**
 * 加载默认模型列表（用于新建配置）
 */
function loadDefaultModels() {
  const defaultModels = [
    { id: 'opus-4.5', name: 'claude-opus-4-5-20251101', label: 'Opus 4.5 - 最强大' },
    { id: 'sonnet-4.5', name: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5 - 平衡（推荐）' },
    { id: 'haiku-4', name: 'claude-haiku-4-0-20250107', label: 'Haiku 4 - 最快' }
  ];
  
  // 更新 select 下拉框
  const select = document.getElementById('profileModel');
  if (select) {
    select.innerHTML = '<option value="">请选择模型</option>' + 
      defaultModels.map(model => 
        `<option value="${model.name}">${model.label}</option>`
      ).join('');
  }
  
  // 隐藏模型管理面板（新建时不显示）
  const modelManager = document.querySelector('.model-manager');
  if (modelManager) {
    modelManager.style.display = 'none';
  }
}

/**
 * 加载自定义模型列表
 */
async function loadCustomModels() {
  try {
    if (!editingProfileId) {
      console.error('[Profile Manager] No profile is being edited');
      return;
    }
    const models = await window.electronAPI.getCustomModels(editingProfileId);
    console.log('[Profile Manager] Loaded custom models:', models);
    
    // 不自动展开面板，保持收起状态
    // 用户需要点击 "编辑模型列表" 按钮来展开
    
    // 更新 select 下拉框
    const select = document.getElementById('profileModel');
    if (select) {
      // 保存当前选中的值
      const currentValue = select.value;

      // 重新填充选项
      select.innerHTML = '<option value="">请选择模型</option>' +
        models.map(model =>
          `<option value="${model.name}">${model.label}</option>`
        ).join('');

      // 恢复之前的选择（如果存在且在新列表中）
      if (currentValue && models.some(m => m.name === currentValue)) {
        select.value = currentValue;
        console.log('[Profile Manager] Restored model selection:', currentValue);
      } else if (currentValue) {
        console.warn('[Profile Manager] Previous model not found in list:', currentValue);
      }

      console.log('[Profile Manager] Updated select with', models.length, 'models, current value:', select.value);
    }
    
    // 更新模型管理面板的列表
    const modelList = document.getElementById('modelList');
    const batchActionsGroup = document.getElementById('batchActionsGroup');

    if (modelList) {
      if (models.length === 0) {
        modelList.innerHTML = '<div style="text-align: center; color: #999; padding: 12px;">暂无自定义模型</div>';
        // 隐藏批量操作按钮
        if (batchActionsGroup) {
          batchActionsGroup.style.display = 'none';
        }
      } else {
        modelList.innerHTML = models.map(model => `
          <div class="model-item">
            <input type="checkbox" class="model-checkbox" data-model-id="${model.id}" onchange="updateBatchDeleteButton()" style="width: 18px; height: 18px; cursor: pointer; margin-right: 12px;">
            <div class="model-item-info">
              <div class="model-item-name">${model.name}</div>
              <div class="model-item-label">${model.label}</div>
            </div>
            <div class="model-item-actions">
              <button type="button" class="btn btn-secondary" style="font-size: 11px; padding: 4px 12px;" onclick="editModel('${model.id}')">编辑</button>
              <button type="button" class="btn btn-danger" style="font-size: 11px; padding: 4px 12px;" onclick="deleteModel('${model.id}')">删除</button>
            </div>
          </div>
        `).join('');
        // 显示批量操作行
        if (batchActionsGroup) {
          batchActionsGroup.style.display = 'block';
        }
        // 重置全选状态
        const selectAllCheckbox = document.getElementById('selectAllModels');
        if (selectAllCheckbox) {
          selectAllCheckbox.checked = false;
        }
      }
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to load custom models:', error);
    showAlert('加载模型列表失败', 'error');
  }
}

/**
 * 切换模型管理面板显示
 */
function toggleModelManager() {
  const panel = document.getElementById('modelManager');
  if (panel) {
    const isVisible = panel.style.display !== 'none';
    panel.style.display = isVisible ? 'none' : 'block';
    
    // 更新按钮文字
    const btn = document.getElementById('manageModelsBtn');
    if (btn) {
      btn.textContent = isVisible ? '编辑模型列表' : '收起';
    }
    
    // 收起时取消编辑模式
    if (isVisible) {
      cancelEditModel();
    }
  }
}

/**
 * 取消编辑模型模式
 */
function cancelEditModel() {
  const nameInput = document.getElementById('newModelName');
  const labelInput = document.getElementById('newModelLabel');
  const addButton = document.querySelector('.model-add-form button');
  
  if (nameInput) nameInput.value = '';
  if (labelInput) labelInput.value = '';
  if (addButton) addButton.textContent = '添加';
  editingModelId = null;
}

/**
 * 测试 API 连接
 */
async function testAPIConnection() {
  try {
    // 获取表单当前值
    const formData = getCurrentFormData();
    
    showModalAlert('正在测试连接...', 'info');
    
    const result = await window.electronAPI.testConnection(formData);
    
    if (result.success) {
      showModalAlert('✅ ' + result.message, 'success');
    } else {
      showModalAlert('❌ ' + result.message, 'error');
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to test connection:', error);
    showModalAlert('测试连接失败: ' + error.message, 'error');
  }
}

/**
 * 获取模型列表
 */
async function fetchOfficialModels() {
  try {
    if (!editingProfileId) {
      showModalAlert('❌ 无法获取模型：未选择配置', 'error');
      return;
    }

    // 获取表单当前值
    const formData = getCurrentFormData();

    showModalAlert('🔄 正在获取模型列表，请稍候...', 'info');

    const result = await window.electronAPI.fetchOfficialModels(formData);

    if (result.success) {
      let models = result.models;

      // 检查是否只获取最新版本
      const fetchLatestOnly = document.getElementById('fetchLatestOnly')?.checked;
      if (fetchLatestOnly) {
        models = filterLatestClaudeModels(models);
        console.log('[Profile Manager] Filtered to latest Claude models:', models);
      }

      // 更新模型列表
      await window.electronAPI.updateCustomModels({ profileId: editingProfileId, models });

      // 重新加载
      await loadCustomModels();

      if (fetchLatestOnly) {
        showModalAlert(`✅ 成功获取 ${models.length} 个最新版本模型`, 'success');
      } else {
        showModalAlert(`✅ 成功获取 ${models.length} 个模型`, 'success');
      }
    } else {
      // 检查是否是超时错误
      const isTimeout = result.message && (
        result.message.includes('超时') ||
        result.message.includes('timeout')
      );

      if (isTimeout) {
        showModalAlert(`⏱️ ${result.message}`, 'error', 5000);
      } else {
        showModalAlert(`❌ ${result.message}`, 'error');
      }
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to fetch models:', error);
    showModalAlert(`❌ 获取模型失败: ${error.message}`, 'error');
  }
}

/**
 * 过滤最新版本的Claude模型
 * @param {Array} models - 所有模型列表
 * @returns {Array} - 过滤后的模型列表
 */
function filterLatestClaudeModels(models) {
  // 只保留包含 "claude" 的模型
  const claudeModels = models.filter(m => m.name.toLowerCase().includes('claude'));

  // 按系列分组 (opus, sonnet, haiku)
  const seriesMap = {
    opus: [],
    sonnet: [],
    haiku: []
  };

  claudeModels.forEach(model => {
    const nameLower = model.name.toLowerCase();
    if (nameLower.includes('opus')) {
      seriesMap.opus.push(model);
    } else if (nameLower.includes('sonnet')) {
      seriesMap.sonnet.push(model);
    } else if (nameLower.includes('haiku')) {
      seriesMap.haiku.push(model);
    }
  });

  // 对每个系列，提取版本号并保留最新的
  const latestModels = [];

  Object.keys(seriesMap).forEach(series => {
    const modelsInSeries = seriesMap[series];
    if (modelsInSeries.length === 0) return;

    // 提取版本号并排序
    const modelsWithVersion = modelsInSeries.map(model => {
      // 提取版本号，例如从 "claude-opus-4-5-20251101" 中提取 "4-5-20251101"
      const match = model.name.match(/claude-\w+-(\d+)-(\d+)-(\d+)/);
      if (match) {
        const majorVersion = parseInt(match[1]);
        const minorVersion = parseInt(match[2]);
        const dateVersion = parseInt(match[3]);
        return {
          model,
          majorVersion,
          minorVersion,
          dateVersion
        };
      }
      return null;
    }).filter(item => item !== null);

    if (modelsWithVersion.length === 0) return;

    // 排序：先按主版本号，再按次版本号，最后按日期
    modelsWithVersion.sort((a, b) => {
      if (a.majorVersion !== b.majorVersion) {
        return b.majorVersion - a.majorVersion;
      }
      if (a.minorVersion !== b.minorVersion) {
        return b.minorVersion - a.minorVersion;
      }
      return b.dateVersion - a.dateVersion;
    });

    // 保留最新的
    latestModels.push(modelsWithVersion[0].model);
  });

  return latestModels;
}

/**
 * 获取表单当前数据
 */
function getCurrentFormData() {
  return {
    authToken: document.getElementById('profileAuthToken').value || '',
    authType: document.querySelector('input[name="authType"]:checked')?.value || 'api_key',
    baseUrl: document.getElementById('profileBaseUrl').value || 'https://api.anthropic.com',
    model: document.getElementById('profileModel').value || 'claude-sonnet-4-5-20250929',
    useProxy: document.getElementById('profileUseProxy').checked,
    httpsProxy: document.getElementById('profileHttpsProxy').value || '',
    httpProxy: document.getElementById('profileHttpProxy').value || ''
  };
}

/**
 * 添加新模型
 */
async function addNewModel() {
  const nameInput = document.getElementById('newModelName');
  const labelInput = document.getElementById('newModelLabel');
  const addButton = document.querySelector('.model-add-form button');
  
  const name = nameInput.value.trim();
  const label = labelInput.value.trim();
  
  if (!name || !label) {
    showAlert('请填写模型名称和显示标签', 'warning');
    return;
  }
  
  try {
    if (!editingProfileId) {
      showAlert('无法添加模型：未选择配置', 'error');
      return;
    }
    
    if (editingModelId) {
      // 更新模式
      const success = await window.electronAPI.updateCustomModel({
        profileId: editingProfileId,
        modelId: editingModelId,
        updates: { name, label }
      });

      if (!success) {
        showModalAlert('❌ 更新模型失败', 'error');
        return;
      }
      showModalAlert('✅ 模型已更新', 'success');
    } else {
      // 添加模式
      const newModel = {
        id: `custom-${Date.now()}`,
        name: name,
        label: label
      };

      await window.electronAPI.addCustomModel({ profileId: editingProfileId, model: newModel });
      showModalAlert('✅ 模型已添加', 'success');
    }
    
    // 清空输入框和状态
    nameInput.value = '';
    labelInput.value = '';
    editingModelId = null;
    addButton.textContent = '添加';
    
    // 重新加载模型列表
    await loadCustomModels();
  } catch (error) {
    console.error('[Profile Manager] Failed to save model:', error);
    showAlert('保存模型失败', 'error');
  }
}

/**
 * 删除模型
 */
async function deleteModel(modelId) {
  if (!confirm('确定要删除此模型吗？')) {
    return;
  }
  
  if (!editingProfileId) {
    showAlert('无法删除模型：未选择配置', 'error');
    return;
  }
  
  try {
    const success = await window.electronAPI.deleteCustomModel({ profileId: editingProfileId, modelId });
    
    if (success) {
      await loadCustomModels();
      showAlert('模型已删除', 'success');
    } else {
      showAlert('删除失败', 'error');
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to delete model:', error);
    showAlert('删除失败', 'error');
  }
}

/**
 * 全选/取消全选模型
 */
function toggleSelectAllModels() {
  const selectAllCheckbox = document.getElementById('selectAllModels');
  const modelCheckboxes = document.querySelectorAll('.model-checkbox');

  modelCheckboxes.forEach(checkbox => {
    checkbox.checked = selectAllCheckbox.checked;
  });

  updateBatchDeleteButton();
}

/**
 * 更新批量删除按钮状态
 */
function updateBatchDeleteButton() {
  const selectedCheckboxes = document.querySelectorAll('.model-checkbox:checked');
  const batchDeleteBtn = document.getElementById('batchDeleteBtn');
  const selectAllCheckbox = document.getElementById('selectAllModels');
  const allCheckboxes = document.querySelectorAll('.model-checkbox');

  if (batchDeleteBtn) {
    if (selectedCheckboxes.length > 0) {
      batchDeleteBtn.disabled = false;
      batchDeleteBtn.textContent = `删除选中 (${selectedCheckboxes.length})`;
    } else {
      batchDeleteBtn.disabled = true;
      batchDeleteBtn.textContent = '删除选中';
    }
  }

  // 更新全选复选框状态
  if (selectAllCheckbox && allCheckboxes.length > 0) {
    selectAllCheckbox.checked = selectedCheckboxes.length === allCheckboxes.length;
    selectAllCheckbox.indeterminate = selectedCheckboxes.length > 0 && selectedCheckboxes.length < allCheckboxes.length;
  }
}

/**
 * 批量删除选中的模型
 */
async function batchDeleteModels() {
  const selectedCheckboxes = document.querySelectorAll('.model-checkbox:checked');

  if (selectedCheckboxes.length === 0) {
    showModalAlert('请先选择要删除的模型', 'warning');
    return;
  }

  if (!confirm(`确定要删除选中的 ${selectedCheckboxes.length} 个模型吗？`)) {
    return;
  }

  if (!editingProfileId) {
    showModalAlert('无法删除模型：未选择配置', 'error');
    return;
  }

  try {
    const modelIds = Array.from(selectedCheckboxes).map(checkbox => checkbox.dataset.modelId);
    let successCount = 0;
    let failCount = 0;

    // 逐个删除
    for (const modelId of modelIds) {
      try {
        const success = await window.electronAPI.deleteCustomModel({
          profileId: editingProfileId,
          modelId
        });

        if (success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (error) {
        console.error('[Profile Manager] Failed to delete model:', modelId, error);
        failCount++;
      }
    }

    // 重新加载模型列表
    await loadCustomModels();

    // 显示结果
    if (failCount === 0) {
      showModalAlert(`✅ 成功删除 ${successCount} 个模型`, 'success');
    } else if (successCount === 0) {
      showModalAlert(`❌ 删除失败`, 'error');
    } else {
      showModalAlert(`⚠️ 删除完成：成功 ${successCount} 个，失败 ${failCount} 个`, 'warning');
    }
  } catch (error) {
    console.error('[Profile Manager] Failed to batch delete models:', error);
    showModalAlert('批量删除失败', 'error');
  }
}

/**
 * 编辑模型
 */
async function editModel(modelId) {
  try {
    if (!editingProfileId) {
      showAlert('无法编辑模型：未选择配置', 'error');
      return;
    }
    const models = await window.electronAPI.getCustomModels(editingProfileId);
    const model = models.find(m => m.id === modelId);
    
    if (!model) {
      showAlert('模型不存在', 'error');
      return;
    }
    
    // 填充输入框
    const nameInput = document.getElementById('newModelName');
    const labelInput = document.getElementById('newModelLabel');
    const addButton = document.querySelector('.model-add-form button');
    
    nameInput.value = model.name;
    labelInput.value = model.label;
    
    // 设置编辑模式
    editingModelId = modelId;
    addButton.textContent = '更新';
    
    // 聚焦到输入框
    nameInput.focus();
    nameInput.select();
  } catch (error) {
    console.error('[Profile Manager] Failed to load model for editing:', error);
    showAlert('加载模型失败', 'error');
  }
}

/**
 * 绑定事件
 */
function bindEvents() {
  // 添加 Profile 按钮
  document.getElementById('addProfileBtn').addEventListener('click', openAddModal);

  // Profile 表单提交
  document.getElementById('profileForm').addEventListener('submit', saveProfile);

  // 代理开关
  document.getElementById('profileUseProxy').addEventListener('change', (e) => {
    const proxyFields = document.getElementById('proxyFields');
    if (e.target.checked) {
      proxyFields.classList.add('visible');
      // 如果输入框为空，自动填充默认值
      const httpsProxy = document.getElementById('profileHttpsProxy');
      const httpProxy = document.getElementById('profileHttpProxy');
      if (!httpsProxy.value.trim()) {
        httpsProxy.value = 'http://127.0.0.1:7890';
      }
      if (!httpProxy.value.trim()) {
        httpProxy.value = 'http://127.0.0.1:7890';
      }
    } else {
      proxyFields.classList.remove('visible');
    }
  });

  // 密码查看切换
  document.getElementById('toggleProfileAuthToken').addEventListener('click', () => {
    togglePasswordVisibility('profileAuthToken');
  });

  // 服务类别变化时更新模型输入提示
  document.getElementById('profileCategory').addEventListener('change', (e) => {
    updateProfileModelInputHint(e.target.value);
  });

  // 编辑模型列表按钮
  const manageModelsBtn = document.getElementById('manageModelsBtn');
  if (manageModelsBtn) {
    manageModelsBtn.addEventListener('click', (e) => {
      e.preventDefault();
      toggleModelManager();
    });
  }

  // 模态框背景点击关闭
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', init);
