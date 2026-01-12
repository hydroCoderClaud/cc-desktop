/**
 * Claude Code Desktop - 应用主逻辑
 * 完全独立，不依赖Web版代码
 */

console.log('[App] Initializing...');

// ========================================
// 全局状态
// ========================================
const state = {
  terminal: null,
  fitAddon: null,
  currentProject: null,
  projects: [],
  connected: false,
  config: null,
  cleanupFunctions: [] // Store event listener cleanup functions
};

// ========================================
// Toast 通知
// ========================================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type} show`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ========================================
// 终端管理
// ========================================
function initTerminal() {
  console.log('[App] Initializing terminal...');

  // 创建 xterm 实例
  state.terminal = new Terminal({
    cursorBlink: true,
    fontSize: 14,
    fontFamily: 'Consolas, "Courier New", monospace',
    theme: {
      background: '#1a1a1a',
      foreground: '#ffffff'
    },
    convertEol: true
  });

  // Fit Addon
  state.fitAddon = new FitAddon.FitAddon();
  state.terminal.loadAddon(state.fitAddon);

  // Web Links Addon
  const webLinksAddon = new WebLinksAddon.WebLinksAddon();
  state.terminal.loadAddon(webLinksAddon);

  // 挂载到 DOM
  state.terminal.open(document.getElementById('terminal'));
  state.fitAddon.fit();

  // 监听用户输入
  state.terminal.onData(data => {
    if (state.connected && window.electronAPI) {
      window.electronAPI.writeTerminal(data);
    }
  });

  // 监听窗口大小变化
  window.addEventListener('resize', () => {
    if (state.fitAddon && state.connected) {
      state.fitAddon.fit();
      const { cols, rows } = state.terminal;
      window.electronAPI.resizeTerminal({ cols, rows });
    }
  });

  // 监听终端数据
  if (window.electronAPI) {
    const cleanupData = window.electronAPI.onTerminalData(data => {
      if (state.terminal) {
        state.terminal.write(data);
      }
    });
    state.cleanupFunctions.push(cleanupData);

    const cleanupExit = window.electronAPI.onTerminalExit(({ exitCode }) => {
      console.log('[App] Terminal exited with code:', exitCode);
      showToast('Terminal process exited', 'info');
      handleDisconnect();
    });
    state.cleanupFunctions.push(cleanupExit);

    const cleanupError = window.electronAPI.onTerminalError(error => {
      console.error('[App] Terminal error:', error);
      showToast('Terminal error: ' + error, 'error');
      handleDisconnect();
    });
    state.cleanupFunctions.push(cleanupError);
  }

  console.log('[App] Terminal initialized');
}

// 更新终端主题
function updateTerminalTheme(theme) {
  if (!state.terminal) return;

  if (theme === 'dark') {
    state.terminal.options.theme = {
      background: '#0d0d0d',
      foreground: '#e8e8e8',
      cursor: '#ff6b35',
      cursorAccent: '#ff6b35',
      selectionBackground: 'rgba(255, 107, 53, 0.3)',
      black: '#0d0d0d',
      red: '#e74c3c',
      green: '#27ae60',
      yellow: '#f4d03f',
      blue: '#3498db',
      magenta: '#9b59b6',
      cyan: '#1abc9c',
      white: '#ecf0f1',
      brightBlack: '#34495e',
      brightRed: '#c0392b',
      brightGreen: '#229954',
      brightYellow: '#f39c12',
      brightBlue: '#2980b9',
      brightMagenta: '#8e44ad',
      brightCyan: '#16a085',
      brightWhite: '#ffffff'
    };
  } else {
    state.terminal.options.theme = {
      background: '#f5f5f0',
      foreground: '#2d2d2d',
      cursor: '#ff6b35',
      cursorAccent: '#ff6b35',
      selectionBackground: 'rgba(255, 107, 53, 0.2)',
      black: '#2d2d2d',
      red: '#e74c3c',
      green: '#27ae60',
      yellow: '#f39c12',
      blue: '#3498db',
      magenta: '#9b59b6',
      cyan: '#1abc9c',
      white: '#ecf0f1',
      brightBlack: '#7f8c8d',
      brightRed: '#c0392b',
      brightGreen: '#229954',
      brightYellow: '#d68910',
      brightBlue: '#2980b9',
      brightMagenta: '#8e44ad',
      brightCyan: '#16a085',
      brightWhite: '#f5f5f0'
    };
  }
}

// 连接到项目
async function connectToProject(project) {
  if (!window.electronAPI) {
    showToast('Electron API not available', 'error');
    return;
  }

  try {
    console.log('[App] Connecting to project:', project.path);

    const result = await window.electronAPI.startTerminal(project.path);

    if (result.success) {
      state.connected = true;
      state.currentProject = project;

      // 更新 UI
      document.getElementById('emptyState').classList.add('hidden');
      document.getElementById('terminalContainer').classList.add('visible');
      document.getElementById('currentSessionName').textContent = project.name;
      document.getElementById('currentProjectPath').textContent = project.path;

      // 自适应终端大小
      setTimeout(() => {
        if (state.fitAddon) {
          state.fitAddon.fit();
          const { cols, rows } = state.terminal;
          window.electronAPI.resizeTerminal({ cols, rows });
        }
      }, 100);

      showToast(`Connected: ${project.name}`, 'success');
    } else {
      showToast('Failed to start terminal: ' + result.error, 'error');
    }
  } catch (error) {
    console.error('[App] Connection error:', error);
    showToast('Connection failed: ' + error.message, 'error');
  }
}

// 断开连接
function handleDisconnect() {
  state.connected = false;
  state.currentProject = null;

  // Cleanup event listeners
  state.cleanupFunctions.forEach(cleanup => {
    if (typeof cleanup === 'function') {
      cleanup();
    }
  });
  state.cleanupFunctions = [];

  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('terminalContainer').classList.remove('visible');
  document.getElementById('currentSessionName').textContent = 'Welcome';
  document.getElementById('currentProjectPath').textContent = '请选择项目';

  // 清空终端
  if (state.terminal) {
    state.terminal.clear();
  }
}

// ========================================
// 项目管理
// ========================================
async function loadProjects() {
  if (!window.electronAPI) {
    console.warn('[App] electronAPI not available');
    return;
  }

  try {
    state.projects = await window.electronAPI.listProjects();
    renderProjects();
  } catch (error) {
    console.error('[App] Failed to load projects:', error);
    state.projects = [];
    renderProjects();
  }
}

function renderProjects() {
  const list = document.getElementById('projectList');

  if (state.projects.length === 0) {
    list.innerHTML = `
      <div class="session-item">
        <div class="session-title" style="color: var(--text-secondary);">
          No projects yet
        </div>
        <div class="session-meta" style="font-size: 12px;">
          Click "+ New session" to add a project
        </div>
      </div>
    `;
    return;
  }

  list.innerHTML = state.projects.map(project => `
    <div class="session-item" data-project-id="${project.id}">
      <div class="session-title">${project.icon || '📁'} ${project.name}</div>
      <div class="session-meta">
        <span class="session-path" title="${project.path}">${project.path}</span>
      </div>
    </div>
  `).join('');

  // 添加点击事件
  document.querySelectorAll('.session-item[data-project-id]').forEach(item => {
    item.addEventListener('click', () => {
      const projectId = item.dataset.projectId;
      const project = state.projects.find(p => p.id === projectId);
      if (project) {
        selectProject(project);
      }
    });
  });
}

function selectProject(project) {
  // 高亮选中项
  document.querySelectorAll('.session-item').forEach(item => {
    item.classList.remove('active');
  });
  const item = document.querySelector(`[data-project-id="${project.id}"]`);
  if (item) {
    item.classList.add('active');
  }

  // 更新选择器显示
  document.getElementById('selectedProjectName').textContent = project.name;
  document.getElementById('currentSessionName').textContent = project.name;
  document.getElementById('currentProjectPath').textContent = project.path;

  state.currentProject = project;
}

async function addNewProject() {
  if (!window.electronAPI) {
    showToast('Electron API not available', 'error');
    return;
  }

  try {
    const folderPath = await window.electronAPI.selectFolder();
    if (!folderPath) return; // 用户取消

    // 获取文件夹名称作为项目名
    const folderName = folderPath.split(/[\\\/]/).pop();

    const project = await window.electronAPI.addProject({
      name: folderName,
      path: folderPath
    });

    // 重新加载项目列表
    await loadProjects();

    // 自动选择新项目
    selectProject(project);

    showToast(`Added: ${project.name}`, 'success');
  } catch (error) {
    console.error('[App] Failed to add project:', error);
    showToast('Failed to add project: ' + error.message, 'error');
  }
}

// ========================================
// 主题切换
// ========================================
function applyTheme(theme) {
  if (theme === 'dark') {
    document.body.classList.add('dark-theme');
    document.getElementById('themeIcon').textContent = '☀️';
  } else {
    document.body.classList.remove('dark-theme');
    document.getElementById('themeIcon').textContent = '🌙';
  }

  updateTerminalTheme(theme);
}

async function toggleTheme() {
  const isDark = document.body.classList.contains('dark-theme');
  const newTheme = isDark ? 'light' : 'dark';

  applyTheme(newTheme);

  // 保存到配置
  if (window.electronAPI) {
    try {
      await window.electronAPI.updateSettings({ theme: newTheme });
    } catch (error) {
      console.error('[App] Failed to save theme:', error);
    }
  }
}

// ========================================
// 配置管理
// ========================================
async function loadConfig() {
  if (!window.electronAPI) return;

  try {
    state.config = await window.electronAPI.getConfig();

    // 应用主题
    applyTheme(state.config.settings.theme);

    console.log('[App] Config loaded:', state.config);
  } catch (error) {
    console.error('[App] Failed to load config:', error);
  }
}

// ========================================
// API 配置管理
// ========================================
async function checkAPIConfig() {
  if (!window.electronAPI) return;

  try {
    // 获取当前 Profile
    const currentProfile = await window.electronAPI.getCurrentProfile();
    const indicator = document.getElementById('apiStatusIndicator');
    const textEl = document.querySelector('.api-config-btn .text');
    const iconEl = document.querySelector('.api-config-btn .icon');

    if (currentProfile) {
      // 显示当前 Profile 名称和图标
      if (textEl) textEl.textContent = currentProfile.name;
      if (iconEl) iconEl.textContent = currentProfile.icon || '🔑';

      indicator.classList.add('active');
      indicator.classList.remove('error');
      indicator.title = '已配置';
      console.log('[App] Current profile:', currentProfile.name);
    } else {
      // 未配置
      if (textEl) textEl.textContent = 'API 配置';
      if (iconEl) iconEl.textContent = '🔑';

      indicator.classList.add('active', 'error');
      indicator.title = '需要配置 API';
      console.log('[App] No API profile configured');
    }
  } catch (error) {
    console.error('[App] Failed to check API config:', error);
  }
}

function openAPISettings() {
  if (!window.electronAPI) {
    showToast('Electron API not available', 'error');
    return;
  }

  // 打开 Profile 管理器
  window.electronAPI.openProfileManager();
  console.log('[App] Opening profile manager');
}

// 打开旧的设置界面（保留以备兼容）
function openLegacySettings() {
  if (!window.electronAPI) {
    showToast('Electron API not available', 'error');
    return;
  }

  window.electronAPI.openSettings();
  console.log('[App] Opening legacy settings window');
}

// ========================================
// 事件绑定
// ========================================
function bindEvents() {
  // New session 按钮
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', addNewProject);
  }

  // Connect 按钮
  const connectBtn = document.getElementById('connectBtn');
  if (connectBtn) {
    connectBtn.addEventListener('click', () => {
      if (!state.currentProject) {
        showToast('Please select a project first', 'error');
        return;
      }
      connectToProject(state.currentProject);
    });
  }

  // 主题切换按钮
  const themeToggleBtn = document.getElementById('themeToggleBtn');
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', toggleTheme);
  }

  // API 配置按钮
  const apiConfigBtn = document.getElementById('apiConfigBtn');
  if (apiConfigBtn) {
    apiConfigBtn.addEventListener('click', openAPISettings);
  }

  console.log('[App] Events bound');
}

// ========================================
// 初始化
// ========================================
document.addEventListener('DOMContentLoaded', async () => {
  console.log('[App] DOM loaded');

  // 加载配置
  await loadConfig();

  // 检查 API 配置状态
  await checkAPIConfig();

  // 初始化终端
  initTerminal();

  // 加载项目列表
  await loadProjects();

  // 绑定事件
  bindEvents();

  console.log('[App] Initialization complete');
});
