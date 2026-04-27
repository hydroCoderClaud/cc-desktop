# API 配置指南

本文档说明如何在 Hydro Desktop 中配置当前版本使用的 API Profile、服务商定义和代理参数，并与实际程序行为保持一致。

## 配置入口

### 方式 1：界面配置（推荐）

1. 启动应用后，打开 **API 配置管理** 窗口。
2. 新增或编辑一个 Profile。
3. 填写认证信息、服务商、基础 URL、默认模型 ID 和代理参数。
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

当前版本应编辑：

- `apiProfiles`：API Profile 列表
- `defaultProfileId`：默认 Profile ID
- `serviceProviderDefinitions`：服务商定义（可选）

不再使用旧版 `settings.api`、`customModels`、`selectedModelTier` 等结构。

## 当前配置结构

### 最小可用示例

```json
{
  "defaultProfileId": "profile-official",
  "apiProfiles": [
    {
      "id": "profile-official",
      "name": "Anthropic Official",
      "icon": "🔵",
      "serviceProvider": "official",
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "authType": "api_key",
      "baseUrl": "https://api.anthropic.com",
      "selectedModelId": "claude-sonnet-4-6",
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

### 含自定义服务商的示例

```json
{
  "defaultProfileId": "profile-custom",
  "apiProfiles": [
    {
      "id": "profile-custom",
      "name": "Company Gateway",
      "icon": "🟢",
      "serviceProvider": "company-gateway",
      "authToken": "internal-token",
      "authType": "auth_token",
      "baseUrl": "https://gateway.example.com/anthropic",
      "selectedModelId": "claude-sonnet-4-6",
      "requestTimeout": 180000,
      "disableNonessentialTraffic": true,
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": "",
      "description": "企业内部网关",
      "isDefault": true
    }
  ],
  "serviceProviderDefinitions": [
    {
      "id": "company-gateway",
      "name": "Company Gateway",
      "baseUrl": "https://gateway.example.com/anthropic",
      "defaultModels": [
        "claude-sonnet-4-6",
        "claude-opus-4-6"
      ],
      "defaultModelMapping": {
        "sonnet": "claude-sonnet-4-6",
        "opus": "claude-opus-4-6"
      }
    }
  ]
}
```

## 字段说明

### Profile 字段

| 字段 | 说明 |
|------|------|
| `name` | Profile 显示名称 |
| `serviceProvider` | 服务商 ID，例如 `official`、`proxy` 或自定义服务商 |
| `authToken` | 认证令牌 |
| `authType` | `api_key` 或 `auth_token` |
| `baseUrl` | API 基础地址 |
| `selectedModelId` | 默认模型 ID，直接写真实模型名 |
| `requestTimeout` | 请求超时，单位毫秒 |
| `disableNonessentialTraffic` | 是否关闭非必要网络流量 |
| `useProxy` | 是否启用代理 |
| `httpsProxy` / `httpProxy` | 代理地址 |
| `description` | 备注说明 |

### 服务商定义字段

| 字段 | 说明 |
|------|------|
| `id` | 服务商唯一 ID |
| `name` | 服务商显示名称 |
| `baseUrl` | 默认基础地址 |
| `defaultModels` | 当前服务商可选模型 ID 列表 |
| `defaultModelMapping` | 可选的 tier 默认映射，仅用于运行时补全 `ANTHROPIC_DEFAULT_*_MODEL` |

## 当前程序行为

### 模型选择

- 当前版本已经移除 Profile 级 `selectedModelTier`。
- 当前版本已经移除全局和 Profile 级 `customModels`。
- 默认模型使用 `selectedModelId`，直接传递真实模型 ID。
- 服务商定义中的 `defaultModels` 只用于界面候选项。
- 服务商定义中的 `defaultModelMapping` 只在运行时补全 tier 默认环境变量，不会写回 Profile。

### 配置生效时机

- 新建会话会读取当前默认 Profile。
- 已经运行中的会话不会热切换到新的 API 配置。
- 修改 Profile 后，应新建会话或重新连接会话再验证。

## 环境变量映射

程序会将 Profile 映射为 Claude Code CLI 运行环境：

| 配置项 | 环境变量 | 说明 |
|--------|----------|------|
| `authToken` + `authType=api_key` | `ANTHROPIC_API_KEY` | 官方 API Key 模式 |
| `authToken` + `authType=auth_token` | `ANTHROPIC_AUTH_TOKEN` | Token 模式 |
| `baseUrl` | `ANTHROPIC_BASE_URL` | 自定义 API 地址 |
| `selectedModelId` | `ANTHROPIC_MODEL` | 默认启动模型 |
| `serviceProviderDefinitions[].defaultModelMapping.opus` | `ANTHROPIC_DEFAULT_OPUS_MODEL` | 运行时 tier 默认映射 |
| `serviceProviderDefinitions[].defaultModelMapping.sonnet` | `ANTHROPIC_DEFAULT_SONNET_MODEL` | 运行时 tier 默认映射 |
| `serviceProviderDefinitions[].defaultModelMapping.haiku` | `ANTHROPIC_DEFAULT_HAIKU_MODEL` | 运行时 tier 默认映射 |
| `requestTimeout` | `API_TIMEOUT_MS` | 请求超时 |
| `disableNonessentialTraffic=true` | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` | 关闭非必要流量 |
| `httpsProxy` | `HTTPS_PROXY` / `https_proxy` | HTTPS 代理 |
| `httpProxy` | `HTTP_PROXY` / `http_proxy` | HTTP 代理 |

注意：

- `authToken` 不会同时设置成两种认证变量，而是根据 `authType` 二选一。
- 当 Profile 未显式指定 `selectedModelId` 时，`ANTHROPIC_MODEL` 不会被写入。

## 常见场景

### 场景 1：Anthropic 官方 API

```json
{
  "defaultProfileId": "official",
  "apiProfiles": [
    {
      "id": "official",
      "name": "Anthropic Official",
      "serviceProvider": "official",
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "authType": "api_key",
      "baseUrl": "https://api.anthropic.com",
      "selectedModelId": "claude-sonnet-4-6",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": false
    }
  ]
}
```

### 场景 2：第三方兼容服务

```json
{
  "defaultProfileId": "proxy-service",
  "apiProfiles": [
    {
      "id": "proxy-service",
      "name": "Proxy Service",
      "serviceProvider": "proxy",
      "authToken": "your-token",
      "authType": "api_key",
      "baseUrl": "https://proxy.example.com/v1",
      "selectedModelId": "claude-sonnet-4-6",
      "requestTimeout": 120000,
      "disableNonessentialTraffic": true,
      "useProxy": false
    }
  ]
}
```

### 场景 3：通过代理访问

```json
{
  "defaultProfileId": "official",
  "apiProfiles": [
    {
      "id": "official",
      "name": "Anthropic Official",
      "serviceProvider": "official",
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "authType": "api_key",
      "baseUrl": "https://api.anthropic.com",
      "selectedModelId": "claude-sonnet-4-6",
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

- 这是服务商定义 `defaultModels` 为空导致的界面候选缺失
- 可以直接手动填写 `selectedModelId`
- 或补充对应服务商定义的 `defaultModels`

### 问题 4：代理已打开但请求仍直连

- 确认 `useProxy` 已启用
- 确认 `httpsProxy` / `httpProxy` 不是空字符串
- 确认代理地址格式为 `http://host:port`

## 命令行验证

如需脱离桌面端快速验证当前环境，可直接在终端中运行：

```bash
# Windows (PowerShell)
$env:ANTHROPIC_API_KEY="sk-ant-api03-xxx"
$env:ANTHROPIC_BASE_URL="https://api.anthropic.com"
$env:ANTHROPIC_MODEL="claude-sonnet-4-6"
claude --print "hello"

# macOS / Linux
export ANTHROPIC_API_KEY="sk-ant-api03-xxx"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
export ANTHROPIC_MODEL="claude-sonnet-4-6"
claude --print "hello"
```

## 相关文档

- [QUICKSTART.md](../QUICKSTART.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [INSTALL.md](../INSTALL.md)
