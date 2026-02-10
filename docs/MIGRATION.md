# 迁移指南

## 从 cc-web-terminal/desktop 迁移到 cc-desktop

本文档说明如何从旧的 Desktop 版本（基于 Web 版适配）迁移到新的独立版本。

---

## 为什么要重写？

### 旧版本的问题

1. **过度复用 Web 代码**
   - 依赖 `build-scripts/sync-*.js` 同步代码
   - 包含大量 Web 版的多余逻辑（用户系统、认证等）
   - 维护复杂，需要同步 Web 版更新

2. **架构不匹配**
   - Web 版是多用户服务器应用
   - Desktop 版是单用户本地应用
   - 强行适配导致概念混乱

3. **代码量大**
   - ~3000 行代码（含 Web 版适配器）
   - 理解成本高

### 新版本的优势

1. **完全独立**
   - 不依赖任何 Web 版代码
   - 独立开发和维护
   - 清晰的架构和概念

2. **更简单**
   - ~1200 行代码（减少 60%）
   - 一目了然的逻辑
   - 更快的启动速度

3. **更符合桌面应用特点**
   - 单用户模式
   - 本地配置
   - 简单的进程管理

---

## 迁移步骤

### 1. 备份旧配置（如果有）

```bash
# 旧版本配置位置
%APPDATA%/claude-code-desktop/data/

# 备份
copy "%APPDATA%\claude-code-desktop\data\projects.json" "C:\backup\projects.json"
```

### 2. 安装新版本

```bash
cd C:\workspace\develop\HydroCoder\cc-desktop
npm install
```

### 3. 手动迁移项目列表（如果需要）

**旧格式** (`projects.json`):
```json
{
  "projects": [
    {
      "name": "MyProject",
      "path": "C:\\workspace\\myproject"
    }
  ]
}
```

**新格式** (`config.json`):
```json
{
  "recentProjects": [
    {
      "id": "generated-uuid",
      "name": "MyProject",
      "path": "C:\\workspace\\myproject",
      "lastOpened": "2026-01-12T10:30:00Z",
      "icon": "📁",
      "pinned": false
    }
  ],
  "apiProfiles": [
    {
      "id": "profile-uuid",
      "name": "Default API",
      "authToken": "",
      "authType": "api_key",
      "baseUrl": "https://api.anthropic.com",
      "isDefault": true
    }
  ],
  "defaultProfileId": "profile-uuid",
  "settings": {
    "theme": "light",
    "terminal": {
      "fontSize": 14,
      "fontFamily": "Consolas, monospace"
    }
  }
}
```

**迁移脚本**（可选）:

创建 `migrate.js`:
```javascript
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// 读取旧配置
const oldPath = path.join(process.env.APPDATA, 'claude-code-desktop', 'data', 'projects.json');
const oldData = JSON.parse(fs.readFileSync(oldPath, 'utf-8'));

// 转换为新格式
const profileId = uuidv4();
const newConfig = {
  recentProjects: oldData.projects.map(p => ({
    id: uuidv4(),
    name: p.name,
    path: p.path,
    lastOpened: new Date().toISOString(),
    icon: '📁',
    pinned: false
  })),
  apiProfiles: [
    {
      id: profileId,
      name: 'Default API',
      authToken: '',  // 需要手动填写
      authType: 'api_key',
      baseUrl: 'https://api.anthropic.com',
      selectedModelTier: 'sonnet',
      isDefault: true,
      createdAt: new Date().toISOString(),
      lastUsed: new Date().toISOString()
    }
  ],
  defaultProfileId: profileId,
  settings: {
    theme: 'light',
    terminal: {
      fontSize: 14,
      fontFamily: 'Consolas, monospace'
    }
  }
};

// 保存新配置
const newPath = path.join(process.env.APPDATA, 'claude-code-desktop', 'config.json');
fs.writeFileSync(newPath, JSON.stringify(newConfig, null, 2));

console.log('Migration complete!');
```

运行：
```bash
node migrate.js
```

### 4. 配置 API Key

**方式 1：通过 UI 配置（推荐）**
1. 启动应用
2. 点击右上角 ⚙ 图标
3. 在 "API Profiles" 标签中添加配置

**方式 2：手动编辑配置文件**

编辑 `%APPDATA%\claude-code-desktop\config.json`:
```json
{
  "apiProfiles": [
    {
      "id": "your-profile-id",
      "name": "My API Key",
      "authToken": "sk-ant-your-api-key-here",
      "authType": "api_key",
      "baseUrl": "https://api.anthropic.com",
      "selectedModelTier": "sonnet",
      "isDefault": true
    }
  ],
  "defaultProfileId": "your-profile-id"
}
```

**注意**：
- v1.6.0+ 版本使用 API Profile 系统
- 旧版本的 `settings.anthropicApiKey` 字段已废弃
- 首次运行时会自动迁移旧配置到 API Profiles

### 5. 启动新版本

```bash
npm run dev
```

---

## 功能对比

| 功能 | 旧版本（Web适配） | 新版本（独立） |
|------|------------------|--------------|
| 项目管理 | ✅ | ✅ |
| 终端集成 | ✅ | ✅ |
| 主题切换 | ✅ | ✅ |
| 用户认证 | ✅（无用） | ❌ |
| 模板管理 | ✅（占位） | ❌ |
| Prompt管理 | ✅（占位） | ❌ |
| 配置管理 | 复杂 | 简单 |
| 代码同步 | 需要 | 不需要 |

---

## API 变更

### 旧版本 IPC API

```javascript
// 旧版本使用 Web 版风格的 API
window.electronAPI.getProjects()      // 返回 {success, data}
window.electronAPI.createProject()    // 创建项目
window.electronAPI.deleteProject()    // 删除项目
```

### 新版本 IPC API

```javascript
// 新版本使用更简洁的 API
window.electronAPI.listProjects()     // 直接返回数组
window.electronAPI.addProject()       // 添加到最近列表
window.electronAPI.removeProject()    // 从列表移除
```

---

## 常见问题

### Q: 旧版本和新版本可以共存吗？

A: 可以，但它们使用相同的配置目录 `%APPDATA%\claude-code-desktop`，建议：
- 在测试新版本前备份配置
- 或者修改新版本的配置目录路径

### Q: 需要卸载旧版本吗？

A: 不需要，但建议：
1. 备份旧配置
2. 测试新版本
3. 确认无误后，可以删除旧版本目录 `cc-web-terminal/desktop`

### Q: 如何回退到旧版本？

A:
```bash
cd C:\workspace\develop\HydroCoder\cc-web-terminal\desktop
npm run dev
```

旧版本代码仍然保留在原位置。

### Q: 新版本支持哪些平台？

A:
- ✅ Windows (已测试)
- ✅ macOS (理论支持，需测试)
- ✅ Linux (理论支持，需测试)

---

## 后续工作

### 对于用户

1. 测试新版本的稳定性
2. 报告 Bug 和功能建议
3. 提供使用反馈

### 对于开发者

1. 完善设置对话框
2. 添加项目右键菜单
3. 实现自动更新
4. 编写测试用例

---

## 获取帮助

- 📖 查看 [README.md](../README.md)
- 🚀 查看 [QUICKSTART.md](./QUICKSTART.md)
- 🏗️ 查看 [ARCHITECTURE.md](./ARCHITECTURE.md)
- 🐛 报告问题：创建 GitHub Issue
