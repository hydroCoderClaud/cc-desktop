# 快速入门指南

## 5分钟上手 Claude Code Desktop

### 步骤 1：安装依赖

```bash
cd C:\workspace\develop\HydroCoder\cc-desktop
npm install
```

### 步骤 2：启动开发模式

```bash
npm run dev
```

应用窗口会自动打开，并显示 Claude Code Desktop 界面。

### 步骤 3：添加第一个项目

1. 点击左上角的 **"+ New session"** 按钮
2. 在文件选择对话框中，选择一个项目文件夹
3. 项目会自动添加到左侧项目列表

### 步骤 4：连接到项目

1. 点击左侧项目列表中的项目（会高亮显示）
2. 点击中间区域的 **"Connect"** 按钮
3. 终端会自动打开并切换到该项目目录

### 步骤 5：启动 Claude Code CLI

在终端中输入：

```bash
claude code
```

现在您可以开始与 Claude Code 交互了！

---

## 常见操作

### 切换主题

点击左下角的 🌙/☀️ 图标即可在浅色和深色主题之间切换。

### 切换项目

1. 点击左侧列表中的另一个项目
2. 点击 "Connect" 按钮
3. 旧的终端进程会自动关闭，新的终端会在新项目目录打开

### 配置 API Key

1. 点击右上角的 ⚙ 图标（即将支持）
2. 在设置对话框中输入您的 Anthropic API Key
3. API Key 会自动传递给 Claude Code CLI

当前临时方案：手动编辑配置文件
- 位置：`%APPDATA%\claude-code-desktop\config.json`
- 设置：`settings.anthropicApiKey` 字段

### 移除项目

（功能即将添加）

右键点击项目 → 选择 "Remove from list"

---

## 快捷键

| 快捷键 | 功能 |
|--------|------|
| `F12` | 切换开发者工具 |
| `Ctrl + C` | 在终端中发送 SIGINT（终止进程） |
| `Ctrl + V` | 在终端中粘贴 |

---

## 故障排除

### 问题：终端无法启动

**原因**：可能是 node-pty 安装失败

**解决**：
```bash
npm install node-pty --force
npm rebuild node-pty
```

### 问题：找不到 `claude` 命令

**原因**：Claude Code CLI 未安装或不在 PATH 中

**解决**：
1. 安装 Claude Code CLI：参考官方文档
2. 确保 `claude` 命令在系统 PATH 中

### 问题：API Key 无效

**原因**：未配置或配置错误

**解决**：
编辑 `%APPDATA%\claude-code-desktop\config.json`：
```json
{
  "settings": {
    "anthropicApiKey": "sk-ant-your-key-here"
  }
}
```

---

## 下一步

- 📖 阅读 [架构文档](./ARCHITECTURE.md)
- 🔧 查看 [开发指南](./DEVELOPMENT.md)
- 🐛 报告问题：创建 GitHub Issue
