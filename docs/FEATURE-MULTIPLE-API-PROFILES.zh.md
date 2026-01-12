# 功能设计：多 API 配置管理

## 版本信息
- **目标版本**：v1.2.0
- **优先级**：高
- **状态**：设计中

## 需求概述

### 用户需求
> "API的配置是可以多个的，用户可以增加多个api，然后选择一个为默认使用的。"

### 使用场景

1. **多环境切换**
   - 开发环境：测试 API
   - 生产环境：正式 API
   - 个人账号 vs 企业账号

2. **多服务商对比**
   - Anthropic 官方
   - 第三方服务 A（便宜）
   - 第三方服务 B（快速）
   - 企业内部网关

3. **不同模型切换**
   - Profile A：使用 Sonnet（平衡）
   - Profile B：使用 Opus（质量）
   - Profile C：使用 Haiku（速度）

4. **团队协作**
   - 个人 Token
   - 团队共享 Token
   - 项目专用 Token

## 设计方案

### 1. 数据结构

#### 配置文件结构 (config.json)

```json
{
  "recentProjects": [...],

  "apiProfiles": [
    {
      "id": "uuid-1",
      "name": "Anthropic 官方",
      "authToken": "sk-ant-api03-xxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": "",
      "isDefault": true,
      "createdAt": "2026-01-12T10:00:00Z",
      "lastUsed": "2026-01-12T10:00:00Z",
      "icon": "🟣"
    },
    {
      "id": "uuid-2",
      "name": "第三方服务",
      "authToken": "custom-token",
      "baseUrl": "https://custom-api.com/v1",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": true,
      "httpsProxy": "http://127.0.0.1:7890",
      "httpProxy": "http://127.0.0.1:7890",
      "isDefault": false,
      "createdAt": "2026-01-12T11:00:00Z",
      "lastUsed": "2026-01-12T12:00:00Z",
      "icon": "🔵"
    }
  ],

  "currentProfileId": "uuid-1",

  "settings": {
    "theme": "light",
    "terminal": {...},
    "maxRecentProjects": 10
  }
}
```

#### Profile 数据模型

```typescript
interface APIProfile {
  id: string;              // UUID
  name: string;            // 显示名称
  authToken: string;       // API Token
  baseUrl: string;         // API 端点
  model: string;           // 模型名称
  useProxy: boolean;       // 是否使用代理
  httpsProxy: string;      // HTTPS 代理
  httpProxy: string;       // HTTP 代理
  isDefault: boolean;      // 是否为默认
  createdAt: string;       // 创建时间
  lastUsed: string;        // 最后使用时间
  icon: string;            // 图标（emoji）
}
```

### 2. ConfigManager 更新

#### 新增方法

```javascript
class ConfigManager {
  // Profile 管理
  getAPIProfiles() {}
  getAPIProfile(profileId) {}
  addAPIProfile(profileData) {}
  updateAPIProfile(profileId, updates) {}
  deleteAPIProfile(profileId) {}
  setDefaultProfile(profileId) {}

  // 当前 Profile
  getCurrentProfile() {}
  setCurrentProfile(profileId) {}

  // 向后兼容
  getAPIConfig() {
    // 返回当前 Profile 的配置
    return this.getCurrentProfile();
  }
}
```

### 3. UI 设计

#### 3.1 主界面 - 配置选择器

**位置**：左下角 API 配置按钮

**现有**：
```
┌─────────────────────────────┐
│ 🔑 API 配置             🟢  │
└─────────────────────────────┘
```

**新设计**：
```
┌─────────────────────────────┐
│ 🟣 Anthropic 官方       🟢  │ ← 显示当前配置名称
│    [切换配置] [管理配置]    │
└─────────────────────────────┘
```

点击"切换配置"弹出下拉菜单：
```
┌─────────────────────────────┐
│ ● 🟣 Anthropic 官方   ✓默认 │ ← 当前选中
│ ○ 🔵 第三方服务              │
│ ○ 🟠 测试环境                │
├─────────────────────────────┤
│ ➕ 添加新配置                │
│ ⚙️  管理所有配置              │
└─────────────────────────────┘
```

#### 3.2 配置管理界面

**窗口标题**：API 配置管理

**布局**：
```
┌────────────────────────────────────────────────┐
│  API 配置管理                           [关闭]  │
├────────────────────────────────────────────────┤
│                                                │
│  当前配置：🟣 Anthropic 官方                    │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🟣 Anthropic 官方                 ✓默认  │ │
│  │ https://api.anthropic.com              │ │
│  │ Model: claude-sonnet-4-5               │ │
│  │ [编辑] [删除] [使用]                    │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ 🔵 第三方服务                            │ │
│  │ https://custom-api.com/v1              │ │
│  │ Model: claude-sonnet-4-5               │ │
│  │ [编辑] [删除] [设为默认] [使用]         │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│  ┌──────────────────────────────────────────┐ │
│  │ ➕ 添加新配置                            │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└────────────────────────────────────────────────┘
```

#### 3.3 编辑配置界面

**新增/编辑 Profile 表单**：
```
┌────────────────────────────────────────┐
│  编辑 API 配置                  [关闭]  │
├────────────────────────────────────────┤
│                                        │
│  配置名称 *                            │
│  [Anthropic 官方____________]          │
│                                        │
│  图标                                  │
│  [🟣] ← 点击选择                       │
│                                        │
│  认证令牌 (Auth Token) *               │
│  [sk-ant-api03-●●●●●●●●●●●●]         │
│                                        │
│  API 基础 URL                          │
│  [https://api.anthropic.com]           │
│                                        │
│  模型选择                              │
│  [claude-sonnet-4-5-20250929]          │
│                                        │
│  ☐ 启用代理                            │
│                                        │
│  ☐ 设为默认配置                        │
│                                        │
│  [保存] [取消]                         │
│                                        │
└────────────────────────────────────────┘
```

### 4. 交互流程

#### 4.1 添加新配置

```
用户点击 "➕ 添加新配置"
  ↓
弹出编辑表单（空白）
  ↓
用户填写配置信息
  ↓
点击"保存"
  ↓
验证配置（调用 validateAPIConfig）
  ↓ 成功
添加到 apiProfiles
  ↓
保存到 config.json
  ↓
刷新配置列表
  ↓
提示"配置已添加"
```

#### 4.2 切换配置

```
用户点击 "切换配置"
  ↓
显示配置列表（下拉菜单）
  ↓
用户选择一个配置
  ↓
setCurrentProfile(profileId)
  ↓
更新 lastUsed 时间
  ↓
保存到 config.json
  ↓
更新主界面显示
  ↓
提示"已切换到：配置名"
```

#### 4.3 设为默认

```
用户点击 "设为默认"
  ↓
将选中配置的 isDefault 设为 true
  ↓
将其他配置的 isDefault 设为 false
  ↓
保存到 config.json
  ↓
刷新配置列表
  ↓
提示"已设为默认配置"
```

#### 4.4 删除配置

```
用户点击 "删除"
  ↓
确认对话框："确定删除此配置？"
  ↓ 确认
检查是否为当前使用的配置
  ↓ 是
  提示"请先切换到其他配置"
  ↓ 否
从 apiProfiles 中移除
  ↓
保存到 config.json
  ↓
刷新配置列表
  ↓
提示"配置已删除"
```

### 5. IPC 通信

#### 新增 IPC 通道

```javascript
// Profile 管理
ipcMain.handle('api:listProfiles', async () => {
  return configManager.getAPIProfiles();
});

ipcMain.handle('api:getProfile', async (event, profileId) => {
  return configManager.getAPIProfile(profileId);
});

ipcMain.handle('api:addProfile', async (event, profileData) => {
  return configManager.addAPIProfile(profileData);
});

ipcMain.handle('api:updateProfile', async (event, { profileId, updates }) => {
  return configManager.updateAPIProfile(profileId, updates);
});

ipcMain.handle('api:deleteProfile', async (event, profileId) => {
  return configManager.deleteAPIProfile(profileId);
});

ipcMain.handle('api:setDefault', async (event, profileId) => {
  return configManager.setDefaultProfile(profileId);
});

// 当前 Profile
ipcMain.handle('api:getCurrentProfile', async () => {
  return configManager.getCurrentProfile();
});

ipcMain.handle('api:setCurrentProfile', async (event, profileId) => {
  return configManager.setCurrentProfile(profileId);
});

// 打开配置管理窗口
ipcMain.handle('window:openProfileManager', async () => {
  // 创建配置管理窗口
});
```

### 6. 文件结构

#### 新增文件

```
src/
├── main/
│   ├── config-manager.js          (更新)
│   ├── claude-api-manager.js      (保持不变)
│   └── ipc-handlers.js            (新增 Profile IPC)
│
├── renderer/
│   ├── profile-manager.html       (新建)
│   ├── profile-editor.html        (新建)
│   └── js/
│       ├── profile-manager.js     (新建)
│       ├── profile-editor.js      (新建)
│       └── app.js                 (更新)
│
└── preload/
    └── preload.js                 (新增 Profile API)
```

## 实现计划

### Phase 1: 数据层（Week 1）
- [ ] 更新配置文件结构
- [ ] ConfigManager 新增 Profile 方法
- [ ] 数据迁移脚本（单配置 → 多配置）
- [ ] 单元测试

### Phase 2: IPC 层（Week 1）
- [ ] 新增 IPC 通道
- [ ] Preload 桥接更新
- [ ] IPC 测试

### Phase 3: UI 层（Week 2）
- [ ] 配置管理界面（profile-manager.html）
- [ ] 配置编辑界面（profile-editor.html）
- [ ] 主界面配置选择器更新
- [ ] 图标选择器

### Phase 4: 集成测试（Week 2）
- [ ] 功能测试
- [ ] 边界条件测试
- [ ] 性能测试
- [ ] 文档更新

## 兼容性

### 向后兼容策略

**自动迁移**：首次启动时
```javascript
// 检测旧配置格式
if (config.settings.api && !config.apiProfiles) {
  // 迁移到新格式
  config.apiProfiles = [{
    id: uuidv4(),
    name: "默认配置",
    ...config.settings.api,
    isDefault: true,
    createdAt: new Date().toISOString(),
    lastUsed: new Date().toISOString(),
    icon: "🟣"
  }];

  config.currentProfileId = config.apiProfiles[0].id;

  // 删除旧配置
  delete config.settings.api;

  // 保存
  saveConfig(config);
}
```

## 用户体验优化

### 1. 快速切换
- 主界面显示当前配置名称
- 点击弹出下拉菜单
- 选择立即切换，无需打开设置

### 2. 智能提示
- 未配置时：红色指示灯 + "请配置 API"
- 已配置时：绿色指示灯 + 配置名称
- 配置错误时：黄色指示灯 + "配置异常"

### 3. 使用统计
- 记录每个配置的使用次数
- 显示最后使用时间
- 自动排序（最近使用的在前）

### 4. 配置模板
- 预设常见服务商配置
- 一键导入模板
- 只需填写 Token

## 安全考虑

### 1. Token 安全
- 显示时掩码
- 复制时完整复制
- 不记录到日志

### 2. 配置导出
- 导出时可选择是否包含 Token
- 警告提示：Token 是敏感信息

### 3. 配置备份
- 自动备份到 backups/ 目录
- 保留最近 5 个备份
- 可恢复历史配置

## 测试用例

### 功能测试
- [ ] 添加新配置
- [ ] 编辑配置
- [ ] 删除配置
- [ ] 设为默认
- [ ] 切换配置
- [ ] 配置验证
- [ ] 数据迁移

### 边界测试
- [ ] 没有配置时
- [ ] 只有一个配置时
- [ ] 删除当前使用的配置
- [ ] 删除默认配置
- [ ] Token 为空
- [ ] 名称重复

### 性能测试
- [ ] 10 个配置时的性能
- [ ] 50 个配置时的性能
- [ ] 配置切换响应时间

## 文档更新

- [ ] API-CONFIG-GUIDE.zh.md
- [ ] TESTING-GUIDE.zh.md
- [ ] README.md
- [ ] CHANGELOG.md

## 预期效果

### 用户反馈
- ⭐⭐⭐⭐⭐ 配置切换方便
- ⭐⭐⭐⭐⭐ 支持多环境
- ⭐⭐⭐⭐⭐ UI 直观易用

### 性能指标
- 配置切换 < 100ms
- 配置保存 < 50ms
- UI 响应 < 200ms

---

**状态**：📋 设计完成，待实现
**优先级**：🔥 高
**预计完成**：2 周
