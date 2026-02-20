# 电源设置 QA：熄屏后保持程序活跃

## 问题描述

CC Desktop 在屏幕关闭后，程序停止响应（如钉钉桥接断开、WebSocket 连接中断），直到屏幕重新点亮后才恢复。这会导致后台任务中断，无法实现无人值守的自动化场景。

## 原因分析

现代 Windows 笔记本/台式机普遍启用 **Modern Standby（S0 低电量待机）**。与传统睡眠（S3）不同，Modern Standby 在屏幕关闭后会自动进入低功耗循环：

- 每隔约 1 分钟短暂唤醒（检查通知等），然后再次进入低功耗
- 进程被限制执行、网络连接被降级或断开
- `powerSaveBlocker` 等应用层 API **无法阻止** Modern Standby

### 如何确认你的系统使用 Modern Standby

以管理员身份打开终端，运行：

```cmd
powercfg /a
```

如果输出中包含 **"待机（S0 低电量待机）"**，说明你的系统使用 Modern Standby。

## 解决方案

### 第 1 步：禁用 Modern Standby（需重启）

以管理员身份打开终端，运行：

```cmd
reg add "HKLM\SYSTEM\CurrentControlSet\Control\Power" /v PlatformAoAcOverride /t REG_DWORD /d 0 /f
```

然后 **重启电脑**。

重启后验证：

```cmd
powercfg /a
```

应看到 **"待机（S0 低电量待机）"** 已从"此系统上有以下睡眠状态"移至"此系统上没有以下睡眠状态"。

> **恢复方法**：如需恢复 Modern Standby，删除该注册表值并重启：
> ```cmd
> reg delete "HKLM\SYSTEM\CurrentControlSet\Control\Power" /v PlatformAoAcOverride /f
> ```

### 第 2 步：禁用休眠计时器

禁用 Modern Standby 后，系统可能仍会在一定时间后进入 **休眠**（效果与睡眠相同，所有进程被冻结）。

打开 **控制面板 → 电源选项 → 更改计划设置 → 更改高级电源设置**：

- **睡眠 → 在此时间后休眠 → 接通电源**：设为 **0**（从不）

### 第 3 步：关闭无线网卡省电（可选）

如果使用 Wi-Fi 连接：

1. 打开 **设备管理器**
2. 展开 **网络适配器**，右键你的无线网卡 → **属性**
3. **高级** 选项卡：
   - **MIMO 节能模式** → 设为 **无 SMPS**
   - **传输电源** → 设为 **最高值**

## 最终效果

| 项目 | 状态 |
|------|------|
| 屏幕 | 按设定时间自动关闭 |
| 系统 | 保持完全运行 |
| 网络连接 | 保持活跃 |
| CC Desktop | 持续响应（钉钉桥接、Agent 会话等正常工作） |

## CC Desktop 内置保护

CC Desktop 已内置以下机制（无需用户操作）：

- **`powerSaveBlocker`**：告知系统不要挂起本进程
- **`powerMonitor.on('resume')`**：系统从睡眠恢复后，自动重连钉钉桥接
