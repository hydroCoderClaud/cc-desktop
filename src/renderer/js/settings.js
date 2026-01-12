/**
 * API 配置设置界面
 */

class SettingsApp {
  constructor() {
    this.form = document.getElementById('apiConfigForm');
    this.alert = document.getElementById('alert');
    this.validationResult = document.getElementById('validationResult');
    this.configPathDiv = document.getElementById('configPath');
    this.proxyFields = document.getElementById('proxyFields');

    this.init();
  }

  async init() {
    // 加载当前配置
    await this.loadConfig();

    // 设置事件监听器
    this.setupEventListeners();
  }

  setupEventListeners() {
    // 表单提交
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveConfig();
    });

    // 验证按钮
    document.getElementById('validateBtn').addEventListener('click', () => {
      this.validateConfig();
    });

    // 显示配置文件路径
    document.getElementById('showConfigPathBtn').addEventListener('click', () => {
      this.showConfigPath();
    });

    // 代理开关
    document.getElementById('useProxy').addEventListener('change', (e) => {
      this.toggleProxyFields(e.target.checked);
      // 如果启用代理且输入框为空，自动填充默认值
      if (e.target.checked) {
        const httpsProxy = document.getElementById('httpsProxy');
        const httpProxy = document.getElementById('httpProxy');
        if (!httpsProxy.value.trim()) {
          httpsProxy.value = 'http://127.0.0.1:7890';
        }
        if (!httpProxy.value.trim()) {
          httpProxy.value = 'http://127.0.0.1:7890';
        }
      }
    });

    // 密码查看切换
    document.getElementById('toggleAuthToken').addEventListener('click', () => {
      this.togglePasswordVisibility('authToken');
    });

    // 服务类别变化时更新模型输入提示
    document.getElementById('category').addEventListener('change', (e) => {
      this.updateModelInputHint(e.target.value);
    });
  }

  async loadConfig() {
    try {
      const apiConfig = await window.electronAPI.getAPIConfig();

      // 填充表单
      document.getElementById('category').value = apiConfig.category || 'official';
      document.getElementById('authToken').value = apiConfig.authToken || '';
      document.getElementById('description').value = apiConfig.description || '';

      // 设置认证方式
      const authType = apiConfig.authType || 'api_key';
      if (authType === 'api_key') {
        document.getElementById('authTypeKey').checked = true;
      } else {
        document.getElementById('authTypeToken').checked = true;
      }

      document.getElementById('baseUrl').value = apiConfig.baseUrl || 'https://api.anthropic.com';
      document.getElementById('model').value = apiConfig.model || 'claude-sonnet-4-5-20250929';
      document.getElementById('useProxy').checked = apiConfig.useProxy || false;
      document.getElementById('httpsProxy').value = apiConfig.httpsProxy || '';
      document.getElementById('httpProxy').value = apiConfig.httpProxy || '';

      // 显示/隐藏代理字段
      this.toggleProxyFields(apiConfig.useProxy);

      // 更新模型输入提示
      this.updateModelInputHint(apiConfig.category || 'official');

      console.log('[Settings] Config loaded:', apiConfig);
    } catch (error) {
      this.showAlert('加载配置失败：' + error.message, 'error');
      console.error('[Settings] Failed to load config:', error);
    }
  }

  async saveConfig() {
    try {
      // 收集表单数据
      const authTypeKey = document.getElementById('authTypeKey');
      const authType = authTypeKey.checked ? 'api_key' : 'auth_token';

      const apiConfig = {
        category: document.getElementById('category').value,
        authToken: document.getElementById('authToken').value.trim(),
        authType: authType,
        description: document.getElementById('description').value.trim(),
        baseUrl: document.getElementById('baseUrl').value.trim(),
        model: document.getElementById('model').value.trim(),
        useProxy: document.getElementById('useProxy').checked,
        httpsProxy: document.getElementById('httpsProxy').value.trim(),
        httpProxy: document.getElementById('httpProxy').value.trim()
      };

      // 基本验证
      if (!apiConfig.authToken) {
        this.showAlert('请输入认证令牌 (Auth Token)', 'error');
        document.getElementById('authToken').classList.add('error');
        return;
      }

      if (!apiConfig.baseUrl) {
        this.showAlert('请输入 API 基础 URL', 'error');
        document.getElementById('baseUrl').classList.add('error');
        return;
      }

      // 清除错误样式
      document.getElementById('authToken').classList.remove('error');
      document.getElementById('baseUrl').classList.remove('error');

      // 保存配置
      const success = await window.electronAPI.updateAPIConfig(apiConfig);

      if (success) {
        this.showAlert('配置已保存！', 'success');
        console.log('[Settings] Config saved successfully');

        // 自动验证
        setTimeout(() => {
          this.validateConfig();
        }, 500);
      } else {
        this.showAlert('保存配置失败', 'error');
      }
    } catch (error) {
      this.showAlert('保存配置失败：' + error.message, 'error');
      console.error('[Settings] Failed to save config:', error);
    }
  }

  async validateConfig() {
    try {
      const validation = await window.electronAPI.validateAPIConfig();

      this.validationResult.style.display = 'block';

      if (validation.valid) {
        this.validationResult.className = 'validation-message alert-success';
        this.validationResult.innerHTML = `
          <strong>✓ 配置验证通过</strong>
          <ul>
            <li>Auth Token: ${this.maskToken(validation.config.authToken)}</li>
            <li>Base URL: ${validation.config.baseUrl}</li>
            <li>Model: ${validation.config.model}</li>
            <li>代理: ${validation.config.useProxy ? '已启用' : '未启用'}</li>
            ${validation.config.useProxy && validation.config.httpsProxy ? `<li>HTTPS Proxy: ${validation.config.httpsProxy}</li>` : ''}
            ${validation.config.useProxy && validation.config.httpProxy ? `<li>HTTP Proxy: ${validation.config.httpProxy}</li>` : ''}
          </ul>
        `;
      } else {
        this.validationResult.className = 'validation-message alert-error';
        this.validationResult.innerHTML = `
          <strong>✗ 配置验证失败</strong>
          <ul>
            ${validation.errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
        `;
      }
    } catch (error) {
      this.validationResult.style.display = 'block';
      this.validationResult.className = 'validation-message alert-error';
      this.validationResult.innerHTML = `<strong>验证失败：${error.message}</strong>`;
      console.error('[Settings] Validation failed:', error);
    }
  }

  async showConfigPath() {
    try {
      const configPath = await window.electronAPI.getConfigPath();

      this.configPathDiv.style.display = 'block';
      this.configPathDiv.innerHTML = `
        <div class="title">配置文件位置</div>
        <div class="path">${configPath}</div>
        <div style="margin-top: 10px; font-size: 12px; color: #666;">
          您可以手动编辑此文件来修改配置
        </div>
      `;
    } catch (error) {
      this.showAlert('获取配置路径失败：' + error.message, 'error');
      console.error('[Settings] Failed to get config path:', error);
    }
  }

  toggleProxyFields(show) {
    if (show) {
      this.proxyFields.classList.add('visible');
    } else {
      this.proxyFields.classList.remove('visible');
    }
  }

  showAlert(message, type = 'success') {
    this.alert.className = `alert alert-${type} visible`;
    this.alert.textContent = message;

    // 3 秒后自动隐藏
    setTimeout(() => {
      this.alert.classList.remove('visible');
    }, 3000);
  }

  maskToken(token) {
    if (!token || token.length < 10) {
      return '未配置';
    }
    return token.substring(0, 10) + '...' + token.substring(token.length - 4);
  }

  togglePasswordVisibility(inputId) {
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

  updateModelInputHint(category) {
    const modelInput = document.getElementById('model');
    const modelDescription = document.getElementById('modelDescription');
    
    if (category === 'official' || category === 'proxy') {
      // 官方或中转服务：启用下拉提示
      modelInput.setAttribute('list', 'modelSuggestions');
      modelDescription.textContent = '可从下拉列表选择官方模型，或手动输入';
    } else {
      // 第三方服务：移除下拉提示
      modelInput.removeAttribute('list');
      modelDescription.textContent = '请根据第三方服务文档输入支持的模型名称';
    }
  }
}

// 初始化应用
const app = new SettingsApp();
