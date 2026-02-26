# 更新日志

---

## v1.6.60 - 2026-02-26

### 文档 (Docs)

- **钉钉命令层使用指南**：用户文档新增钉钉命令层章节，说明 `/help`、`/new`、`/close`、`/resume`、`/rename`、`/status`、`/sessions` 等命令的用法

---

## v1.6.59 - 2026-02-25

### 修复 (Fix)

- **Agent 模式模型显示**：切换模型时右侧立即更新显示，有映射用映射名，无映射用 tier 名占位，不再等 SDK 响应
- **Agent 模式模型显示初始化**：启动时 `initDefaultModel` 同步初始化右侧 activeModel，不再空白
- **第三方模型切换重置**：SDK 返回第三方模型名（如 glm-5）时不再强制将下拉菜单重置为 Sonnet
- **Agent 模式默认模型升级**：`LATEST_MODEL_ALIASES.sonnet` 更新为 `claude-sonnet-4-6`，`agent-session-manager` 通过别名解析传给 SDK，不再依赖 CLI 内置别名（CLI 内置别名仍指向 4-5）

---

## v1.6.58 - 2026-02-25

### 修复 (Fix)

- **第三方 API 兼容性**：`testAPIConnection` 改用 `modelMapping` 中的模型 ID，不再硬编码 `claude-sonnet-4-5-20250929`，修复 ModelScope 等第三方 API 连接测试失败问题
- **慢速/非流式 API 响应不渲染**：新增 `streamTextReceived` 标记区分流式与非流式场景，非流式 API（如 ModelScope GLM-5）的完整响应现可实时渲染，无需关闭重开 tab
- **钉钉重连稳定性**：`socket.on('close')` 改为 `socket.once`，防止重复监听器导致 watchdog 多次触发
- **流式标记重置遗漏**：`handleError` 和 `handleStatusChange` 补充重置 `streamTextReceived`，防止快速 API 中途报错后下一轮文本不渲染
- **进程异常退出兜底**：`uncaughtException` 加 `process.exit(1)` 延迟强退，确保僵尸进程被清理

---

## v1.6.57 - 2026-02-21

### 新功能 (Features)

- **桌面介入截图同步**：CC 桌面用户粘贴截图发给 Agent 时，图片自动同步转发到钉钉，与文字介入块一起呈现
- **群聊图片发到群**：Agent 读取的磁盘图片及桌面介入截图，群聊场景下通过 `groupMessages/send` 接口发到群内（之前只私发给最后发消息的成员）

---

## v1.6.56 - 2026-02-21

### 新功能 (Features)

- **CC 桌面介入同步到钉钉**：CC 桌面用户在钉钉会话中发消息，完整 Q&A 块（含 tool_use 图片）自动同步到钉钉，格式为 `💻 桌面端介入：> 问题\n\n回答`
- **流式冲突友好提示**：钉钉用户在 CC 桌面处理中发消息，回复"⏳ 正在处理中，请稍候再试"而非报错

### 修复 (Fix)

- 修复 `_sessionWebhooks` 生命周期问题：CC 桌面关闭会话后旧 webhook 未清除，导致重新打开该会话时 CC 桌面消息被误发到钉钉
- 修复选择历史会话后未补发 `dingtalk:messageReceived`，导致 CC 端不显示用户问题气泡、只显示 AI 回复
- 修复待选择期间发送的非数字消息全部丢弃：现改为保留最后一条，选择完毕后发送最新消息

---

## v1.6.55 - 2026-02-21

### 新功能 (Features)

- **钉钉会话隔离**：同一机器人在不同群/单聊发起独立 Agent 会话，不再混用
- **钉钉历史会话选择菜单**：CC 桌面关闭会话后，钉钉用户发消息可选择继续历史会话或新建（回复 0 新建，回复 1~N 选历史）

### 修复 (Fix)

- 修复 CC 桌面关闭会话后，钉钉消息静默恢复旧会话而非触发选择菜单
- 修复钉钉恢复会话时 CC 端不渲染历史消息（`getMessages` 改为 DB 优先，解决微任务时序竞争）
- 修复选择菜单"开始新会话"选项因钉钉 Markdown 将 `0.` 续编为 `3.`，导致用户输入 0 无效、死循环重发菜单
- 修复选择历史会话时重复创建新会话的 bug（改用 `reopen()` 代替 `get()`）
- 修复 macOS 目录选择窗口消失问题（`dialog:selectFolder` 使用发起方窗口作为父级）
- 修复 `_handlePendingChoice` 缺少 null 守卫（并发或 TTL 刚到期时防崩溃）

### 调整 (Chore)

- 右侧面板默认宽度从 20% 调整为 25%

---

## v1.6.54 - 2026-02-21

### 新功能 (Features)

- **钉钉机器人桥接**：通过 Stream 模式连接钉钉，在手机端直接与 Agent 对话
- **钉钉图片识别**：钉钉发送的图片自动识别并传给 Agent 处理
- **钉钉图片转发**：Agent 工具读取的本地图片自动上传并发送到钉钉（混合发送：文本走 Webhook，图片走 API 接口）
- **钉钉即时回复**：流式文本分段即时发送，保活机制防止 Webhook 超时
- **钉钉设置页面**：独立配置窗口，含使用指南链接

### 修复 (Fix)

- 修复 MSYS 路径格式 `/c/...` 导致图片转发失败
- 修复 Windows 正斜杠路径 `C:/...` 未被图片路径正则匹配
- 修复钉钉消息重复投递导致重复处理
- 修复发送者标识颜色不可见

### 文档 (Docs)

- 新增钉钉机器人使用指南（`docs/user-guide/DINGTALK-GUIDE.zh.md`）
- 用户文档独立到 `docs/user-guide/` 子目录
- 同步 CLAUDE.md 文件结构、数据流、文档索引

---

## v1.6.53 - 2026-02-19

### 文档 (Docs)

- 精简 CLAUDE.md（865→332 行，-62%），移除重复/过时内容，同步代码文件索引
- 清理 12 个过时文档文件（-4596 行）
- README 添加 macOS Gatekeeper 安全提示

---

## v1.6.52 - 2026-02-19

### 文档 (Docs)

- 重组 README 结构，明确章节层次和安装步骤
- 补充本地构建命令说明

---

## v1.6.51 - 2026-02-19

### 修复 (Fix)

- **Windows 增量更新**：构建产物补充 `.blockmap` 文件上传，使 electron-updater 支持差分更新而非全量下载

---

## v1.6.50 - 2026-02-19

### 修复 (Fix)

- **插件安装错误提示精确化**：拆分 `not found` / `enoent` 错误分类，区分"市场未注册"和"插件不存在"两种场景，给出针对性提示
- **插件市场自动注册**：能力清单新增 `marketplace` 字段，plugin 安装失败时自动注册市场后重试，用户无需手动操作
- **模式切换面板自动刷新**：从 Agent 模式切回开发者模式时，Plugins/Skills/Agents 面板自动刷新列表
- **移除市场刷新插件列表**：开发者模式移除市场后，插件面板自动刷新

---

## v1.6.49 - 2026-02-18

### 重构 (Refactor)

- 将 `fetchRegistryIndex` 从 `skillsManager` 提取为 `http-client.js` 共享工具函数
  - Skills / Agents / Prompts 市场及 CapabilityManager 统一通过 `http-client.js` 获取注册表索引
  - 消除跨模块语义误用（能力管理器/插件 IPC handler 不再依赖 skillsManager 获取 agent 索引）
  - 新版函数兼容 skills-only、agents-only、prompts-only 注册表，三个数组均默认为 `[]`

---

## v1.6.48 - 2026-02-18

### 修复 (Bug Fixes)

**更新功能修复**
- 修复"退出并安装"在重启后失效的问题
  - 原因：electron-updater 内部状态不跨重启，持久化恢复的 `isDownloaded` 与 `autoUpdater` 内存状态不同步
  - 修复：检测到持久化下载文件后，静默调用 `downloadUpdate()` 同步 electron-updater 内部状态，文件已存在时秒完成
- 修复 `quitAndInstall()` 失败时静默无反应，新增 `update-need-redownload` 事件通知前端重新下载

**本地打包脚本修复**
- 修复 `local-package-win.ps1` 读取 `package.json` 中文乱码（添加 `-Encoding UTF8`）
- 修复 `local-package-win.ps1` 误打包旧版本 exe（改为按版本号匹配，兜底取最新文件）
- 修复 `local-package-mac.sh` 误打包旧版本 dmg（改为按版本号匹配）
- 修复 `install.ps1` 在中文 Windows 上语法解析失败（添加 UTF-8 BOM）

---

## v1.6.47 - 2026-02-18

### 修复 (Bug Fixes)

**更新模块逻辑漏洞修复**
- 修复下载完成状态跨重启丢失问题
  - 旧方案：通过硬编码路径猜测缓存文件（`cc-desktop-updater`），实际路径含空格（`CC Desktop-updater`）导致判断失效
  - 新方案：持久化状态文件 `userData/update-state.json`，存储 `update-downloaded` 事件返回的精确路径
- 修复 macOS 手动安装 shell 注入风险
  - 版本号用正则 `/^\d+\.\d+\.\d+$/` 校验
  - ZIP 路径通过环境变量 `CC_DESKTOP_ZIP_FILE` 传入脚本，不做字符串插值
- 添加下载防重入保护（`isDownloading` 标志位）
- 修复 `App.vue` 中 `useMessage()` 死代码（App.vue 本身是 NMessageProvider，内部调用永远返回 null）
- 修复 `formatDate` 对无效日期的处理（添加 `isNaN` 检查）

**构建流程修复**
- 修复 GitHub Release 中 `cc-desktop-*-macos.tar.gz` 缺失问题（glob 模式匹配修正）
- 修复 `windows.zip` 被重复上传导致 404 错误（移除重复的 glob 模式）
- 安装包文件名去掉 `v` 前缀，与 electron-builder 命名风格统一
  - `cc-desktop-{version}-windows.zip`（不带 v）
  - `cc-desktop-{version}-macos.tar.gz`（不带 v）
- electron-builder 添加 `--publish never`，统一由 release job 发布，避免重复 Release

### 新增 (Features)

**本地打包脚本**
- 新增 `scripts/local-package-mac.sh`：macOS 本地打包，仅生成 DMG + tar.gz，不生成自动更新相关文件
- 新增 `scripts/local-package-win.ps1`：Windows 本地打包，仅生成 EXE + windows.zip
- 新增 npm 脚本 `build:mac:local` 和 `build:win:local`，一条命令完成编译 + 打包

**文档**
- 新增 `docs/BUILD.md`：记录 CI 和本地打包的文件目标、命名规则、命令说明
- 新增 `README_EN.md`：完整英文版 README，支持中英文切换（顶部导航链接互通）

### 重构 (Refactor)

**macOS 安装脚本**
- 解压目录改用 `mktemp -d` 临时目录，避免路径冲突
- APP 名称动态从解压结果获取，不硬编码

**删除**
- 删除 `scripts/create-release.sh`（旧打包脚本，硬编码文件名含空格，被 local-package-* 脚本替代）

---

## v1.6.42 - 2026-02-16

### 修复 (Bug Fixes)

**GitHub Actions 构建修复**
- 修复 electron-builder 不生成 `latest-mac.yml` 的问题
  - 移除 `--publish never` 参数（阻止生成更新元数据）
  - 添加 `latest.yml` 和 `latest-mac.yml` 到 artifacts 上传列表
  - 添加 `.blockmap` 文件上传（增量更新支持）
  - 确保 GitHub Release 包含所有更新检测必需的文件

**文档优化**
- README 移除固定版本号，使用 `/releases/latest` 自动跳转
- 避免每次版本升级都需要手动修改文档

### 技术说明

**更新检测流程**：
```
应用启动 → 5 秒后检查更新 → 请求 GitHub API
→ 下载 latest-mac.yml → 解析版本号和下载 URL
→ 如果有新版本 → 显示更新弹窗
```

**关键文件**：
- `latest-mac.yml`: macOS 更新元数据（必需）
- `latest.yml`: Windows 更新元数据（必需）
- `*.blockmap`: 增量更新文件（可选）

---

## v1.6.41 - 2026-02-16

### 新增功能 (Features)

**应用自动更新 (Phase 1 - MVP)**
- 基于 electron-updater，支持从 GitHub Releases 自动检查和下载更新
- 启动 5 秒后自动检查更新（静默，不打扰用户）
- 发现新版本时显示 Toast 通知 + 更新弹窗
- 显示版本信息、发布日期、更新日志
- 实时下载进度条（百分比 + 速度）
- 下载完成后一键"退出并安装"
- 打包后自动工作，开发模式下自动跳过

**核心实现**：
- `UpdateManager` 类 - 更新管理器（electron-updater 封装）
- `UpdateModal.vue` - 更新弹窗 UI 组件
- IPC 通道：`update:check`, `update:download`, `update:quitAndInstall`
- 事件监听：checking, available, progress, downloaded, error
- 国际化支持（中英文）

### 修复 (Bug Fixes)

**关键修复：页面空白问题**
- 修复 `useMessage()` 在 setup 阶段调用导致的页面崩溃
  - **根因**：setup 执行时 `n-message-provider` 尚未渲染
  - **修复**：延迟到 onMounted 中动态获取 message API
- 修复 UpdateModal 组件缺少 Naive UI 组件导入
  - 添加 `NModal`, `NButton`, `NProgress`, `NSpace` 导入
- 所有 message 调用添加存在性检查（防御性编程）

**Agent 模式优化**
- Agent 模式工具调用卡片现在显示命令摘要（不需要展开就能看到执行内容）
- 删除 Agent 会话时自动关闭对应的 Tab 页

**API 配置优化**
- 增加 API 测试连接超时从 10s 到 30s（适应国内网络）
- 修复 `https-proxy-agent@7.x` 导入问题（named export）

### 配置变更

**package.json**
- 版本升级：1.6.40 → 1.6.41
- 新增依赖：`electron-updater@6.7.3`, `electron-log@5.4.3`
- 新增 publish 配置（GitHub Releases）

### 文档

**新增待办事项**
- 记录能力清单市场依赖问题（marketplace 本地不存在时无法下载）

---

## v1.6.40 - 2026-02-16

### 修复 (Bug Fixes)

**打包后环境变量与 Agent 模式启动问题（P0 级核心修复）**
- 修复打包后 Agent 模式 "Claude Code process exited with code 1" 错误
  - **根因**：SDK 计算 cli.js 路径为 `/app.asar/...`，但文件已被 unpacked 到 `/app.asar.unpacked/`
  - **修复**：`agent-session-manager.js` 的 `spawnClaudeCodeProcess` 回调中添加 asar 路径重定向
  - **兼容性**：Windows 路径分隔符兼容（`/[\/\\]app\.asar[\/\\]/` 正则）
- 修复插件下载 "spawn claude ENOENT" 错误
  - **根因**：`plugin-cli.js` 未传递增强的环境变量给 `execFile()`
  - **修复**：使用新提取的 `buildBasicEnv()` 函数获取 PATH 增强
- 修复 Terminal 模式打包后 PATH 被覆盖问题
  - **根因**：`terminal-manager.js` 在 extraVars 中显式设置 `PATH: process.env.PATH`，覆盖了 `buildProcessEnv()` 的增强
  - **修复**：移除 extraVars 中的 PATH 设置，完全交给 `buildProcessEnv()` 处理
- 修复 PATH 去重逻辑不精确问题
  - **根因**：使用 `existingPath.includes(p)` 会匹配到子字符串（如 `/usr/local/bin-test`）
  - **修复**：改用 `split(pathSep)` 分割后精确匹配
- 添加打包模式检测和调试日志
  - 新增 `isPackagedApp()` 函数检测 app.asar 环境
  - 打包模式下输出 PATH 增强日志，便于调试

**Agent 模式错误诊断改进**
- 捕获并记录 CLI 进程 stderr 完整输出
- 新增 IPC 事件 `agent:cliError` 传递 stderr 到前端（用于未来调试 UI）
- 非零退出码时自动输出 stderr 到主进程日志

**package.json 配置**
- 添加 `@anthropic-ai/claude-agent-sdk` 到 `asarUnpack` 列表
  - 确保 cli.js 和 shebang 脚本在打包后可执行

### 重构 (Refactor)

**环境变量构建逻辑统一化**
- 提取 `buildBasicEnv(extraVars)` 函数（`utils/env-builder.js`）
  - 用途：仅增强 PATH，不包含 API 配置（插件 CLI 命令场景）
  - 清除潜在冲突的认证变量（`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`）
- 提取 `buildStandardExtraVars(configManager)` 函数（`utils/env-builder.js`）
  - 统一 TERM、SHELL、CLAUDE_AUTOCOMPACT_PCT_OVERRIDE 逻辑
  - 消除 `agent-session-manager.js` 和 `active-session-manager.js` 中的重复代码
- 重构 `buildProcessEnv(profile, extraVars)` 函数
  - 底层调用 `buildBasicEnv()` 获取基础环境（PATH 增强）
  - 叠加 Claude API 配置（`buildClaudeEnvVars()`）
  - 叠加额外变量（TERM、SHELL 等）
  - 最终清理空值

**模块职责清晰化**
- `buildBasicEnv()` → 基础 PATH 增强（无 API 配置）
- `buildClaudeEnvVars()` → API 认证环境变量
- `buildStandardExtraVars()` → 标准子进程附加变量（TERM/SHELL/AUTOCOMPACT）
- `buildProcessEnv()` → 完整子进程环境（基础 + API + 附加）

### 技术细节 (Technical Details)

**修改文件清单**：
- `package.json` - asarUnpack 配置
- `src/main/utils/env-builder.js` - 核心重构（4 个导出函数）
- `src/main/agent-session-manager.js` - asar 路径重定向 + stderr 捕获 + extraVars 简化
- `src/main/active-session-manager.js` - 使用 `buildStandardExtraVars()`
- `src/main/terminal-manager.js` - 移除 PATH 覆盖
- `src/main/managers/plugin-cli.js` - 使用 `buildBasicEnv()`

**Windows 兼容性增强**：
- asar 路径正则支持反斜杠：`/[\/\\]app\.asar[\/\\]/`
- PATH 分隔符检测：`process.platform === 'win32' ? ';' : ':'`
- 路径分隔符通用处理：`path.join()` 自动适配

**调试能力提升**：
- 打包模式自动检测：`process.mainModule.filename.includes('app.asar')`
- 条件日志输出：仅打包模式输出 PATH 增强日志，避免开发模式日志污染
- stderr 完整捕获：Agent 模式 CLI 进程错误输出记录到主进程日志

**设计模式改进**：
- DRY 原则：消除 extraVars 构建逻辑重复
- 单一职责：每个函数职责明确（PATH 增强 vs API 配置 vs 附加变量）
- 防御式编程：清除空值、清除冲突变量、精确 PATH 去重

### Git 提交记录

- `69abfb9` - fix: 修复打包后环境变量问题 + 重构环境构建逻辑

---

## v1.6.39 - 2026-02-15

### 新功能 (Features)

**视频预览**
- 右侧面板支持 MP4/WebM/MOV/AVI/MKV/OGG 视频文件播放
- 通过 IPC 读取为 base64 data URL（避免 file:// CSP 限制）
- 自动播放、滚轮调节音量、双击全屏
- 视频信息栏显示分辨率、时长、文件大小
- CSP 策略添加 `media-src 'self' data:`

### 修复 (Bug Fixes)

**能力管理**
- http-client 添加 Cache-Control 头，解决 CDN 缓存导致能力清单不更新
- CapabilityModal 分类名支持多语言（categoryName 按 locale 取值）
- ChatInput ⚡ 能力列表每次打开都刷新，不再一次性缓存

**消息交互**
- MessageBubble 单行代码块中的路径/URL 可点击预览
- 路径正则排除 slash 命令（`/compact` 等不再误识别为路径）

**Agent 文件操作**
- readAbsolutePath 支持相对路径和 `~/` 路径解析
- 修复 `_resolveCwd` 调用路径（fileManager 重构遗留）

**代码质量**
- 视频 MIME 映射和大小限制常量提取到 agent-constants.js，消除 3 处重复定义
- agent-handlers 视频大小限制独立为 50MB（不被通用 10MB 拦截）

---

## v1.6.38 - 2026-02-14

### 重构 (Refactor)

**Agent 会话管理器模块化重构**
- **三阶段渐进式拆分**：将 `agent-session-manager.js` 从 1651 行减少到 1274 行（-377 行，-22.8%）
  - Phase 1: 提取常量模块 `utils/agent-constants.js` (102 行)
  - Phase 2: 提取文件操作模块 `managers/agent-file-manager.js` (355 行)
  - Phase 3: 提取 Query 控制模块 `managers/agent-query-manager.js` (105 行)
- **设计模式**：依赖注入 + 委托模式，保持公共 API 稳定
- **架构优势**：
  - ✅ 职责单一，边界清晰
  - ✅ 独立模块易于单元测试
  - ✅ 便于未来功能扩展

### 修复 (Bug Fixes)

**Agent 文件操作错误处理**
- **修复同名文件创建误报成功问题**：后端返回 `{ error }` 但前端未检查，导致显示"创建成功"
- **国际化错误消息**：添加 3 个 i18n 翻译 key
  - `agent.files.fileAlreadyExists` - 文件或文件夹已存在
  - `agent.files.targetNameExists` - 目标名称已存在
  - `agent.files.fileNotFound` - 文件或文件夹不存在
- **统一错误显示**：使用 `mapErrorMessage()` 映射后端英文错误到本地化文本
- **影响范围**：创建文件、创建文件夹、重命名、删除

### 文档 (Documentation)

**CLAUDE.md 完善**
- 更新架构图：添加 3 个新模块说明
- 新增实战案例章节：完整记录 agent-session-manager 重构过程
  - 三阶段拆分表格
  - 新增模块架构说明
  - 核心设计模式示例
  - 重构收益与关键经验
- 更新合理设计示例：使用实际重构方案和行数

### Git 提交记录

- `0cf2ff6` - refactor: 提取常量模块 — Phase 1
- `8f94b95` - refactor: 提取文件操作模块 — Phase 2
- `3e94d3f` - refactor: 提取 Query 控制模块 — Phase 3
- `22885ff` - fix: Agent 文件操作错误处理
- `e303305` - i18n: 文件操作错误消息国际化
- `f77dc17` - docs: 更新 CLAUDE.md

---

## v1.6.37 - 2026-02-14

### 新增 (Features)

**Agent 模式右侧面板增强（webview 预览方案）**
- **可拖动调整面板宽度**：主内容区域和右侧面板之间添加拖动分隔条
  - 默认比例 2:1（聊天 66.7%，面板 33.3%）
  - 拖动范围限制：20% ~ 50%
  - 宽度配置持久化（保存到 `config.json` 的 `ui.rightPanelWidth`）
  - 鼠标悬停分隔条高亮提示
  - Developer 模式和 Agent 模式共用配置

- **图片预览增强**：
  - 工具栏：放大、缩小、重置缩放、下载
  - 鼠标滚轮缩放支持（步长 0.1，范围 0.25x ~ 5x）
  - 图片信息显示（宽 × 高，文件大小）
  - 图标优化：缩小按钮使用 `-` 图标（语义更准确）

- **HTML 文件预览**：
  - 检测 `.html` / `.htm` 文件并用 iframe 渲染
  - 安全沙箱（sandbox="allow-scripts allow-same-origin"）
  - 刷新按钮支持重新加载

- **聊天消息图片点击预览**：
  - 点击聊天区域的图片 → 右侧面板预览
  - 自动展开右侧面板（如果折叠）
  - 支持缩放、下载等所有图片预览功能

- **超链接点击预览（webview 方案）**：
  - **单击预览 · 双击打开**交互模式
  - URL 链接（http/https）→ **webview 预览网页**（✅ 支持所有网站）
  - 文件路径链接（本地路径）→ 读取并预览文件
  - 支持路径类型：Windows 路径、Unix 路径、相对路径、~ 路径
  - 提示文本：`单击预览 · 双击打开`
  - **技术升级**：使用 Electron webview 标签，绕过 X-Frame-Options 限制

- **预览功能优化**：
  - ESC 键快速关闭预览
  - 加载状态优化（50ms 延迟提供视觉反馈）
  - 预览切换时自动重置缩放状态

### 技术细节 (Technical Details)

**webview 安全配置**：
- 主进程启用 `webviewTag: true`
- webview 安全参数：
  - `nodeintegration="false"` - 禁用 Node.js API
  - `partition="persist:webview-preview"` - 独立会话隔离
  - `disablewebsecurity="false"` - 保持安全策略
  - `allowpopups="false"` - 禁止弹窗
- 优势：可以预览所有网站（百度、Google、GitHub 等）
- 风险控制：进程隔离 + 沙箱配置，安全性等同于 Chrome 浏览器

**事件传递链路**：
```
MessageBubble (@click / @preview-image / @preview-link / @preview-path)
  ↓ emit
AgentChatTab
  ↓ emit
MainContent (handlePreviewImage / handlePreviewLink / handlePreviewPath)
  ↓ 调用方法
AgentRightPanel.previewImage()
  ↓
FilePreview 显示
```

**配置持久化**：
- 右侧面板宽度保存到 `config.json` → `ui.rightPanelWidth`
- 应用启动时自动加载上次保存的宽度

**修改文件**：
- `src/main/index.js` - 启用 webviewTag
- `MainContent.vue` - 添加拖动分隔条 + 事件处理
- `AgentRightPanel/index.vue` - 动态宽度 + previewImage 方法
- `RightPanel/index.vue` - 移除固定宽度
- `FilePreview.vue` - 图片工具栏 + HTML iframe + **webview 预览** + ESC 键监听
- `MessageBubble.vue` - 图片/链接点击事件
- `AgentChatTab.vue` - 事件传递
- `agent-session-manager.js` - HTML 文件类型检测
- `zh-CN.js` / `en-US.js` - 新增 5 个翻译键

### 重要说明 (Important Notes)

**webview 使用说明**：
- webview 是 Electron 特有的标签，用于嵌入外部网页
- 优点：可以预览任何网站，不受 X-Frame-Options 限制
- 安全性：通过正确的沙箱配置，安全性等同于浏览器
- 注意事项：Electron 官方标记为 "legacy"，长期可能需要迁移到 BrowserView
- 当前决策：功能性优先，未来 2-3 年内如需迁移会提供升级方案

---

## v1.6.36 - 2026-02-14

### 新增 (Features)

**Agent 模式图片识别功能**
- 支持多模态消息，可发送图片给 AI 分析（基于 Claude API Vision）
- 三种输入方式：截屏粘贴（Ctrl+V / Cmd+V）、复制粘贴、文件上传
- 三种消息类型：纯文字、纯图片、图片+文字混合
- 图片预览：输入框显示 80x80 缩略图，可删除
- 消息气泡显示：聊天区域显示 200x200 图片缩略图
- 多图支持：最多 4 张图片/消息
- 大小检测：5MB 限制，超过显示警告
- 格式支持：PNG、JPEG、GIF、WebP
- 队列限制：流式输出时发送图片会提示等待（设计决策）

**新增文件**：
- `src/renderer/utils/image-utils.js` - 图片处理工具（7 个函数）
- `docs/IMAGE-RECOGNITION-FEATURE.md` - 功能实现文档

**修改文件**：
- `src/renderer/pages/main/components/agent/ChatInput.vue` - 输入和预览 UI
- `src/renderer/pages/main/components/agent/MessageBubble.vue` - 消息气泡显示图片
- `src/renderer/composables/useAgentChat.js` - 支持多种消息格式
- `src/main/agent-session-manager.js` - 后端多模态支持
- `src/renderer/locales/zh-CN.js` / `en-US.js` - 新增 5 个翻译键
- `src/renderer/components/icons/index.js` - 新增 image 图标

### 技术细节 (Technical Details)

**消息格式兼容**：
- 纯文本消息：保持字符串格式（向后兼容）
- 带图片消息：对象格式 `{ text, images: [{ base64, mediaType, ... }] }`
- `useAgentChat.js` 自动检测类型并处理

**问题修复**：
- 修复消息格式兼容性问题（字符串 vs 对象）
- 修复 `text.trim()` 类型错误
- 修复纯图片消息验证逻辑
- 实现图片在消息气泡中的显示

**Claude API Vision 集成**：
```javascript
content: [
  { type: 'text', text: '这是什么图片？' },
  {
    type: 'image',
    source: {
      type: 'base64',
      media_type: 'image/png',
      data: 'iVBORw0KGgo...'
    }
  }
]
```

### 文档 (Documentation)

- 新增 `docs/IMAGE-RECOGNITION-FEATURE.md` - 完整实现文档
- 更新 `CLAUDE.md` - 添加图片识别功能说明
- 更新文件结构索引

---

## v1.6.35 - 2026-02-14

### 修复 (Bug Fixes)

**代码回退与数据保护**
- 回退失败的应用重命名修改（HydroCoder Desktop → CC Desktop）
- 回退数据迁移逻辑，避免数据丢失风险
- 移除 `page-title.js` 工具文件和相关导入
- 修复子页面 `main.js` 中被破坏的 import 语法

### 改进 (Improvements)

**i18n 优化保留**
- 保留"智能体模式"中文翻译（`agentMode: '智能体模式'`）
- 保留 Agent 模式欢迎界面改进（使用指南、"恢复"历史对话）
- 保留开发者模式欢迎界面标题优化
- 保留 i18n 键冲突修复（`main.developerWelcome` 独立于 `main.welcome`）

### 文档 (Documentation)

- 更新 CLAUDE.md：配置文件路径更正为 `cc-desktop` 目录
- 更新版本号至 v1.6.35
- 数据目录明确保持在 `%APPDATA%/cc-desktop/` 不变

### 重要说明

- **数据目录**：`cc-desktop`（不再迁移）
- **显示名称**：CC Desktop
- **保留改进**：智能体模式翻译、欢迎界面优化等 i18n 改进

---

## v1.6.34 - 2026-02-13

### 新增 (Features)

**Agent 模式消息队列持久化**
- 消息队列自动保存到数据库，关闭应用后队列不丢失
- 重新打开对话时自动恢复未发送的队列消息
- 防抖机制（300ms）避免高频写入数据库
- 支持队列开关的全局配置（`settings.agent.messageQueue`）
- 新增数据库字段：`agent_conversations.queued_messages`
- 新增 IPC 接口：`agent:saveQueue` / `agent:getQueue`
- Vue Proxy 兼容处理（深拷贝避免序列化错误）

### 改进 (Improvements)

- 队列自动消费：流式输出结束后自动发送下一条排队消息
- 队列开关切换时智能消费：从禁用切换到启用时自动处理积压消息
- 窗口焦点事件防抖优化（500ms）：减少频繁切换窗口时的配置读取

---

## v1.6.31 - 2026-02-11

### 新增 (Features)

**跨模式会话占用控制**
- Agent 模式与 Terminal 模式互斥同一 CLI 会话，防止并发写入导致数据丢失
- Peer Manager 模式：`ActiveSessionManager` 与 `AgentSessionManager` 互相持有引用
- 通过 `isCliSessionActive(cliSessionUuid)` 方法检查对端是否正在使用该会话
- Terminal 模式恢复会话前检查 Agent 模式占用状态
- Agent 模式发送消息前检查 Terminal 模式占用状态
- 前端友好错误提示：`SESSION_IN_USE_BY_AGENT` / `SESSION_IN_USE_BY_TERMINAL`

### 改进 (Improvements)

- 恢复会话提示优化：增加"首条消息响应需要耐心等待"提示文案

---

## v1.6.3 - 2026-02-11

### 修复 (Bug Fixes)

**终端环境变量处理优化**
- 修复 terminal-manager.js 环境变量注入问题
- 使用统一的 `buildProcessEnv` 函数，避免环境变量污染
- 解决 `undefined` 被传递为字符串的 bug

**配置系统清理**
- 自动迁移并删除废弃的 API 配置字段
- 新安装不产生废弃字段，配置文件更简洁
- 迁移后自动清理 `settings.api`、`settings.anthropicApiKey` 等旧字段

### 文档 (Documentation)

- 更新 QUICKSTART.md：API Key 配置说明改为 API Profiles
- 更新 ARCHITECTURE.md：配置示例使用新结构
- 更新 MIGRATION.md：迁移脚本和说明更新

### 破坏性变更 (Breaking Changes)

- **不支持降级到 v1.5.x**：API 配置结构已变更
- 旧版本 `settings.anthropicApiKey` 等字段在迁移后会被自动删除

---

## v1.4.0 - 2026-01-25

### Agents 管理模块完成

**Agents 特性**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制、重命名
- 导入/导出功能
- 点击发送到终端

**插件管理增强**
- 插件子组件编辑功能
- Commands 编辑支持
- 移除插件卸载功能，统一模态框属性名

**技术优化**
- 引入 js-yaml 优化 YAML 解析
- 终端 WebGL 渲染（Canvas/DOM 降级）
- IME 输入法定位修复

---

## v1.3.0 - 2026-01-24

### Skills / Hooks / MCP 三大模块完整管理

**统一架构**
- 三级分类：项目级、全局级、插件级（只读）
- CRUD：新建、编辑、删除、复制
- 点击发送命令到终端

**Skills 特性**
- 原始内容编辑（YAML frontmatter + Markdown）
- 导入/导出：冲突检测、ZIP/文件夹格式

**Hooks 特性**
- 表单/JSON 双模式编辑
- 打开配置文件功能

**MCP 特性**
- 四级 scope: User/Local/Project/Plugin
- JSON 编辑器带格式化

---

## v1.2.x - 2026-01-22~23

- Hooks 标签页 - 可视化编辑
- Plugin 管理 - 启用/禁用/卸载
- AI 助手增强 - 多格式 API、手动压缩
- Agents 标签页
- 中英文切换

---

## v1.1.x - 2026-01-15~21

- 会话历史管理 - SQLite + FTS5
- 活动会话管理 - 标题、限流
- 快捷命令
- 外观设置独立页面
- GitHub Actions CI/CD

---

## v1.0.x - 2026-01-12~14

**首次发布**
- 独立架构（不依赖 cc-web-terminal）
- 项目管理 + 终端集成
- Vue 3 + Naive UI + Electron
