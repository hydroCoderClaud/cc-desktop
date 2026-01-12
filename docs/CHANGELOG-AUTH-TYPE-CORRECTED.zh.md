# 认证方式说明修正 - 更新日志

## 版本信息
- **版本**：v1.2.2
- **更新日期**：2026-01-12
- **状态**：✅ 已完成

## 修正说明

### 问题发现

在之前的实现中，对两种认证方式的说明**完全错误**：
- ❌ 错误地说 `ANTHROPIC_AUTH_TOKEN` 是官方使用
- ❌ 错误地说 `ANTHROPIC_API_KEY` 是第三方服务使用
- ❌ 默认值设置为 `auth_token`

### 官方文档验证

查阅 Anthropic 官方文档后确认：

**✅ 正确的使用方式：**
- `ANTHROPIC_API_KEY` - Anthropic 官方 API 标准（推荐）
- `ANTHROPIC_AUTH_TOKEN` - 第三方代理服务/自建网关

**官方文档来源：**
- [Anthropic SDK Python](https://github.com/anthropics/anthropic-sdk-python) - 使用 `ANTHROPIC_API_KEY`
- [Anthropic SDK TypeScript](https://github.com/anthropics/anthropic-sdk-typescript) - 使用 `ANTHROPIC_API_KEY`
- [Claude Help Center](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code) - 使用 `ANTHROPIC_API_KEY`

## 修正内容

### 1. 默认值修正

**所有默认值从 `auth_token` 改为 `api_key`：**

```javascript
// ConfigManager
authType: profileData.authType || 'api_key'  // ✅ 修正为 api_key

// ClaudeAPIManager
const authType = apiConfig.authType || 'api_key';  // ✅ 修正为 api_key
```

### 2. UI 说明文字修正

**Profile 管理界面和设置界面：**

**之前（错误）：**
```
Auth Token: Claude Code CLI 官方使用
API Key: 部分第三方服务使用
```

**修正后（正确）：**
```
API Key: Anthropic 官方 API（推荐）
Auth Token: 第三方代理服务/自建网关
```

### 3. 默认选中修正

**单选按钮默认选中改为 `ANTHROPIC_API_KEY`：**

```html
<!-- 修正前 -->
<input type="radio" name="authType" value="auth_token" id="authTypeToken" checked />

<!-- 修正后 -->
<input type="radio" name="authType" value="api_key" id="authTypeKey" checked />
```

### 4. 环境变量设置逻辑修正

**ClaudeAPIManager 日志输出：**

```javascript
if (authType === 'api_key') {
  env.ANTHROPIC_API_KEY = apiConfig.authToken;
  console.log('[Claude API] Using ANTHROPIC_API_KEY (official)');
} else if (authType === 'auth_token') {
  env.ANTHROPIC_AUTH_TOKEN = apiConfig.authToken;
  console.log('[Claude API] Using ANTHROPIC_AUTH_TOKEN (third-party)');
}
```

## 使用指南（修正后）

### 选择认证方式

**使用 ANTHROPIC_API_KEY（推荐，默认）：**
- ✅ Anthropic 官方 API
- ✅ 直接使用 Anthropic SDK
- ✅ 官方文档推荐的标准方式

**使用 ANTHROPIC_AUTH_TOKEN：**
- ✅ LiteLLM 代理服务
- ✅ ZenMux 等第三方代理
- ✅ 自建 API 网关
- ✅ 需要特殊认证方式的服务

### 如何判断使用哪种？

1. **如果使用 Anthropic 官方 API** → 使用 `ANTHROPIC_API_KEY`（默认）
2. **如果使用第三方代理服务** → 查看服务商文档，他们会明确说明使用哪个环境变量
3. **不确定？** → 使用默认的 `ANTHROPIC_API_KEY`

## 修正的文件清单

### 修改的文件

```
src/main/config-manager.js           - 所有默认值改为 api_key
src/main/claude-api-manager.js       - 默认值和日志说明
src/renderer/profile-manager.html    - 默认选中和说明文字
src/renderer/profile-manager.js      - 默认值处理
src/renderer/settings.html           - 默认选中和说明文字
src/renderer/js/settings.js          - 默认值处理
```

### 新增的文档

```
docs/CHANGELOG-AUTH-TYPE-CORRECTED.zh.md  - 本修正文档
```

## 对用户的影响

### 现有用户（已配置）

**✅ 无影响，向后兼容**
- 已保存的配置不会被修改
- 如果旧配置没有 `authType` 字段，会自动补充为 `api_key`（正确的默认值）
- 功能保持正常

### 新用户（未配置）

**✅ 获得正确的默认值**
- 新建配置时默认选中 `ANTHROPIC_API_KEY`（官方标准）
- 更符合官方文档的推荐
- 减少配置错误的可能性

## 关于模型选择

### 官方模型

Anthropic 官方提供三个模型系列：
- **Opus 4.5** - 最强大：`claude-opus-4-5-20251101`
- **Sonnet 4.5** - 平衡（默认）：`claude-sonnet-4-5-20250929`
- **Haiku 4** - 最快：`claude-haiku-4-0-20250107`

### 第三方服务模型

第三方服务通常：
- 使用 Anthropic API 兼容的接口格式
- 但模型名称可能不同
- 需要查看服务商文档了解支持的模型列表

**示例：**
- 可能只支持 Claude 3 系列：`claude-3-opus-20240229`、`claude-3-sonnet-20240229`
- 可能有自己的模型命名

**所以保留文本输入框是正确的设计**，让用户可以根据服务商文档填写对应的模型名称。

## 测试验证

### 测试场景 1：新建配置（官方 API）

1. 创建新配置
2. 默认已选中 `ANTHROPIC_API_KEY` ✅
3. 输入官方 token
4. 保存并使用
5. 启动 CLI，验证只设置了 `ANTHROPIC_API_KEY`

**预期日志：**
```
[Claude API] Using ANTHROPIC_API_KEY (official)
```

### 测试场景 2：第三方代理服务

1. 创建新配置
2. 手动选择 `ANTHROPIC_AUTH_TOKEN`
3. 输入代理服务的 token
4. 保存并使用
5. 验证只设置了 `ANTHROPIC_AUTH_TOKEN`

**预期日志：**
```
[Claude API] Using ANTHROPIC_AUTH_TOKEN (third-party)
```

### 测试场景 3：旧配置兼容性

1. 使用旧版本创建的配置（没有 authType 字段）
2. 启动新版本
3. 自动补充 `authType: "api_key"`
4. 功能正常

## 感谢

感谢用户提出疑问！这让我们：
- 查阅了官方文档
- 发现了错误的说明
- 及时修正了问题

这是一个很好的例子，说明了**当不确定时应该查阅官方文档**，而不是依赖假设。

## 相关文档

- [CHANGELOG-AUTH-TYPE.zh.md](./CHANGELOG-AUTH-TYPE.zh.md) - 原始实现文档（包含错误说明）
- [CHANGELOG-MULTIPLE-PROFILES.zh.md](./CHANGELOG-MULTIPLE-PROFILES.zh.md) - 多 API 配置功能
- [API-CONFIG-GUIDE.zh.md](./API-CONFIG-GUIDE.zh.md) - API 配置指南

## 官方文档参考

- [Managing API Key Environment Variables in Claude Code](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code)
- [Anthropic Python SDK](https://github.com/anthropics/anthropic-sdk-python)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [Claude Code CLI Environment Variables](https://gist.github.com/unkn0wncode/f87295d055dd0f0e8082358a0b5cc467)

---

**修正状态**：✅ 已完成
**测试状态**：⏳ 待测试
**文档状态**：✅ 已完成
**致歉**：对之前错误的说明表示歉意
