# CC Desktop 一键安装测试指南

## 测试环境准备

安装脚本会：
1. 检测 Claude Code CLI 是否已安装
2. 如果未安装，自动调用官方安装脚本
3. 查找 DMG 文件并自动安装到 /Applications

## 测试方法

### 方法 1：测试完整流程（模拟 Claude CLI 未安装）

```bash
# 1. 临时隐藏 claude 命令（模拟未安装）
export PATH=$(echo $PATH | tr ':' '\n' | grep -v '.claude' | tr '\n' ':')

# 2. 进入 scripts 目录
cd scripts

# 3. 运行安装脚本
bash install.sh

# 4. 恢复 PATH（关闭终端重新打开即可）
```

**预期行为**：
- ✅ 检测到 Claude CLI 未安装
- ✅ 自动下载并安装 Claude CLI
- ✅ 检测到 DMG 文件
- ✅ 自动挂载 DMG 并安装 CC Desktop 到 /Applications

### 方法 2：测试已安装 Claude CLI 的情况

```bash
# 1. 确保 claude 命令可用
claude --version

# 2. 进入 scripts 目录
cd scripts

# 3. 运行安装脚本
bash install.sh
```

**预期行为**：
- ✅ 检测到 Claude CLI 已安装，显示版本号
- ✅ 跳过 Claude CLI 安装步骤
- ✅ 检测到 DMG 文件
- ✅ 自动挂载 DMG 并安装 CC Desktop 到 /Applications

### 方法 3：测试 DMG 不在 scripts/ 目录的情况

```bash
# 1. 将 DMG 移动到项目根目录
mv scripts/*.dmg .

# 2. 进入 scripts 目录
cd scripts

# 3. 运行安装脚本
bash install.sh
```

**预期行为**：
- ✅ 脚本会在父目录（项目根目录）找到 DMG
- ✅ 正常安装

## 完整测试流程示例

```bash
# 进入项目目录
cd /Users/mac/Documents/zys/develop/cc-desktop

# 确保 DMG 在 scripts 目录
ls -lh scripts/*.dmg

# 运行安装脚本
bash scripts/install.sh
```

## 预期输出示例

```
>> Detecting Claude Code CLI...
   [OK] Claude CLI found: 2.1.20 (Claude Code)

>> Looking for CC Desktop installer (platform: macos)...
   [OK] Found: CC Desktop-1.6.39-darwin-arm64.dmg

>> Installing CC Desktop to /Applications...
   [OK] Installed to /Applications/CC Desktop.app

Done.
```

## 验证安装成功

```bash
# 检查应用是否在 /Applications
ls -la "/Applications/CC Desktop.app"

# 启动应用
open "/Applications/CC Desktop.app"
```

## 清理测试环境（可选）

```bash
# 卸载 CC Desktop
rm -rf "/Applications/CC Desktop.app"

# 删除配置文件
rm -rf ~/Library/Application\ Support/cc-desktop
rm -rf ~/.config/cc-desktop
```

## 注意事项

1. **权限问题**：脚本需要写入 /Applications 权限，可能需要管理员密码
2. **覆盖安装**：如果 /Applications 已有旧版本，脚本会先删除再安装
3. **DMG 位置**：脚本会在 `scripts/` 和项目根目录查找 DMG
4. **Claude CLI 安装**：如果需要安装 Claude CLI，会调用官方安装脚本（需要网络）

## 故障排除

### DMG 未找到
```
[!] No CC Desktop .dmg found in the current directory.
```
**解决**：确保 DMG 在 `scripts/` 或项目根目录

### Claude CLI 安装失败
```
[ERROR] Failed to install Claude CLI.
```
**解决**：手动安装 Claude CLI
```bash
curl -fsSL https://claude.ai/install.sh | bash
```

### 挂载 DMG 失败
```
[ERROR] Failed to mount *.dmg
```
**解决**：手动双击 DMG 安装
