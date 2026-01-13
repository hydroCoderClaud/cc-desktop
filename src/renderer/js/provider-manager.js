/**
 * 服务商管理页面逻辑
 */

console.log('[Provider Manager] Script loaded');

// Global state
let providers = [];
let editingProviderId = null;

/**
 * Set model mapping input fields
 * @param {Object|null} mapping - Model mapping object {opus, sonnet, haiku}
 */
function setModelMappingFields(mapping) {
  MODEL_TIERS.forEach(tier => {
    const fieldId = `mapping${capitalize(tier)}`;
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = mapping?.[tier] || '';
    }
  });
}

/**
 * Get model mapping from input fields
 * @returns {Object|null} Model mapping object or null if all empty
 */
function getModelMappingFields() {
  const mapping = {};
  MODEL_TIERS.forEach(tier => {
    const fieldId = `mapping${capitalize(tier)}`;
    const field = document.getElementById(fieldId);
    const value = field?.value.trim();
    if (value) {
      mapping[tier] = value;
    }
  });
  return Object.keys(mapping).length > 0 ? mapping : null;
}

/**
 * Set disabled state for multiple fields
 * @param {string[]} fieldIds - Array of field IDs
 * @param {boolean} disabled - Disabled state
 */
function setFieldsDisabled(fieldIds, disabled) {
  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.disabled = disabled;
    }
  });
}

/**
 * Set disabled state for model mapping fields
 * @param {boolean} disabled - Disabled state
 */
function setModelMappingFieldsDisabled(disabled) {
  const fields = MODEL_TIERS.map(tier => `mapping${capitalize(tier)}`);
  fields.push('providerNeedsMapping');
  setFieldsDisabled(fields, disabled);
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('[Provider Manager] Page loaded');
  loadProviders();

  // 监听表单提交
  const form = document.getElementById('providerForm');
  if (form) {
    console.log('[Provider Manager] Form found, binding submit event');
    form.addEventListener('submit', handleSubmit);
  } else {
    console.error('[Provider Manager] Form not found!');
  }

  // 监听 needsMapping 复选框变化
  const needsMappingCheckbox = document.getElementById('providerNeedsMapping');
  if (needsMappingCheckbox) {
    needsMappingCheckbox.addEventListener('change', toggleModelMappingSection);
  }
});

/**
 * 加载所有服务商
 */
async function loadProviders() {
  try {
    providers = await window.electronAPI.listProviders();
    console.log('[Provider Manager] Loaded providers:', providers);
    renderProviders();
  } catch (error) {
    console.error('[Provider Manager] Failed to load providers:', error);
    alert('加载服务商列表失败：' + error.message);
  }
}

/**
 * 渲染服务商列表
 */
function renderProviders() {
  const listEl = document.getElementById('providerList');
  const emptyStateEl = document.getElementById('emptyState');

  if (!providers || providers.length === 0) {
    listEl.style.display = 'none';
    emptyStateEl.style.display = 'block';
    return;
  }

  listEl.style.display = 'flex';
  emptyStateEl.style.display = 'none';

  listEl.innerHTML = providers.map(provider => {
    const builtInBadge = provider.isBuiltIn ? '<span class="provider-badge">内置</span>' : '';
    const baseUrlText = provider.baseUrl ? provider.baseUrl : '无默认地址';
    const mappingText = provider.needsMapping ? '需要模型映射' : '无需映射';

    return `
      <div class="provider-item">
        <div class="provider-info">
          <div class="provider-name">
            ${escapeHtml(provider.name)}
            ${builtInBadge}
          </div>
          <div class="provider-details">
            ID: ${escapeHtml(provider.id)} | API: ${escapeHtml(baseUrlText)} | ${mappingText}
          </div>
        </div>
        <div class="provider-actions">
          <button class="btn btn-secondary btn-small" onclick="openEditModal('${escapeHtml(provider.id)}')">
            ✏️ 编辑
          </button>
          <button 
            class="btn btn-danger btn-small" 
            onclick="deleteProvider('${escapeHtml(provider.id)}')"
            ${provider.isBuiltIn ? 'disabled' : ''}
          >
            🗑️ 删除
          </button>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 打开添加服务商弹窗
 */
function openAddModal() {
  editingProviderId = null;
  document.getElementById('modalTitle').textContent = '添加服务商';
  document.getElementById('submitBtn').textContent = '保存';
  
  // 重置表单
  document.getElementById('providerForm').reset();
  document.getElementById('providerId').disabled = false;
  document.getElementById('providerNeedsMapping').checked = true;
  toggleModelMappingSection();

  // 清除提示信息
  hideModalMessage();

  // 显示弹窗
  document.getElementById('providerModal').classList.add('active');
}

/**
 * 打开编辑服务商弹窗
 */
async function openEditModal(providerId) {
  try {
    const provider = providers.find(p => p.id === providerId);
    if (!provider) {
      alert('服务商不存在');
      return;
    }

    editingProviderId = providerId;
    document.getElementById('modalTitle').textContent = '编辑服务商';
    document.getElementById('submitBtn').textContent = '保存';

    // 填充表单
    document.getElementById('providerId').value = provider.id;
    document.getElementById('providerId').disabled = true; // 不允许修改 ID
    document.getElementById('providerName').value = provider.name;
    document.getElementById('providerBaseUrl').value = provider.baseUrl || '';
    document.getElementById('providerNeedsMapping').checked = provider.needsMapping;

    // 填充模型映射
    setModelMappingFields(provider.defaultModelMapping);

    // 特殊处理：official 和 proxy 不需要模型映射，且不可修改
    if (isOfficialProvider(providerId)) {
      document.getElementById('providerNeedsMapping').checked = false;
      setModelMappingFieldsDisabled(true);
    } else {
      // 其他服务商（包括内置的 zhipu、minimax 等）都可以编辑
      setModelMappingFieldsDisabled(false);
    }

    toggleModelMappingSection();

    // 清除提示信息
    hideModalMessage();

    // 显示弹窗
    document.getElementById('providerModal').classList.add('active');
  } catch (error) {
    console.error('[Provider Manager] Failed to open edit modal:', error);
    alert('打开编辑弹窗失败：' + error.message);
  }
}

/**
 * 关闭弹窗
 */
function closeModal() {
  document.getElementById('providerModal').classList.remove('active');
  editingProviderId = null;
  // 清除提示信息
  hideModalMessage();
}

/**
 * 显示模态框内提示信息
 */
function showModalMessage(message, type = 'success') {
  const messageEl = document.getElementById('modalMessage');
  messageEl.textContent = message;
  messageEl.className = 'modal-message show ' + type;
  
  // 3秒后自动隐藏
  setTimeout(() => {
    hideModalMessage();
  }, 3000);
}

/**
 * 隐藏模态框内提示信息
 */
function hideModalMessage() {
  const messageEl = document.getElementById('modalMessage');
  messageEl.className = 'modal-message';
  messageEl.textContent = '';
}

/**
 * 切换模型映射部分显示
 */
function toggleModelMappingSection() {
  const needsMapping = document.getElementById('providerNeedsMapping').checked;
  const section = document.getElementById('modelMappingSection');
  section.style.display = needsMapping ? 'block' : 'none';
}

/**
 * 处理表单提交
 */
async function handleSubmit(event) {
  event.preventDefault();
  console.log('[Provider Manager] Form submit triggered');

  const formData = new FormData(event.target);

  // 安全获取表单数据
  const getId = formData.get('id');
  const getName = formData.get('name');
  const getBaseUrl = formData.get('baseUrl');

  console.log('[Provider Manager] Raw form data:', {
    id: getId,
    name: getName,
    baseUrl: getBaseUrl,
    needsMapping: formData.get('needsMapping')
  });

  const providerData = {
    id: (getId || '').trim(),
    name: (getName || '').trim(),
    baseUrl: (getBaseUrl || '').trim(),
    needsMapping: formData.get('needsMapping') === 'on'
  };

  console.log('[Provider Manager] Provider data:', providerData);
  console.log('[Provider Manager] Window.electronAPI exists:', !!window.electronAPI);

  // 特殊处理：official 和 proxy 永远不需要模型映射
  if (isOfficialProvider(providerData.id)) {
    providerData.needsMapping = false;
    providerData.defaultModelMapping = null;
  } else if (providerData.needsMapping) {
    // 如果需要模型映射，收集映射数据
    providerData.defaultModelMapping = getModelMappingFields();
  } else {
    providerData.defaultModelMapping = null;
  }

  try {
    if (editingProviderId) {
      // 编辑模式
      const { id, ...updates } = providerData;
      await window.electronAPI.updateProvider({ id: editingProviderId, updates });
      console.log('[Provider Manager] Provider updated:', editingProviderId);
      showModalMessage('✓ 服务商更新成功', 'success');
    } else {
      // 添加模式
      await window.electronAPI.addProvider(providerData);
      console.log('[Provider Manager] Provider added:', providerData.id);
      showModalMessage('✓ 服务商添加成功', 'success');
    }

    await loadProviders();
  } catch (error) {
    console.error('[Provider Manager] Failed to save provider:', error);
    showModalMessage('✗ 保存失败：' + error.message, 'error');
  }
}

/**
 * 删除服务商
 */
async function deleteProvider(providerId) {
  const provider = providers.find(p => p.id === providerId);
  if (!provider) {
    return;
  }

  if (provider.isBuiltIn) {
    alert('内置服务商不能删除');
    return;
  }

  if (!confirm(`确定要删除服务商 "${provider.name}" 吗？`)) {
    return;
  }

  try {
    await window.electronAPI.deleteProvider(providerId);
    console.log('[Provider Manager] Provider deleted:', providerId);
    await loadProviders();
  } catch (error) {
    console.error('[Provider Manager] Failed to delete provider:', error);
    alert('删除失败：' + error.message);
  }
}
