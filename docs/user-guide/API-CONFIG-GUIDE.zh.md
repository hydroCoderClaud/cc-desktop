# API 配置指南

本文档说明如何配置 Claude Code Desktop 的 API 连接参数，以支持 Anthropic 官方 API 和第三方兼容服务。

## 目录

- [配置方式](#配置方式)
- [配置项说明](#配置项说明)
- [使用场景](#使用场景)
- [配置示例](#配置示例)
- [故障排查](#故障排查)

## 配置方式

### 方式 1：设置界面（推荐）

1. 启动应用后，在主界面点击 **"设置"** 按钮
2. 或者通过代码调用：`window.electronAPI.openSettings()`
3. 填写配置信息并点击 **"保存配置"**
4. 点击 **"验证配置"** 确保配置正确

### 方式 2：手动编辑配置文件

配置文件位置：
- **Windows**: `%APPDATA%\claude-code-desktop\config.json`
- **macOS**: `~/Library/Application Support/claude-code-desktop/config.json`
- **Linux**: `~/.config/claude-code-desktop/config.json`

编辑 `settings.api` 部分即可。

## 配置项说明

### 基础配置

#### 1. authToken（必填）

**说明**：API 认证令牌

**环境变量**：`ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY`（同时设置，兼容不同服务）

**格式**：
- Anthropic 官方：`sk-ant-api03-...`
- 第三方服务：根据服务商提供的格式

**获取方式**：
- Anthropic 官方：[https://console.anthropic.com](https://console.anthropic.com)
- 第三方服务：从服务商处获取

**兼容性说明**：
- 应用会同时设置 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY`
- Claude Code CLI 官方使用 `ANTHROPIC_AUTH_TOKEN`
- 部分第三方服务使用 `ANTHROPIC_API_KEY`
- 同时设置两者可确保最大兼容性

**示例**：
```json
{
  "authToken": "sk-ant-api03-xxxxxxxxxxxx"
}
```

#### 2. baseUrl（可选）

**说明**：API 基础 URL，用于支持第三方服务

**环境变量**：`ANTHROPIC_BASE_URL`

**默认值**：`https://api.anthropic.com`

**使用场景**：
- 使用第三方兼容服务
- 使用企业内部代理服务
- 使用镜像 API 服务

**示例**：
```json
{
  "baseUrl": "https://api.anthropic.com"
}
```

#### 3. model（可选）

**说明**：指定使用的 Claude 模型

**默认值**：`claude-sonnet-4-5-20250929`

**可选值**：
- `claude-sonnet-4-5-20250929` - Sonnet 4.5（推荐）
- `claude-opus-4-5-20251101` - Opus 4.5（最强）
- `claude-haiku-4-0-20250107` - Haiku 4（最快）

**示例**：
```json
{
  "model": "claude-sonnet-4-5-20250929"
}
```

### 代理配置

#### 4. useProxy（可选）

**说明**：是否启用代理

**默认值**：`false`

**使用场景**：
- 网络受限环境
- 需要通过代理访问 API
- 企业防火墙环境

**示例**：
```json
{
  "useProxy": true
}
```

#### 5. httpsProxy（可选）

**说明**：HTTPS 代理地址

**环境变量**：`HTTPS_PROXY` 和 `https_proxy`（两者都会设置）

**格式**：`http://host:port` 或 `https://host:port`

**示例**：
```json
{
  "httpsProxy": "http://127.0.0.1:7890"
}
```

#### 6. httpProxy（可选）

**说明**：HTTP 代理地址

**环境变量**：`HTTP_PROXY` 和 `http_proxy`（两者都会设置）

**格式**：`http://host:port`

**示例**：
```json
{
  "httpProxy": "http://127.0.0.1:7890"
}
```

## 使用场景

### 场景 1：使用 Anthropic 官方 API

**最简配置**：
```json
{
  "settings": {
    "api": {
      "authToken": "sk-ant-api03-xxxxxxxxxxxx"
    }
  }
}
```

**完整配置**：
```json
{
  "settings": {
    "api": {
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": ""
    }
  }
}
```

### 场景 2：使用第三方兼容服务

**示例：使用自定义 API 端点**
```json
{
  "settings": {
    "api": {
      "authToken": "your-custom-token",
      "baseUrl": "https://custom-api-provider.com/v1",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false
    }
  }
}
```

### 场景 3：通过代理访问

**示例：使用本地代理**
```json
{
  "settings": {
    "api": {
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": true,
      "httpsProxy": "http://127.0.0.1:7890",
      "httpProxy": "http://127.0.0.1:7890"
    }
  }
}
```

**示例：使用企业代理（带认证）**
```json
{
  "settings": {
    "api": {
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": true,
      "httpsProxy": "http://username:password@proxy.company.com:8080",
      "httpProxy": "http://username:password@proxy.company.com:8080"
    }
  }
}
```

### 场景 4：企业内部服务

**示例：使用企业内部 API 网关**
```json
{
  "settings": {
    "api": {
      "authToken": "internal-auth-token",
      "baseUrl": "https://internal-gateway.company.com/claude",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false
    }
  }
}
```

## 配置验证

### 自动验证

保存配置后，应用会自动验证：

1. ✅ authToken 是否已填写
2. ✅ baseUrl 是否有效
3. ✅ 如果启用代理，是否配置了代理地址

### 手动验证

在设置界面点击 **"验证配置"** 按钮，查看验证结果。

### 验证结果示例

**成功**：
```
✓ 配置验证通过
• Auth Token: sk-ant-api...xxxx
• Base URL: https://api.anthropic.com
• Model: claude-sonnet-4-5-20250929
• 代理: 已启用
• HTTPS Proxy: http://127.0.0.1:7890
```

**失败**：
```
✗ 配置验证失败
• API 认证令牌未配置
• 已启用代理但未配置代理地址
```

## 环境变量映射

应用会将配置项映射到以下环境变量，传递给 Claude Code CLI：

| 配置项 | 环境变量 | 说明 |
|-------|---------|------|
| `authToken` | `ANTHROPIC_AUTH_TOKEN` | API 认证令牌（官方） |
| `authToken` | `ANTHROPIC_API_KEY` | API 认证令牌（第三方兼容） |
| `baseUrl` | `ANTHROPIC_BASE_URL` | API 基础 URL |
| `httpsProxy` | `HTTPS_PROXY` / `https_proxy` | HTTPS 代理（大小写都设置） |
| `httpProxy` | `HTTP_PROXY` / `http_proxy` | HTTP 代理（大小写都设置） |

**注意**：`authToken` 会同时设置为 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY`，确保与所有服务兼容。

## 故障排查

### 问题 1：无法连接到 API

**可能原因**：
- Auth Token 错误
- Base URL 错误
- 网络连接问题

**解决方案**：
1. 检查 Auth Token 是否正确
2. 检查 Base URL 是否可访问
3. 尝试启用代理

### 问题 2：代理不生效

**可能原因**：
- 代理地址错误
- 代理需要认证但未配置
- useProxy 未启用

**解决方案**：
1. 确认代理地址格式正确：`http://host:port`
2. 如需认证，使用：`http://username:password@host:port`
3. 确保 `useProxy` 已勾选

### 问题 3：第三方服务连接失败

**可能原因**：
- Base URL 格式错误
- 第三方服务不兼容
- Auth Token 格式不匹配

**解决方案**：
1. 检查 Base URL 是否包含正确的路径（如 `/v1`）
2. 确认第三方服务是否兼容 Anthropic API
3. 使用第三方服务提供的 Token 格式

### 问题 4：配置不生效

**可能原因**：
- 配置未保存
- 需要重启应用
- 配置文件格式错误

**解决方案**：
1. 在设置界面点击 "保存配置"
2. 重启应用
3. 手动检查 config.json 格式是否正确

## 安全建议

1. **不要分享 Auth Token**
   - Auth Token 是敏感信息，切勿分享给他人
   - 不要提交到版本控制系统

2. **使用环境变量（可选）**
   - 对于敏感环境，可以直接设置系统环境变量
   - 环境变量优先级高于配置文件

3. **定期更换 Token**
   - 定期更换 Auth Token
   - 如果 Token 泄露，立即从服务商处撤销

4. **代理安全**
   - 使用可信的代理服务
   - 避免在代理 URL 中明文存储密码

## 高级用法

### 切换不同的服务

创建多个配置文件备份，在不同服务间切换：

```bash
# 备份官方配置
cp config.json config.official.json

# 备份第三方配置
cp config.json config.custom.json

# 切换到官方配置
cp config.official.json config.json
```

### 命令行验证

可以通过命令行验证环境变量是否正确：

```bash
# Windows (PowerShell)
$env:ANTHROPIC_AUTH_TOKEN="sk-ant-api03-xxx"
$env:ANTHROPIC_BASE_URL="https://api.anthropic.com"
claude code --print "hello"

# macOS/Linux
export ANTHROPIC_AUTH_TOKEN="sk-ant-api03-xxx"
export ANTHROPIC_BASE_URL="https://api.anthropic.com"
claude code --print "hello"
```

## 相关文档

- [CUSTOM-UI-GUIDE.md](./CUSTOM-UI-GUIDE.md) - 自定义 UI 开发指南
- [ARCHITECTURE-COMPARISON.md](./ARCHITECTURE-COMPARISON.md) - 架构模式对比
- [CLAUDE.zh.md](../CLAUDE.zh.md) - 项目架构说明

## 支持

如有问题，请：
1. 查看应用日志（F12 打开开发者工具）
2. 检查配置文件 config.json
3. 提交 Issue 到项目仓库
