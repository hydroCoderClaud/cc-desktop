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
  document.getElementById('profileServiceProvider').value = 'official';
  document.getElementById('profileBaseUrl').value = 'https://api.anthropic.com';
  document.getElementById('modelTierSonnet').checked = true;
  document.getElementById('profileRequestTimeout').value = 120;
  document.getElementById('profileDisableTraffic').checked = true;
  selectedIcon = '🟣';

  // 清空模型映射
  document.getElementById('mappingOpus').value = '';
  document.getElementById('mappingSonnet').value = '';
  document.getElementById('mappingHaiku').value = '';

  // 默认选中 API Key（官方标准）
  document.getElementById('authTypeKey').checked = true;

  // 隐藏模型映射区域（官方不需要）
  onServiceProviderChange();

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
    document.getElementById('profileServiceProvider').value = profile.serviceProvider || 'official';
    document.getElementById('profileAuthToken').value = profile.authToken;

    // 设置认证方式
    const authType = profile.authType || 'api_key';
    if (authType === 'api_key') {
      document.getElementById('authTypeKey').checked = true;
    } else {
      document.getElementById('authTypeToken').checked = true;
    }

    document.getElementById('profileBaseUrl').value = profile.baseUrl;

    // 设置默认模型等级
    const selectedTier = profile.selectedModelTier || 'sonnet';
    document.getElementById('modelTier' + selectedTier.charAt(0).toUpperCase() + selectedTier.slice(1)).checked = true;

    // 填充模型映射（如果是第三方服务）
    if (profile.modelMapping) {
      document.getElementById('mappingOpus').value = profile.modelMapping.opus || '';
      document.getElementById('mappingSonnet').value = profile.modelMapping.sonnet || '';
      document.getElementById('mappingHaiku').value = profile.modelMapping.haiku || '';
    }

    // 高级配置
    document.getElementById('profileRequestTimeout').value = (profile.requestTimeout || 120000) / 1000;
    document.getElementById('profileDisableTraffic').checked = profile.disableNonessentialTraffic !== false;

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

    // 显示/隐藏模型映射区域
    onServiceProviderChange();

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

    // 只包含非空字段（允许部分为空，使用第三方内置映射）
    const mapping = {};
    if (opus) mapping.opus = opus;
    if (sonnet) mapping.sonnet = sonnet;
    if (haiku) mapping.haiku = haiku;

    // 只有当至少有一个字段有值时才设置 modelMapping
    if (Object.keys(mapping).length > 0) {
      modelMapping = mapping;
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
/**
 * 服务商变更时的处理
 */
function onServiceProviderChange() {
  const serviceProvider = document.getElementById('profileServiceProvider').value;
  const modelMappingSection = document.getElementById('modelMappingSection');

  // 根据服务商类型显示/隐藏模型映射配置
  if (serviceProvider === 'official' || serviceProvider === 'proxy') {
    modelMappingSection.style.display = 'none';
  } else {
    modelMappingSection.style.display = 'block';
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

  // 模态框背景点击关闭
  document.getElementById('editModal').addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
}

// 初始化
document.addEventListener('DOMContentLoaded', init);
