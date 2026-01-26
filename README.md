# CC Desktop

Claude Code CLI 的桌面启动器 + 终端模拟器。

## Windows 安装前提

### 1. 安装 Node.js

从 [Node.js 官网](https://nodejs.org/) 下载并安装 LTS 版本。

### 2. 安装 Git Bash

从 [Git 官网](https://git-scm.com/download/windows) 下载并安装。

安装后将 Git Bash 目录添加到系统 PATH 环境变量（通常是 `C:\Program Files\Git\bin`）。Claude Code 需要用它执行后台文件操作。

### 3. 安装 Claude Code CLI

```powershell
npm install -g @anthropic-ai/claude-code
```

**注意**：首次在 Windows 上运行 PowerShell 脚本可能遇到执行策略限制。如果报错，以管理员身份运行：

```powershell
Set-ExecutionPolicy RemoteSigned
```

### 4. 验证安装

```powershell
claude --version
```

## 下载源码

```bash
git clone https://github.com/hydroCoderClaud/cc-desktop.git
cd cc-desktop
```

## 安装依赖

```bash
npm install
```

## 运行

### 开发模式

```bash
npm run dev
```

### 打包

```bash
# Windows
npm run build:win

# macOS
npm run build:mac

# Linux
npm run build:linux
```

## 许可证

MIT License
