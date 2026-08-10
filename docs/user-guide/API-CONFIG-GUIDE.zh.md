# 模型配置指南

本文档说明如何在 Hydro Desktop 中管理模型配置和代理参数，并与实际程序行为保持一致。

## 配置入口

### 方式 1：界面配置（推荐）

1. 启动应用后，打开 **模型配置** 窗口。
2. 新增或编辑一个模型配置。
3. 按界面顺序填写配置名称、图标、接口地址、默认模型、模型 ID 列表和密钥。
4. 点击 **测试连接** 验证配置。

如需从代码中打开该窗口，可调用：

```js
window.electronAPI.openProfileManager()
```

### 方式 2：手动编辑配置文件

配置文件路径：

- **Windows**：`%APPDATA%\cc-desktop\config.json`
- **macOS**：`~/Library/Application Support/cc-desktop/config.json`
- **Linux**：`~/.config/cc-desktop/config.json`

当前版本关键字段：

- `apiProfiles`：完整的 API Profile 列表（内部字段名），每个模型配置独立保存名称、地址、认证信息和模型列表
- `defaultProfileId`：默认 Profile ID
- `settings.agent.claudeConfigDir`：运行配置目录；当前版本会固化为 `~/.hydrocoder/agent`，不建议手动编辑

旧版 `serviceProviderDefinitions`、`serviceProvider` 和 `providerName` 只用于启动时一次性迁移；迁移完成后会从配置文件移除。

运行配置目录由程序管理，界面只展示物理位置，不允许用户修改。启动时应用会创建 `~/.hydrocoder/agent`，并把旧 `~/.claude/projects` 下缺失的会话 JSONL 复制到 `~/.hydrocoder/agent/projects`；该迁移不修改 `sessions.db`、会话 `cwd` 或项目目录。

## 当前配置结构

### 最小可用示例

```json
{
  "defaultProfileId": "profile-qwen",
  "apiProfiles": [
    {
      "id": "profile-qwen",
      "name": "千问tokenplan",
      "icon": "🔵",
      "authToken": "your-token",
      "authType": "auth_token",
      "baseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      "defaultModels": ["qwen3.7-plus", "qwen3.7-max"],
      "selectedModelId": "qwen3.7-plus",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": "",
      "description": "",
      "isDefault": true
    }
  ]
}
```

### 另一套 API 网关示例

```json
{
  "defaultProfileId": "profile-custom",
  "apiProfiles": [
    {
      "id": "profile-custom",
      "name": "Company Gateway",
      "icon": "🟢",
      "authToken": "internal-token",
      "authType": "auth_token",
      "baseUrl": "https://gateway.example.com/anthropic",
      "defaultModels": ["qwen3-coder-plus", "deepseek-chat"],
      "selectedModelId": "qwen3-coder-plus",
      "requestTimeout": 180000,
      "disableNonessentialTraffic": true,
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": "",
      "description": "企业内部网关",
      "isDefault": true
    }
  ]
}
```

## 字段说明

### Profile 字段

| 字段 | 说明 |
|------|------|
| `name` | Profile 显示名称 |
| `icon` | Profile 图标 |
| `authToken` | 认证令牌 |
| `authType` | `api_key` 或 `auth_token`；新增 Profile 默认 `auth_token` |
| `baseUrl` | API 基础地址 |
| `defaultModels` | 当前 Profile 可选模型 ID 列表 |
| `selectedModelId` | 默认模型 ID，直接写真实模型名 |
| `requestTimeout` | 请求超时，单位毫秒 |
| `disableNonessentialTraffic` | 是否关闭非必要网络流量 |
| `useProxy` | 是否启用代理 |
| `httpsProxy` / `httpProxy` | 代理地址 |
| `description` | 备注说明 |
| `isDefault` | 是否为默认 Profile；实际默认值以 `defaultProfileId` 为准 |

## 当前程序行为

### 模型选择

- 当前版本已经移除 Profile 级 `selectedModelTier`。
- 当前版本已经移除全局和 Profile 级 `customModels`。
- 默认模型使用 `selectedModelId`，直接传递真实模型 ID。
- 地址、模型 ID 列表和默认模型 ID 都直接由当前 Profile 管理，不需要先选择模板。
- `defaultModels` 和 `selectedModelId` 都从当前 Profile 读取，Profile 之间互不共享模型列表。
- `selectedModelId` 必须为空或存在于当前 Profile 的 `defaultModels`；删除默认模型后会自动切换到列表首项。
- 默认 Profile 卡片会自动排在列表第一位。

### 模型 ID 列表拉取

- 模型列表区域的拉取按钮会使用当前 Profile 的 `baseUrl`、`authToken`、`authType` 和代理配置请求端点模型列表。
- 探测顺序为：`{baseUrl}/v1/models`、`{origin}/v1/models`、`{origin}/models`。
- 支持返回数组、`data` 数组或 `models` 数组，并从字符串或对象 `id` 字段中提取模型 ID。
- 若端点不提供兼容的模型列表接口，现有模型列表会保留，用户仍可手动添加或删除。

### 配置生效时机

- 新建会话会读取当前默认 Profile。
- 已经运行中的会话不会热切换到新的 API 配置。
- 修改 Profile 后，应新建会话或重新连接会话再验证。

## 环境变量映射

程序会将 Profile 映射为内置 Agent runtime 所需的运行环境：

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| `authToken` + `authType=api_key` | `ANTHROPIC_API_KEY` | `x-api-key` 认证模式 |
| `authToken` + `authType=auth_token` | `ANTHROPIC_AUTH_TOKEN` | Token 模式 |
| `baseUrl` | `ANTHROPIC_BASE_URL` | 自定义 API 地址 |
| `selectedModelId` | `ANTHROPIC_MODEL` | 默认启动模型 |
| `requestTimeout` | `API_TIMEOUT_MS` | 请求超时 |
| `disableNonessentialTraffic=true` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | 关闭非必要流量 |
| `httpsProxy` | `HTTPS_PROXY` / `https_proxy` | HTTPS 代理 |
| `httpProxy` | `HTTP_PROXY` / `http_proxy` | HTTP 代理 |

注意：

- `authToken` 不会同时设置成两种认证变量，而是根据 `authType` 二选一。
- 当 Profile 未显式指定 `selectedModelId` 时，`ANTHROPIC_MODEL` 不会被写入。

## 常见场景

### 场景 1：千问 / 通义 Anthropic 兼容端点

```json
{
  "defaultProfileId": "qwen",
  "apiProfiles": [
    {
      "id": "qwen",
      "name": "千问模型配置",
      "authToken": "your-token",
      "authType": "auth_token",
      "baseUrl": "https://coding.dashscope.aliyuncs.com/apps/anthropic",
      "defaultModels": ["qwen3.7-plus", "qwen3.7-max"],
      "selectedModelId": "qwen3.7-plus",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": false
    }
  ]
}
```

### 场景 2：DeepSeek Anthropic 兼容端点

```json
{
  "defaultProfileId": "deepseek",
  "apiProfiles": [
    {
      "id": "deepseek",
      "name": "DeepSeek 模型配置",
      "authToken": "your-token",
      "authType": "auth_token",
      "baseUrl": "https://api.deepseek.com/anthropic",
      "defaultModels": ["deepseek-v4-flash[1m]", "deepseek-v4-pro[1m]"],
      "selectedModelId": "deepseek-v4-flash[1m]",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": false
    }
  ]
}
```

### 场景 3：企业网关 + 代理

```json
{
  "defaultProfileId": "company-gateway",
  "apiProfiles": [
    {
      "id": "company-gateway",
      "name": "Company Gateway",
      "authToken": "internal-token",
      "authType": "auth_token",
      "baseUrl": "https://gateway.example.com/anthropic",
      "defaultModels": ["qwen3-coder-plus", "deepseek-chat"],
      "selectedModelId": "qwen3-coder-plus",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": true,
      "httpsProxy": "http://127.0.0.1:7890",
      "httpProxy": "http://127.0.0.1:7890"
    }
  ]
}
```

## 连接测试

界面中的 **测试连接** 会优先走当前运行时探测逻辑，必要时回退到 HTTP 检测。

建议检查：

1. `authToken` 是否填写正确
2. `authType` 是否与服务端预期一致
3. `baseUrl` 是否包含正确路径
4. `selectedModelId` 是否为目标服务支持的真实模型 ID
5. 代理地址是否可访问

模型列表拉取失败通常表示端点没有暴露 `/v1/models` 或 `/models` 兼容接口，或者认证方式不匹配；这不影响手动维护模型 ID 列表。

## 故障排查

### 问题 1：配置文件改了，但界面没有显示

- 确认修改的是 `cc-desktop/config.json`
- 确认字段名使用 `apiProfiles` 和 `defaultProfileId`
- 重启应用后再检查

### 问题 2：连接测试失败

- 检查 `authType` 是否选错
- 检查 `baseUrl` 是否需要额外的 `/v1` 或网关路径
- 检查 `selectedModelId` 是否是服务端支持的模型 ID

### 问题 3：模型列表为空

- 这是当前 Profile 的 `defaultModels` 为空导致的界面候选缺失
- 可以在模型列表区域点击拉取按钮自动获取
- 或直接手动补充当前 Profile 的 `defaultModels`

### 问题 4：代理已打开但请求仍直连

- 确认 `useProxy` 已启用
- 确认 `httpsProxy` / `httpProxy` 不是空字符串
- 确认代理地址格式为 `http://host:port`

## 命令行验证

如需脱离桌面端核对 Profile 映射后的环境变量，可参考下列等价值。桌面端自身会使用内置 runtime，不要求用户额外安装系统命令。

```bash
# Windows (PowerShell)
$env:ANTHROPIC_AUTH_TOKEN="your-token"
$env:ANTHROPIC_BASE_URL="https://coding.dashscope.aliyuncs.com/apps/anthropic"
$env:ANTHROPIC_MODEL="qwen3.7-plus"
$env:CLAUDE_CONFIG_DIR="$HOME\\.hydrocoder\\agent"

# macOS / Linux
export ANTHROPIC_AUTH_TOKEN="your-token"
export ANTHROPIC_BASE_URL="https://coding.dashscope.aliyuncs.com/apps/anthropic"
export ANTHROPIC_MODEL="qwen3.7-plus"
export CLAUDE_CONFIG_DIR="$HOME/.hydrocoder/agent"
```

## 相关文档

- [QUICKSTART.md](../QUICKSTART.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [INSTALL.md](../INSTALL.md)
