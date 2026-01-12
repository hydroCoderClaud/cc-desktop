# 环境变量兼容性更新

## 更新日期
2026-01-12

## 问题背景

部分第三方 API 服务使用 `ANTHROPIC_API_KEY` 环境变量，而 Claude Code CLI 官方使用 `ANTHROPIC_AUTH_TOKEN`。为了确保兼容性，需要同时设置两个环境变量。

## 解决方案

**同时设置两个环境变量**，让应用兼容所有服务：
- `ANTHROPIC_AUTH_TOKEN` - Claude Code CLI 官方
- `ANTHROPIC_API_KEY` - 第三方服务

## 修改内容

### 1. ClaudeAPIManager 更新

**文件**：`src/main/claude-api-manager.js`

**修改**：
```javascript
const env = {
  ...process.env,
  // 同时设置两种环境变量，兼容不同的 API 服务
  ANTHROPIC_AUTH_TOKEN: apiConfig.authToken,  // Claude Code CLI 官方使用
  ANTHROPIC_API_KEY: apiConfig.authToken,     // 第三方服务可能使用
  ANTHROPIC_BASE_URL: apiConfig.baseUrl
};
```

### 2. 设置界面更新

**文件**：`src/renderer/settings.html`

**修改**：标签和说明文字
```html
<label>
  认证令牌 (Auth Token / API Key) <span class="required">*</span>
</label>
<div class="description">
  环境变量：ANTHROPIC_AUTH_TOKEN + ANTHROPIC_API_KEY（同时设置）<br>
  从 Anthropic 官网或第三方服务商获取
</div>
```

### 3. 文档更新

**文件**：`docs/API-CONFIG-GUIDE.zh.md`

**添加兼容性说明**：
- 应用会同时设置 `ANTHROPIC_AUTH_TOKEN` 和 `ANTHROPIC_API_KEY`
- Claude Code CLI 官方使用 `ANTHROPIC_AUTH_TOKEN`
- 部分第三方服务使用 `ANTHROPIC_API_KEY`
- 同时设置两者可确保最大兼容性

## 兼容的服务

### 使用 ANTHROPIC_AUTH_TOKEN 的服务
- ✅ Claude Code CLI（官方）
- ✅ Anthropic API（官方）

### 使用 ANTHROPIC_API_KEY 的服务
- ✅ 部分第三方兼容服务
- ✅ 自建 API 网关
- ✅ 代理服务

### 两者都支持
- ✅ 现在所有服务都兼容！

## 环境变量映射表

| 配置项 | 环境变量 1 | 环境变量 2 |
|-------|-----------|-----------|
| `authToken` | `ANTHROPIC_AUTH_TOKEN` | `ANTHROPIC_API_KEY` |
| `baseUrl` | `ANTHROPIC_BASE_URL` | - |
| `httpsProxy` | `HTTPS_PROXY` | `https_proxy` |
| `httpProxy` | `HTTP_PROXY` | `http_proxy` |

## 测试验证

### 测试场景 1：官方 API
```bash
# 启动应用
npm run dev

# 配置
authToken: sk-ant-api03-xxx
baseUrl: https://api.anthropic.com

# 验证环境变量
echo $ANTHROPIC_AUTH_TOKEN  # 应该有值
echo $ANTHROPIC_API_KEY     # 应该有值（相同）
```

### 测试场景 2：第三方服务
```bash
# 配置
authToken: custom-api-key
baseUrl: https://custom-provider.com/v1

# 验证环境变量
echo $ANTHROPIC_AUTH_TOKEN  # 应该有值
echo $ANTHROPIC_API_KEY     # 应该有值（相同）
```

## 向后兼容性

✅ **完全向后兼容**

- 现有配置无需修改
- 自动兼容新旧服务
- 无破坏性变更

## 未来计划

基于用户反馈，下一步将实现：

### v1.2.0 - 多 API 配置支持

**需求**：
- [ ] 用户可以添加多个 API 配置
- [ ] 每个配置有独立的名称和参数
- [ ] 可以选择一个作为默认使用
- [ ] 支持快速切换

**配置结构设计**：
```json
{
  "apiProfiles": [
    {
      "id": "uuid-1",
      "name": "Anthropic 官方",
      "authToken": "sk-ant-api03-xxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "isDefault": true
    },
    {
      "id": "uuid-2",
      "name": "第三方服务 A",
      "authToken": "custom-token-xxx",
      "baseUrl": "https://custom-a.com/v1",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "isDefault": false
    }
  ],
  "currentProfile": "uuid-1"
}
```

**UI 设计**：
```
API 配置
────────────────────────────────────

[Anthropic 官方] ✓ 默认     [编辑] [删除]
[第三方服务 A]              [编辑] [删除] [设为默认]
[第三方服务 B]              [编辑] [删除] [设为默认]

[+ 添加新配置]
```

详见：`docs/FEATURE-MULTIPLE-API-PROFILES.zh.md`

## 相关文档

- `docs/API-CONFIG-GUIDE.zh.md` - API 配置指南
- `docs/FEATURE-MULTIPLE-API-PROFILES.zh.md` - 多 API 配置功能设计（待创建）

---

**状态**：✅ 已完成
**版本**：v1.1.1
**兼容性**：完全向后兼容
