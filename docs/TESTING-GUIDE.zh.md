# 测试指南 - API 配置功能

本文档说明如何测试新添加的 API 配置管理功能。

## 功能概述

✅ **已完成的功能：**
1. ConfigManager 支持完整的 API 配置（AUTH_TOKEN, BASE_URL, PROXY）
2. ClaudeAPIManager 使用新配置启动 CLI
3. 设置界面（settings.html + settings.js）
4. 主界面左下角 API 配置按钮
5. 配置状态指示器（绿色=已配置，红色=需配置）

## 测试步骤

### 1. 启动应用

```bash
cd C:\workspace\develop\HydroCoder\cc-desktop
npm install  # 如果还没安装依赖
npm run dev
```

### 2. 检查左下角 API 配置按钮

应用启动后，查看左下角：

**预期显示：**
- 🔑 **API 配置** 按钮（渐变紫色背景）
- 右侧状态指示灯：
  - 🔴 **红色**：未配置或配置错误
  - 🟢 **绿色**：配置正确

### 3. 打开 API 配置窗口

**操作：** 点击左下角的 **"🔑 API 配置"** 按钮

**预期结果：**
- 弹出新窗口 "API 配置 - Claude Code Desktop"
- 窗口尺寸：900x700
- 显示配置表单

### 4. 填写 API 配置

#### 测试场景 A：Anthropic 官方 API

1. **Auth Token**: 填写你的 Anthropic API Token
   ```
   sk-ant-api03-xxxxxxxxxxxx
   ```

2. **API 基础 URL**: 保持默认
   ```
   https://api.anthropic.com
   ```

3. **模型选择**: 保持默认
   ```
   claude-sonnet-4-5-20250929
   ```

4. **代理**: 不勾选

5. 点击 **"保存配置"**

**预期结果：**
- 显示成功提示："配置已保存！"
- 自动显示验证结果
- 验证通过：显示绿色 ✓ 标记

#### 测试场景 B：使用代理

1. 勾选 **"启用代理"**

2. 代理字段展开

3. 填写 **HTTPS 代理**:
   ```
   http://127.0.0.1:7890
   ```

4. 填写 **HTTP 代理**:
   ```
   http://127.0.0.1:7890
   ```

5. 点击 **"保存配置"**

**预期结果：**
- 配置保存成功
- 验证结果显示代理已启用

#### 测试场景 C：第三方服务

1. **Auth Token**: 填写第三方服务提供的 Token

2. **API 基础 URL**: 修改为第三方地址
   ```
   https://custom-api-provider.com/v1
   ```

3. 点击 **"保存配置"**

**预期结果：**
- 配置保存成功
- 验证通过

### 5. 验证配置

**操作：** 点击 **"验证配置"** 按钮

**预期结果：**

**成功时：**
```
✓ 配置验证通过
• Auth Token: sk-ant-api...xxxx
• Base URL: https://api.anthropic.com
• Model: claude-sonnet-4-5-20250929
• 代理: 已启用
• HTTPS Proxy: http://127.0.0.1:7890
```

**失败时：**
```
✗ 配置验证失败
• API 认证令牌未配置
• 已启用代理但未配置代理地址
```

### 6. 查看配置文件位置

**操作：** 点击 **"查看配置文件位置"**

**预期结果：**
- 显示配置文件路径
- Windows: `C:\Users\YourName\AppData\Roaming\claude-code-desktop\config.json`

### 7. 检查主界面状态指示器

关闭设置窗口，回到主界面

**预期结果：**
- 左下角 API 配置按钮右侧
- 如果配置正确：🟢 绿色指示灯
- 如果配置错误：🔴 红色指示灯
- 鼠标悬停显示 Tooltip

### 8. 验证配置文件

**操作：** 打开配置文件查看

```bash
# Windows
notepad %APPDATA%\claude-code-desktop\config.json

# 或者在设置界面点击 "查看配置文件位置"
```

**预期内容：**
```json
{
  "recentProjects": [],
  "settings": {
    "theme": "light",
    "api": {
      "authToken": "sk-ant-api03-xxxxxxxxxxxx",
      "baseUrl": "https://api.anthropic.com",
      "model": "claude-sonnet-4-5-20250929",
      "useProxy": false,
      "httpsProxy": "",
      "httpProxy": ""
    },
    "terminal": {
      "fontSize": 14,
      "fontFamily": "Consolas, monospace"
    },
    "maxRecentProjects": 10
  }
}
```

## 测试检查清单

- [ ] 主界面左下角显示 "🔑 API 配置" 按钮
- [ ] 点击按钮弹出配置窗口
- [ ] 配置窗口显示所有表单字段
- [ ] 填写 Auth Token（必填项验证）
- [ ] 修改 Base URL
- [ ] 修改 Model
- [ ] 启用/禁用代理切换
- [ ] 代理字段正确展开/折叠
- [ ] 保存配置成功提示
- [ ] 验证配置功能正常
- [ ] 显示配置文件路径
- [ ] 主界面状态指示器正确显示（绿色/红色）
- [ ] 配置文件正确保存
- [ ] Token 显示时正确掩码（sk-ant-api...xxxx）
- [ ] 开发者工具无错误日志（F12）

## 常见问题

### Q1: 点击按钮没反应

**解决方案：**
1. 打开开发者工具（F12）
2. 查看 Console 是否有错误
3. 检查 `window.electronAPI.openSettings` 是否可用

### Q2: 状态指示器不显示

**解决方案：**
1. 检查配置是否保存成功
2. 刷新应用（重启）
3. 查看开发者工具 Console 日志

### Q3: 配置窗口样式错乱

**解决方案：**
1. 检查 CSP 设置
2. 确保 settings.html 正确加载
3. 检查 CSS 是否正确应用

### Q4: 无法保存配置

**解决方案：**
1. 检查配置文件目录权限
2. 查看主进程日志（开发模式下）
3. 验证 IPC 通信是否正常

## 下一步测试

完成以上测试后，可以进行：

### 集成测试

1. **测试 ClaudeAPIManager 启动：**
   - 选择一个项目
   - 点击 Connect
   - 查看是否正确使用配置的环境变量

2. **测试环境变量注入：**
   - 在开发者工具中查看 Console
   - 应该看到类似日志：
     ```
     [Claude API] Base URL: https://api.anthropic.com
     [Claude API] Model: claude-sonnet-4-5-20250929
     [Claude API] Proxy enabled: true
     [Claude API] HTTPS Proxy: http://127.0.0.1:7890
     ```

3. **测试代理连接：**
   - 启用代理
   - 配置本地代理服务
   - 尝试连接并查看是否通过代理

## 调试技巧

### 查看日志

**渲染进程日志：**
- 按 F12 打开开发者工具
- 查看 Console 标签

**主进程日志：**
- 查看启动终端的输出
- 或使用 VS Code 调试模式

### 测试 IPC 通信

在开发者工具 Console 中执行：

```javascript
// 测试获取 API 配置
await window.electronAPI.getAPIConfig()

// 测试验证 API 配置
await window.electronAPI.validateAPIConfig()

// 测试打开设置窗口
await window.electronAPI.openSettings()

// 测试更新 API 配置
await window.electronAPI.updateAPIConfig({
  authToken: 'test-token',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5-20250929',
  useProxy: false,
  httpsProxy: '',
  httpProxy: ''
})
```

### 重置配置

如果需要重置到默认配置：

```bash
# Windows
del %APPDATA%\claude-code-desktop\config.json

# macOS/Linux
rm ~/.config/claude-code-desktop/config.json
```

然后重启应用。

## 性能测试

- [ ] 配置窗口打开速度（应 < 1 秒）
- [ ] 配置保存速度（应 < 100ms）
- [ ] 状态检查速度（应 < 500ms）
- [ ] 无内存泄漏（多次打开/关闭配置窗口）

## 兼容性测试

- [ ] Windows 10/11
- [ ] macOS
- [ ] Linux

## 报告问题

如果发现问题，请记录：
1. 操作步骤
2. 预期结果
3. 实际结果
4. 错误日志（Console 和主进程）
5. 配置文件内容
6. 操作系统版本

---

**测试完成后：**
- ✅ 所有功能正常
- ✅ 无错误日志
- ✅ 配置正确保存
- ✅ UI 显示正常
- ✅ 准备进入下一阶段开发（API 模式聊天界面）
