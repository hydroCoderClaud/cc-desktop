# 认证方式二选一更新 - 更新日志

## 版本信息
- **版本**：v1.2.1
- **更新日期**：2026-01-12
- **状态**：✅ 已完成

## 更新背景

### 问题
之前的实现同时设置 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY` 两个环境变量，可能导致：
- 环境变量冗余
- 潜在的冲突问题
- 不清楚实际使用哪个变量

### 解决方案
改为二选一的方式：
- 用户在配置时选择使用哪种认证方式
- 仅设置用户选择的环境变量
- 避免重复设置和潜在冲突

## 更新内容

### 1. Profile 数据结构更新

新增 `authType` 字段：

```javascript
{
  "id": "uuid-1",
  "name": "Anthropic 官方",
  "authToken": "sk-ant-api03-xxx",
  "authType": "auth_token",  // 新增：'auth_token' 或 'api_key'
  "baseUrl": "https://api.anthropic.com",
  "model": "claude-sonnet-4-5-20250929",
  // ...
}
```

**字段说明：**
- `authType: "auth_token"` - 设置 `ANTHROPIC_AUTH_TOKEN` 环境变量（官方使用）
- `authType: "api_key"` - 设置 `ANTHROPIC_API_KEY` 环境变量（第三方服务使用）

### 2. ConfigManager 更新

#### 修改的方法

**addAPIProfile()**
```javascript
const newProfile = {
  // ...
  authType: profileData.authType || 'auth_token',  // 默认 auth_token
  // ...
};
```

**migrateToProfiles()**
```javascript
const defaultProfile = {
  // ...
  authType: 'auth_token',  // 迁移时默认使用 auth_token
  // ...
};
```

**getAPIConfig()**
```javascript
return {
  authToken: currentProfile.authToken,
  authType: currentProfile.authType || 'auth_token',  // 返回认证方式
  // ...
};
```

### 3. ClaudeAPIManager 更新

#### 环境变量设置逻辑

**之前（同时设置两个）：**
```javascript
const env = {
  ...process.env,
  ANTHROPIC_AUTH_TOKEN: apiConfig.authToken,
  ANTHROPIC_API_KEY: apiConfig.authToken,
  ANTHROPIC_BASE_URL: apiConfig.baseUrl
};
```

**更新后（二选一）：**
```javascript
const env = {
  ...process.env,
  ANTHROPIC_BASE_URL: apiConfig.baseUrl
};

// 根据 authType 设置对应的环境变量（二选一）
const authType = apiConfig.authType || 'auth_token';
if (authType === 'auth_token') {
  env.ANTHROPIC_AUTH_TOKEN = apiConfig.authToken;
  console.log('[Claude API] Using ANTHROPIC_AUTH_TOKEN');
} else if (authType === 'api_key') {
  env.ANTHROPIC_API_KEY = apiConfig.authToken;
  console.log('[Claude API] Using ANTHROPIC_API_KEY');
}
```

### 4. UI 界面更新

#### Profile 管理界面 (profile-manager.html)

新增认证方式选择：
```html
<div class="form-group">
  <label>认证方式 <span class="required">*</span></label>
  <div style="display: flex; gap: 20px; margin-bottom: 10px;">
    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      <input type="radio" name="authType" value="auth_token" id="authTypeToken" checked />
      <span>ANTHROPIC_AUTH_TOKEN</span>
    </label>
    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
      <input type="radio" name="authType" value="api_key" id="authTypeKey" />
      <span>ANTHROPIC_API_KEY</span>
    </label>
  </div>
  <div class="description">
    Auth Token: Claude Code CLI 官方使用<br>
    API Key: 部分第三方服务使用
  </div>
</div>
```

#### 旧设置界面 (settings.html)

同样添加认证方式选择单选按钮。

### 5. JavaScript 更新

#### profile-manager.js

**editProfile() - 加载配置时设置认证方式：**
```javascript
const authType = profile.authType || 'auth_token';
if (authType === 'auth_token') {
  document.getElementById('authTypeToken').checked = true;
} else {
  document.getElementById('authTypeKey').checked = true;
}
```

**saveProfile() - 保存时获取认证方式：**
```javascript
const profileData = {
  // ...
  authType: formData.get('authType') || 'auth_token',
  // ...
};
```

#### settings.js

**loadConfig() - 加载配置：**
```javascript
const authType = apiConfig.authType || 'auth_token';
if (authType === 'auth_token') {
  document.getElementById('authTypeToken').checked = true;
} else {
  document.getElementById('authTypeKey').checked = true;
}
```

**saveConfig() - 保存配置：**
```javascript
const authTypeToken = document.getElementById('authTypeToken');
const authType = authTypeToken.checked ? 'auth_token' : 'api_key';

const apiConfig = {
  authToken: document.getElementById('authToken').value.trim(),
  authType: authType,
  // ...
};
```

## 向后兼容性

### 自动处理

- ✅ 旧配置（没有 `authType` 字段）自动默认为 `auth_token`
- ✅ ConfigManager 的 `getAPIConfig()` 会自动补充默认值
- ✅ 迁移逻辑会自动为旧配置添加 `authType` 字段
- ✅ 无需手动修改现有配置文件

### 默认行为

**所有情况默认使用 `auth_token`：**
- 新建 Profile 时
- 迁移旧配置时
- 读取没有 `authType` 的配置时

## 使用指南

### 添加新配置时选择认证方式

1. 打开 Profile 管理窗口
2. 点击"添加新配置"
3. **选择认证方式**：
   - 如果使用 Anthropic 官方 API → 选择 `ANTHROPIC_AUTH_TOKEN`
   - 如果使用第三方服务 → 根据服务要求选择
4. 输入认证令牌
5. 填写其他配置并保存

### 修改现有配置的认证方式

1. 打开 Profile 管理窗口
2. 找到要修改的配置
3. 点击"编辑"
4. 更改认证方式
5. 保存

### 如何判断使用哪种认证方式？

**使用 ANTHROPIC_AUTH_TOKEN：**
- Anthropic 官方 API
- Claude Code CLI 官方文档推荐

**使用 ANTHROPIC_API_KEY：**
- 第三方服务商明确要求使用此变量
- 自建 API 网关配置为使用此变量

**不确定？**
- 默认选择 `ANTHROPIC_AUTH_TOKEN`
- 如果连接失败，再尝试切换为 `ANTHROPIC_API_KEY`

## 文件变更清单

### 修改的文件

```
src/main/config-manager.js           - 添加 authType 支持
src/main/claude-api-manager.js       - 根据 authType 设置环境变量
src/renderer/profile-manager.html    - 添加认证方式选择
src/renderer/js/profile-manager.js   - 处理 authType
src/renderer/settings.html           - 添加认证方式选择
src/renderer/js/settings.js          - 处理 authType
```

### 新增的文件

```
docs/CHANGELOG-AUTH-TYPE.zh.md       - 本文档
```

## 配置文件位置

配置文件存储在：

- **Windows**: `%APPDATA%\claude-code-desktop\config.json`
  - 通常为：`C:\Users\<用户名>\AppData\Roaming\claude-code-desktop\config.json`
- **macOS**: `~/Library/Application Support/claude-code-desktop/config.json`
- **Linux**: `~/.config/claude-code-desktop/config.json`

### 查看配置文件位置

**方法 1：在设置界面查看**
1. 打开 API 配置界面（旧设置窗口）
2. 点击"查看配置文件位置"按钮

**方法 2：在 Profile 管理界面**
- 配置文件路径会显示在窗口中（未来版本）

## 测试验证

### 测试场景 1：新建配置（Auth Token）

1. 创建新配置
2. 选择 `ANTHROPIC_AUTH_TOKEN`
3. 输入 token
4. 保存并使用
5. 启动 CLI，验证只设置了 `ANTHROPIC_AUTH_TOKEN` 环境变量

**预期日志：**
```
[Claude API] Using ANTHROPIC_AUTH_TOKEN
```

### 测试场景 2：新建配置（API Key）

1. 创建新配置
2. 选择 `ANTHROPIC_API_KEY`
3. 输入 key
4. 保存并使用
5. 启动 CLI，验证只设置了 `ANTHROPIC_API_KEY` 环境变量

**预期日志：**
```
[Claude API] Using ANTHROPIC_API_KEY
```

### 测试场景 3：旧配置迁移

1. 使用旧版本创建的配置
2. 启动新版本应用
3. 配置自动迁移，添加 `authType: "auth_token"`
4. 验证功能正常

## 对比说明

### 之前的方式

```javascript
// 同时设置两个环境变量
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-xxx
ANTHROPIC_API_KEY=sk-ant-api03-xxx      // 冗余
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

**问题：**
- ❌ 环境变量重复
- ❌ 不清楚实际使用哪个
- ❌ 可能造成混淆

### 现在的方式

**场景 1：使用 Auth Token**
```javascript
ANTHROPIC_AUTH_TOKEN=sk-ant-api03-xxx    // 仅设置这个
ANTHROPIC_BASE_URL=https://api.anthropic.com
```

**场景 2：使用 API Key**
```javascript
ANTHROPIC_API_KEY=custom-key-xxx         // 仅设置这个
ANTHROPIC_BASE_URL=https://custom-api.com/v1
```

**优点：**
- ✅ 环境变量清晰明确
- ✅ 避免冗余和冲突
- ✅ 用户明确知道使用哪个变量

## 相关文档

- [CHANGELOG-MULTIPLE-PROFILES.zh.md](./CHANGELOG-MULTIPLE-PROFILES.zh.md) - 多 API 配置功能
- [CHANGELOG-ENV-VARS.zh.md](./CHANGELOG-ENV-VARS.zh.md) - 环境变量兼容性（旧版）
- [API-CONFIG-GUIDE.zh.md](./API-CONFIG-GUIDE.zh.md) - API 配置指南

---

**实现状态**：✅ 已完成
**测试状态**：⏳ 待测试
**文档状态**：✅ 已完成
