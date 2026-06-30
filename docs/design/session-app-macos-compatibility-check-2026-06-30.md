# 会话应用 macOS 兼容性检查记录

> 日期：2026-06-30
> 范围：本轮会话应用相关实现

## 结论

本轮检查后，未发现必须立刻修复的会话应用 `macOS` 专属兼容性缺陷。

当前实现对 `macOS` 的核心链路是成立的：

- 主进程默认目录构造使用 `path.join`
- 会话启动目录在基础目录下追加随机子目录，适配 POSIX 路径
- 渲染层默认目录展示统一用 `/`，不依赖 Windows 盘符
- 文件夹选择通过统一 Electron 目录选择对话框，不依赖 Windows-only 逻辑

因此，这次没有为了“做兼容性”而强行改动主逻辑。

## 检查点

本次重点核对了以下链路：

1. `src/main/managers/im-working-directory.js`
   - 会话应用默认基础目录
2. `src/renderer/utils/im-working-directory.js`
   - 渲染层默认目录展示
3. `src/main/managers/session-app-manager.js`
   - 启动应用会话时的随机子目录拼接
4. `src/renderer/pages/settings-workbench/components/SessionAppsWorkbenchTab.vue`
   - 默认目录显示、目录选择、历史会话打开
5. `src/renderer/composables/useAgentLocalCommands.js`
   - 聊天内创建会话应用卡片时的默认目录注入

## 本次补强内容

虽然没有发现必须修的 `macOS` 逻辑 bug，但补了两类内容：

### 1. 测试补强

新增了会话应用在 POSIX/macOS 路径语义下的验证：

- 应用默认目录应落到 `/Users/.../cc-desktop-agent-output/sessionapp`
- 启动新应用会话时应生成 `/Users/.../sessionapp/conv-xxxxxxxx`

对应测试文件：

- `tests/main/session-app-manager.test.js`

### 2. 文档补强

补充了会话应用当前真实行为文档和用户指南，明确：

- 默认基础目录和运行子目录是两层语义
- 应用修改后，历史会话继续使用时会读取当前定义
- 会话应用不是复杂内嵌 App，而是会话级专用模板

## 当前剩余风险

当前更值得继续关注的不是 `macOS` 路径拼接本身，而是：

1. 若后续把更多本地文件能力接入会话应用，需要继续关注特殊字符路径
2. 若后续增加更多渲染层文件预览场景，需要继续覆盖 `#`、`?`、空格、中文文件名
3. 若后续开放更多用户可编辑内部字段，需要重新审查跨平台输入边界

## 建议

后续如果继续做会话应用增强，优先顺序建议是：

1. 保持当前路径模型不变
2. 继续以测试补强为主
3. 只有发现真实平台差异 bug 时，再做最小代码修复

这样能避免为了“兼容性表态”而引入无必要改动。
