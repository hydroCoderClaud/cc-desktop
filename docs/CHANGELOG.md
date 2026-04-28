# 更新日志

---

## v1.7.55 - 2026-04-28

### 新增 (Feat)
- 新增桌面端微信通知通道，支持在会话与定时任务中向已绑定目标主动发送消息
- 增强微信通知目标识别与发送路由，补齐授权目标展示、聊天内快捷发送和工具栏快捷入口
- 支持微信图片双向传递，并补齐会话侧的微信快捷绑定与交互入口
- 完善微信通知整体集成，补齐目标管理、会话联动与交互体验细节

### 修复 (Fix)
- 修复微信扫码登录后的目标自动捕获流程，减少首次绑定后的手动操作
- 优化微信后台轮询时延与稳定性，降低消息收发延迟
- 修复定时任务执行提示词被框架包装污染的问题，改为原样透传用户任务内容

### 文档 (Docs)
- 补充内置 MCP 能力现状文档，明确定时任务与微信通知的注入边界
- 补充微信通知相关文案与测试约束，说明 scheduled 会话不会注入定时任务 MCP
- 同步发布文档与版本说明，保持架构与索引文档版本一致

### 其他 (Chore)
- 同步 GitNexus 索引元数据与统计信息

---

## v1.7.54 - 2026-04-27

### 新增 (Feat)
- 增强桌面端定时任务能力，补齐更多本地执行场景
- 在聊天会话中注入桌面定时任务工具，支持直接编排调度任务

### 修复 (Fix)
- 修复定时任务窗口关闭后的清理逻辑，避免残留调度状态
- 解除运行时模型选择与旧映射表的耦合，减少配置串扰
- 移除旧版模型兼容兜底，避免选择结果被回退覆盖
- 修复 Hydro Desktop 品牌身份提示注入异常

### 文档 (Docs)
- 清理文档中已废弃的助手相关说明
- 同步渲染层索引文档与 GitNexus 元数据说明

### 其他 (Chore)
- 持久化已选模型配置，并移除自定义模型管理遗留结构
- 清理遗留的自定义模型配置项
- 将模型映射收敛为服务商维度，移除旧版跨层配置耦合
- 对齐定时任务的模型选择流程，统一为服务商维度映射
- 移除内置 AI 助手实现，收敛产品能力边界
- 更新架构中的模型选择流程，显式区分用户选择路径
- 清理旧版层级映射残留逻辑
- 调整 Hydro Desktop 品牌表述，统一产品身份文案

---

## v1.7.53 - 2026-04-24

### 新增 (Feat)
- 增强定时任务时间控制，支持工作日、单次执行和首次触发策略配置

---

## v1.7.52 - 2026-04-24

### 测试 (Test)
- 调整 Agent `/clear` 会话重建守卫测试，适配本地命令处理拆分后的实现结构

---

## v1.7.51 - 2026-04-24

### 新增 (Feat)
- 新增开发者模式设置，并在启动时默认恢复 Agent 工作流
- 新增定时任务管理与来源筛选能力
- 优化 Slash Command 交互流程，提升指令使用效率
- 改进定时任务创建与筛选体验
- 完善定时任务管理流程，补齐相关交互
- 优化定时任务创建入口，降低创建成本

### 修复 (Fix)
- 定时任务在聊天中创建后可立即启动执行
- 修复定时任务会话解绑异常
- 删除定时任务后保留 Agent 历史，避免上下文丢失
- 优化定时任务会话行为，减少执行过程中的状态错乱
- 本地化应用启动流程与窗口标题文案
- 本地化定时任务相关提示消息
- 简化定时任务执行语义，降低调度行为歧义

### 其他 (Chore)
- 更新 GitNexus 元数据
- 拆分左侧面板展示组件，降低界面层耦合
- 拆分 Agent 聊天输入模块，便于后续维护

---

## Unreleased

---

## v1.7.50 - 2026-04-19

### 新增 (Feat)
- 将插件管理从 Claude Code CLI 依赖中解耦，新增主进程内建插件运行时与 `PluginService` 接入层

### 测试 (Test)
- 为插件运行时补充 registry、service、source 和 state lock 回归测试

---

## v1.7.49 - 2026-04-19

### 修复 (Fix)
- 调整 Windows 安装器界面名称与快捷方式提示文案，统一为 Hydro Desktop 的用户感知品牌

---

## v1.7.48 - 2026-04-18

### 修复 (Fix)
- 修复 MCP 市场的 Windows 配置包装逻辑，避免节点命令被错误包裹

---

## v1.7.47 - 2026-04-14

### 新增 (Feat)
- 支持标准 MCP 多图工具结果的解析与展示，便于桌面端正常处理多张图片输出

### 修复 (Fix)
- 清空对话后会重新创建 Agent 会话，避免后续消息沿用已失效会话
- 统一聊天区 `file://` 链接格式，提升本地路径点击打开的兼容性

### 文档 (Docs)
- 优化发版 skill 的 tag 推送策略说明，避免误推历史遗留 tag

---

## v1.7.46 - 2026-04-13

### 修复 (Fix)
- API 连通性测试流程与 CLI 探测链路对齐，避免两套检测行为不一致

### 其他 (Chore)
- 补充 `cc-desktop` 专用版本发布 skill，固化版本 bump、tag 与推送流程
- 更新发布特性摘要的 CI 内容，保持发版说明与当前能力一致

---

## v1.7.45 - 2026-04-12

### 修复 (Fix)
- 更新下载前补充“正在计算增量升级包”的等待提示，避免差分准备阶段看起来像卡住
- GitHub Release 的中国镜像下载入口改为显式指向阿里 OSS `index.html` 页面

---

## v1.7.44 - 2026-04-12

### 其他 (Chore)
- 新增按架构拆分的 macOS 一键安装包构建产物，发布流程会生成独立的 arm64 / x64 installer 包
- macOS 安装脚本支持校验安装包架构，避免拿错架构包安装

---

## v1.7.43 - 2026-04-12

### 修复 (Fix)
- Notebook 模式的设置菜单补上应用更新红点，和开发者 / Agent 模式保持一致

### 其他 (Chore)
- 构建生成的镜像下载页补充 Windows 一键安装 zip 链接与说明
- GitHub Release 中的中国镜像下载入口统一改为阿里下载页

---

## v1.7.42 - 2026-04-12

### 修复 (Fix)
- 自动更新主备顺序切回 `Aliyun OSS -> GitHub Releases`，默认优先走阿里主源
- 启动时会把旧的 `GitHub 主源 + 阿里镜像` 配置自动迁回阿里主更新源
- 发布流程移除冗余的 `cc-desktop-*-macos.tar.gz` 打包产物，macOS 直接分发现有架构包

---

## v1.7.41 - 2026-04-12

### 其他 (Chore)
- 验证自动更新差分下载链路，无功能改动

---

## v1.7.40 - 2026-04-12

### 修复 (Fix)
- 自动更新访问阿里 OSS generic 源时附加 `x-oss-multi-range-behavior: multi-range` 请求头，便于验证是否可恢复差分下载
- 组件市场移除备用源配置，启动时会清空旧版 `market.registryMirrorUrl` 和 `registryFallbackUrls`

---

## v1.7.39 - 2026-04-12

### 修复 (Fix)
- 旧配置中的组件市场主备顺序会在启动时自动迁移为 `Gitee → GitHub`，并持久化写回配置文件

---

## v1.7.38 - 2026-04-12

### 修复 (Fix)
- 为旧配置自动补齐 `updatePrimaryUrl` 字段并持久化写回，确保升级后主更新源配置落盘
- 清理 OSS 上传测试工作流中的临时调试步骤，恢复常规测试流程

## v1.7.37 - 2026-04-12

### 新增 (Feat)
- 自动更新主源切换到阿里 OSS 国内镜像，GitHub Releases 作为备用源
- 新增独立的 OSS 上传测试工作流，便于单独验证发布镜像链路

### 修复 (Fix)
- 修复阿里 OSS 上传流程的 endpoint、签名版本与 `ossutil` 兼容性问题
- 将 OSS 发布目录调整为平铺结构，并补齐子目录下载页，保证镜像目录可直接访问
- 加固发布流程中的 tag 推送与 OSS 配置生成，避免重复发版和配置写入导致失败

### 其他 (Chore)
- 为国内镜像发布链路补充 Aliyun OSS 同步与调试能力，便于排查 CI 上传问题

## v1.7.36 - 2026-04-11

### 新增 (Feat)
- Notebook 对话支持提示词草稿生成流程，可先产出草稿并修改后再发送
- MCP 面板新增全局通配权限快捷入口，便于快速配置默认授权
- Agent 与 Notebook 对话输入框新增展开/收起能力，长文本可放大到聊天区约四分之三高度编辑

### 修复 (Fix)
- Notebook 预览生成链路复用统一的生成路径，避免草稿与预览流程分叉

### 文档 (Docs)
- 同步 Notebook 与设置工作台相关文档、架构说明和代码索引

### 测试 (Test)
- 补充 Notebook 生成链路相关回归测试，覆盖草稿生成与预览路径复用

### 新增 (Feat)
- Notebook 工具卡片新增“填入输入框”入口，支持先将工具提示词作为草稿写入对话输入框，再按需修改后发送

### 修复 (Fix)
- Notebook 草稿发送后按实际发送时机创建成果，避免普通聊天误建成果，同时恢复工具生成内容进入右侧成果列表
- 修复 Notebook 草稿发送链路中的结构化参数传递，避免发送时出现 `An object could not be cloned.`
- 调整 Notebook 工具卡片编辑/填入按钮布局，恢复卡片底边距与上下对称排版

### 测试 (Test)
- 补充 Notebook“填入输入框后再发送”回归测试，覆盖草稿发送与成果入列流程

---

## v1.7.35 - 2026-04-09

### 新增 (Feat)
- 新增能力设置工作台，集中管理项目上下文来源，并支持从主界面与 Notebook 快速打开

### 修复 (Fix)
- 修复 Agent 会话路径渲染与工具卡片链接问题
- 将 Agent 路径预览作用域限制到当前活跃会话，避免跨会话串扰
- 修复 Developer / Agent / Notebook 对话区自动滚动行为，统一共享滚动逻辑
- 修复单 Profile 场景下 Agent 模式 API 选择器缺失问题
- 修复问题路径确认流程中 `invoke` 未定义导致的异常

### 重构 (Refactor)
- 重构能力设置工作台的目录上下文来源分组与交互，提升能力管理可读性
- 优化能力管理工作流，减少设置页与能力入口之间的重复跳转

---

## v1.7.34 - 2026-04-08

### 新增 (Feat)
- 新建对话弹窗支持展示最近使用的 Agent 工作目录，提升目录复用效率

### 修复 (Fix)
- 打通桌面端交互审批桥接链路，支持在 Agent/Notebook 中完成权限与问题选择并继续会话
- 增强交互回传能力，支持更丰富的权限动作与多选答案结构
- 加固桌面端交互处理，避免交互卡片重复点击导致重复提交

---

## v1.7.33 - 2026-04-06

### 新增 (Feat)
- Notebook 工具市场详情新增提示词模板展示，支持按模板 ID 直接预览市场最新正文内容

### 修复 (Fix)
- 修复 Notebook 工具重装/同版本重下时提示词模板未刷新的问题，确保模板内容与市场同步

### 测试 (Test)
- 补充 Notebook 提示词更新回归用例，覆盖升级与同版本重装两条安装链路

### 其他 (Chore)
- 清理 hydroSkills 的 Notebook 专用 Prompt 索引冗余，并收紧 Notebook 工具编写规范

---

## v1.7.32 - 2026-04-04

### 修复 (Fix)
- Agent 模式恢复历史会话失败时显示实际错误信息（而非 "unknown error"）

---

## v1.7.31 - 2026-04-04

### 新增 (Feat)
- Notebook 模式来源与成果列表下拉菜单新增“填入输入框”，可将文件路径快速追加到对话输入框

### 修复 (Fix)
- Agent 模式消息路径识别增强，支持 Windows 简写盘符路径（如 `c/workspace/...`）并统一归一化处理
- Agent 模式消息路径识别增强，支持 Windows 正斜杠绝对路径（如 `C:/...`）点击预览
- 开发者模式终端增加 500ms 同尺寸 `fit/resize` 心跳，缓解 Claude 状态栏计数字符残留

### 其他 (Chore)
- 同步更新 GitNexus 索引统计信息说明

---

## v1.7.3 - 2026-04-02

### 新增 (Feat)
- Notebook 模式入口调整为默认展示，用户可直接从左侧模式菜单切换进入

### 文档 (Docs)
- 更新发布流程与协作说明，移除 `enableNotebook=false` 的发版前检查要求
- 同步更新版本号到 `1.7.3`（`package.json`、`CLAUDE.md`、`docs/CHANGELOG.md`）

---

## v1.7.1 - 2026-04-02

### 修复 (Fix)
- 修正创作工具市场长列表显示，支持在弹窗内继续滚动浏览更多工具卡片
- 为创作工具安装增加超时兜底，避免安装长时间卡住时界面持续停留在加载状态
- 调整创作工具市场红点逻辑，远端出现新工具或已安装工具存在更新时均显示提醒
- 升级 Claude Agent SDK 到 0.2.90，修复发布构建阶段依赖下载 404 问题

---

## v1.7.0 - 2026-03-28

### 新增 (Feat)
- Notebook 来源列表右键菜单：重命名、删除、导出、添加到成果
- Notebook 对话区文件路径链接支持右键归档到来源/成果
- Notebook 用户气泡图片支持左键滑出预览、右键归档到来源/成果
- 来源/成果互转时保留原始名称（使用 `preferredName` 参数）
- Notebook 顶部一键整理入口（清理失效来源与成果索引）

### 修复 (Fix)
- 创作工具市场弹窗支持滚动查看更多卡片，工具数量增加时不再出现超出可视区后无法继续浏览的问题
- 创作工具安装增加超时兜底，安装长时间无响应时会提示超时并允许用户重试
- 创作工具市场红点逻辑升级为“有新工具或有可升级工具”时显示提醒

### 测试 (Test)
- 新增来源导出、路径归档等 backend 测试
- `notebook-manager.test.js` 新增 `exportSource`、`addPathToAchievement` 等用例

---

## v1.6.99 - 2026-03-17

### 新增 (Feat)
- Notebook 专业工作台独立页面（三栏布局：资料源 / 工作室 / 对话）
- API 连接测试改用 Agent SDK，支持百炼等有来源校验的端点
- Agent 对话区解耦 — 会话状态提示、Tab 焦点同步、CLI 退出自动关 Tab
- 钉钉历史会话数量配置化（原硬编码 limit=5）
- 对话组件支持 Windows 相对路径渲染与解析
- 钉钉桥接会话管理与切换逻辑优化
- Logo 水滴颜色跟随主题配色
- Footer 模式切换按钮重构为目标模式图标
- Notebook 入口配置化，默认隐藏（settings.enableNotebook）

### 修复 (Fix)
- 修复 /resume 带数字时未激活会话
- 修复解耦重构中的潜在问题及代码审查发现的问题
- resize-handle hover 颜色加深，竖条可见
- panel-header 收展按钮靠右
- Notebook 工作台 locale 初始化跟随系统语言

### 重构 (Refactor)
- Industry 页面重命名为 Notebook
- 拆分 dingtalk-bridge.js，提取图片管道和命令系统为独立模块
- 抽取 ClaudeCodeRunner，解耦 SDK 与 AgentSessionManager
- 解耦钉钉 messageListener，改为 EventEmitter 内部事件
- 拆分 IndustryWorkspace 为四组件架构，接入主题和国际化

---

## v1.6.98 - 2026-03-11

### 新增 (Feat)
- 文件树过滤点开头项（隐藏文件/目录）
- 聊天消息区域和输入框支持右键菜单
- 右键粘贴支持图片

### 修复 (Fix)
- 文件预览大小限制统一为 50MB，使用共享常量

### 重构 (Refactor)
- 优化安装流程：删除代理配置询问，改为自动跟随系统代理
- 拆分大文件：plugin-handlers 和 agent-session-manager 模块化

### 文档 (Docs)
- 更新文档版本号，发版 skill 补充文档同步
- 优化 Release 说明和 README 快速开始步骤

---

## v1.6.97 - 2026-03-10

### 修复 (Fix)
- Agent 右侧面板：文件树 loading/error 状态不再遮挡外部文件预览（FilePreview 现在在有选中文件时始终可见）
- 修复 macOS 上 cwd 外文件点击预览和自动预览失效的问题（根本原因：previewImage 在 loading 状态时被隐藏）
- Renderer 进程中 `process.platform` 改用 `window.electronAPI.platform`，修复 contextIsolation 模式下的 ReferenceError
- Preload 通过 contextBridge 暴露 `platform` 字段，供渲染进程安全访问平台信息

---

## v1.6.96 - 2026-03-10

### 新增 (Feat)
- Agent 模式：点击对话中的文件路径，自动在文件树定位（展开子目录 + 高亮选中）并在预览区展示；cwd 外的文件仅预览不定位
- Agent 模式：cwd 外的预览文件支持编辑保存（通过绝对路径写回，含安全校验）
- `previewImage` 标记外部文件来源（`isExternalFile`），使保存路径分支更明确

### 修复 (Fix)
- 路径规范化 MSYS 转换加 `process.platform === 'win32'` 守卫，修复在 macOS/Linux 上 `/a/foo` 类路径被误转为 `A:/foo` 的问题
- `saveAbsoluteFile` IPC 改用 `path.resolve` + `realpathSync` 做路径校验，修复 Windows 正反斜杠差异导致的误拒绝
- 黑名单补充 macOS 符号链接真实路径 `/private/etc/`、`/private/var/`
- 保存文本时快照入参，防止切换文件期间异步保存写到错误目标

### 其他 (Chore)
- MCP 代理注入 UI 完全移除（代理开关、NodeOptions 开关从安装弹窗移除）；后端 gate 改为 `useProxy !== true`，安装流程不再注入代理

---

## v1.6.95 - 2026-03-09

### 新增 (Feat)

- MCP 安装配置弹窗新增独立的 NODE_OPTIONS 开关：与代理地址开关分离，单独控制是否注入 `-r proxy-setup.cjs`；proxy-support 环境复制随 NODE_OPTIONS 开关触发
- MCP 代理注入增加存在检查：若 MCP 配置中已自带 `HTTP_PROXY`/`HTTPS_PROXY`，代理开关不覆盖

---

## v1.6.94 - 2026-03-09

### 新增 (Feat)

- Agent 右侧文件面板：右键菜单及预览工具栏（图片/文本/视频）新增「插入路径到输入框」，点击后自动将完整路径追加到聊天输入框并换行
- Agent 右侧文件面板：图片预览大小限制从 2MB 放宽至 20MB
- Agent 左侧目录筛选：修复 placeholder 未国际化（英文 "Please Select" → 中文）
- 聊天输入框默认高度由 2 行提升至 3 行
- Agent 模式粘贴图片自动保存到会话目录下的 `chat_paste_images` 子目录

### 修复 (Fix)

- 恢复 Terminal Canvas 渲染器，删除硬编码光标 CSS 导致的样式异常
- 修复 HMR 热重载后终端光标颜色跳动：useTheme 通过 `import.meta.hot.data` 在 HMR 周期间保持 colorScheme/isDark 状态，防止重置为默认值

### 其他 (Chore)

- `my-update-version` skill：增加推送模式选择（构建/不构建），动态检测 remote，未配置的跳过不报错

---

## v1.6.93 - 2026-03-08

### 新增 (Feat)

- xterm.js 本地化：终端组件从 CDN 迁移到本地 vendor 目录（`public/vendor/xterm/`），离线环境下终端可正常使用，CSP 策略同步更新
- 终端光标修复：PTY name 改为 `xterm-256color`，使用 DOM 渲染器，光标样式优化
- 版本发布自动化 Skill（`/my-update-version`）：一键完成版本号更新、CHANGELOG 生成、Git 提交、Tag、推送所有 remote 并确认 CI 触发
- GitHub Release 页面新增「更新内容」区块，CI 自动从 CHANGELOG 提取版本说明展示

---

## v1.6.91 - 2026-03-08

### 修复 (Fix)

- `encodePath()` 补充非 ASCII 字符替换（`[^\x20-\x7E]` → `-`），与 Claude Code CLI 编码行为一致，修复中文路径导致的会话监控失效和历史同步断裂
- 修复 Windows conpty 关闭会话时 `AttachConsole failed` 崩溃（`pty.kill()` 在进程已退出时的预期异常，两处均包 try-catch 静默处理）
- 修复打开中文/特殊字符路径项目时直接写入数据库的问题：现在先检测不创建记录，弹确认对话框，用户确认后才创建，取消则不留痕迹

### 新增 (Feat)

- Agent 文件树新增快速搜索功能：后端 `searchFiles()` 递归遍历（限深 10 层 / 限量 100 条）+ 前端搜索框（300ms 防抖），支持按文件名模糊搜索
- 开发者模式左侧项目下拉列表鼠标悬停显示完整路径 tooltip（`render-label` 方案）
- 打开/新建项目时检测问题路径（中文、连字符、下划线），弹出风险确认对话框（含三项具体影响说明），用户可选择继续或取消

---

## v1.6.90 - 2026-03-07

### 文档 (Docs)

- 建立系统性设计文档体系：新增 `docs/design/`（3 篇设计文档）和 `docs/code-index/`（3 篇代码索引），重写 `docs/ARCHITECTURE.md` 架构总览
- 迁移 3 份设计类文档到 `docs/design/` 统一管理（design-system、session-management、image-recognition）

---

## v1.6.89 - 2026-03-07

### 修复 (Fix)

- macOS 更新下载完成后 `MacUpdater` 启动本地 Server 触发的 `Could not get code signature` 错误现已静默处理，不再弹出错误提示（无代码签名的预期行为）
- MCP 添加/编辑弹窗支持 Claude Desktop 格式（`{ "mcpServers": { ... } }`），自动解包后正确保存，不再出现名称变成 `mcpServers` 的问题

---

## v1.6.88 - 2026-03-07

### 测试

- 验证 macOS 稍后安装自动安装逻辑（v1.6.87 新增功能）
- 验证镜像源差分下载速度

---

## v1.6.87 - 2026-03-07

### 修复 (Fix)

- macOS 更新下载完成后不再触发签名检查错误（`autoInstallOnAppQuit` 在 macOS 上改为 `false`，避免无代码签名时的 `Could not get code signature` 报错）

### 新增 (Feat)

- macOS 支持"稍后安装"语义：用户点击稍后安装后正常退出 App，自动触发 `macOSManualInstall()` 安装更新（3s 安全兜底防止安装失败导致应用无法退出）

### 其他 (Chore)

- electron-updater 内部日志统一加 `[eu]` 前缀，与 `[UpdateManager]` 自有日志区分，提升可读性

---

## v1.6.86 - 2026-03-07

### 其他 (Chore)

- 版本升级至 1.6.86

---

## v1.6.85 - 2026-03-07

### 其他 (Chore)

- 版本升级至 1.6.85

---

## v1.6.84 - 2026-03-06

### 修复 (Fix)

- macOS 安装脚本模板字符串转义：`${APP_NAME}` → `\${APP_NAME}`，修复 JS 模板求值导致的 `ReferenceError: APP_NAME is not defined`，彻底修复"退出并安装"无响应问题

---

## v1.6.83 - 2026-03-06

### 修复 (Fix)

- 检查更新时主源连接失败不再向 UI 推送错误（有镜像源时静默 fallback，双源均失败才报错）
- 镜像源升级面板现在能正确显示版本更新说明（CI 构建时将 CHANGELOG 内容注入 latest-mac.yml）

---

## v1.6.82 - 2026-03-06

### 测试

- 镜像源 fallback 升级验证（主源 repo 配置错误场景）

---

## v1.6.81 - 2026-03-06

### 修复 (Fix)

- **macOS 安装脚本原子替换**：将 `rm → cp` 改为 `cp(.new) → rm → mv` 模式，彻底杜绝 `rm` 成功但 `cp` 失败时应用消失的风险
- **macOS 安装失败可感知**：脚本每个退出点均写入 `install-result.json`；应用重启后自动读取结果，失败时打开更新窗口并显示具体错误，同时保留下载状态供用户直接重试安装
- **安装脚本唯一文件名**：脚本文件名加入时间戳（`cc-desktop-install-{ts}.sh`），脚本退出时通过 `trap EXIT` 自清理，避免残留文件干扰

### 新增 (Feature)

- 前端新增 `update-install-failed` 事件处理：主窗口收到事件后自动打开更新窗口；更新窗口 mount 时读取安装错误并在状态栏展示

---

## v1.6.80 - 2026-03-06

### 测试

- 镜像源 fallback 下载进度条验证（v1.6.79 → v1.6.80）

---

## v1.6.79 - 2026-03-06

### 修复

- 修复镜像 fallback 下载时进度条不显示的问题（fallback 路径的 `checkForUpdates` 重新触发 `update-available` 事件，导致 `isDownloading` 被重置为 false，进度条消失）

---

## v1.6.78 - 2026-03-06

### 调试

- 更新管理器 UI 进度事件添加 console.log，排查差分下载进度条不更新问题

---

## v1.6.77 - 2026-03-05

### 测试

- GitHub 主源差分更新验证（v1.6.76 → v1.6.77）

---

## v1.6.76 - 2026-03-05

### 修复 (Fix)

- **Fallback 错误闪烁修复**：主源失败切换镜像期间，抑制 error 事件通知 UI，避免短暂闪现错误后又显示更新可用
- **配置迁移持久化修复**：修复 `needsSave` 逻辑（对象引用比较永远为 false），确保迁移结果写入磁盘
- **旧配置清理**：自动清除用户 config.json 中残留的 `skillsMarket` 和 `updateUrl` 字段

### 移除

- **移除 Gitee 同步工作流**：开源代码集中在 GitHub，无需双平台同步

---

## v1.6.75 - 2026-03-05

### 测试

- 差分更新验证版本（v1.6.74 → v1.6.75）

---

## v1.6.74 - 2026-03-05

### 修复 (Fix)

- **恢复 GitHub 差分更新**：主源从 `provider: "generic"` 改回 `provider: "github"`，修复 GitHub CDN 不支持 Range 请求导致差分下载失效的问题
- **配置结构调整**：`updateUrl` 替换为 `updateGithub.owner/repo`，主源走 GitHub API，镜像保持 generic

---

## v1.6.73 - 2026-03-05

### 优化 (Enhancement)

- **国内镜像下载页**：R2 根路径新增下载引导页，`ccd.myseek.fun` 可直接访问
- **Release 下载链接优化**：国内镜像从域名链接改为具体文件直链

---

## v1.6.72 - 2026-03-05

### 优化 (Enhancement)

- **自动更新双源重构**：去掉硬编码 GitHub 地址，主源/镜像完全由配置驱动
- **检查更新防重入**：防止并发检查导致源被切换的竞态问题
- **CI 保留历史 blockmap**：R2 清理时保留 blockmap 文件，支持差分更新
- **移除 UI 中的源地址配置**：防止用户误改，仅保留 config.json 手动维护
- **新增管理员维护手册**：`docs/ADMIN-URL-CONFIG.md`

---

## v1.6.71 - 2026-03-05

### 测试

- 自动更新双源 fallback 测试版本

---

## v1.6.70 - 2026-03-05

### 新增 (Feature)

- **组件市场国内镜像 fallback**：主地址 8 秒超时后自动切换到 Gitee 镜像，国内用户无需代理即可使用组件市场
- **构建产物国内镜像**：CI 构建后自动上传到 Cloudflare R2（`ccd.myseek.fun`），国内用户可快速下载安装包
- **自动更新双源 fallback**：检查和下载更新时优先 GitHub，失败自动切换国内镜像源

---

## v1.6.69 - 2026-03-04

### 新增 (Feature)

- **钉钉历史会话显示 API 配置名称**：历史会话选择菜单中显示每个会话使用的 API 配置名称，便于区分不同配置下的对话

### 修复 (Fix)

- **Windows MCP 市场安装命令包装**：Windows 平台市场安装 MCP 时自动将 npx/node 等命令包装为 `cmd /c`，解决 spawn 无法直接执行 .cmd 批处理脚本的问题

---

## v1.6.68 - 2026-03-03

### 修复 (Fix)

- **macOS MCP 代理环境构建失败**：修复 `ensureProxySupport` 中 `npm install undici` 在 macOS 下因 PATH 缺失导致 `npm: command not found` 的问题，使用 `buildBasicEnv()` 注入增强 PATH

---

## v1.6.67 - 2026-03-03

### 新增 (Feature)

- **MCP 工具权限自动注入**：安装 MCP 时自动从注册表 `tools` 字段读取工具名，批量写入 `~/.claude/settings.json` 权限，免去手动授权
- **MCP 卸载权限清理**：卸载 MCP 时按前缀自动删除关联的工具权限，无残留
- **Settings 标签页自动刷新**：MCP 安装/卸载后切换到 Settings 标签页或从 Agent 模式切回时自动刷新权限列表

### 改进 (Improvement)

- **环境变量弹窗复用**：`ComponentMarketModal` 和 `CapabilityModal` 共用 `mcp-env-utils.js` 工具模块，消除重复代码

### 文档 (Docs)

- **MCP 安装用户指南**：`API-CONFIG-GUIDE.zh.md` 新增"MCP 服务器安装与配置"章节
- **MCP 市场设计文档**：`ARCHITECTURE.md` 新增代理环境变量注入逻辑、工具权限自动注入设计说明

---

## v1.6.66 - 2026-03-01

### 修复 (Fix)

- **Agent 会话列表排序**：按最后消息时间排序（而非创建时间）；每轮对话完成后自动将该会话上浮到列表最前，无需重启

---

## v1.6.65 - 2026-03-01

### 修复 (Fix)

- **连接测试模型兜底**：连接测试接口使用 `LATEST_MODEL_ALIASES` 兜底，避免自定义模型名无法命中时测试失败

### 文档 (Docs)

- **README 重构为双语合并版**：英文在前、中文在后，安装教程独立移至 `docs/INSTALL.md` / `docs/INSTALL_EN.md`
- **产品路线图**：新增 `docs/ROADMAP.md`，规划文档推广、能力生态、知识库、自治演进四大方向

---

## v1.6.64 - 2026-02-28

### 新增 (Feature)

- **能力清单更新通知**：启动时后台拉取远程能力清单，SHA-256 哈希对比本地缓存，有变更时在 ⚡ 按钮显示红点徽章；打开 CapabilityModal 自动清除红点并更新缓存

---

## v1.6.63 - 2026-02-28

### 修复 (Fix)

- **路径编码与 CLI 不一致**：`encodePath` 新增 `_` 替换为 `-`，与 Claude CLI 实际编码行为一致；`smartDecodePath` 同时尝试 `-` 和 `_` 两种 joiner 解码
- **移除目录名 `-`/`_` 限制**：移除 5 处目录名校验，允许使用包含连字符或下划线的项目目录
- **新建会话竞态导致重复记录**：修复 FileWatcher 与 SyncService 竞态，新增 `mergePendingIntoExisting` 合并逻辑，避免 pending session 无法关联
- **会话删除对话框标题缺少 i18n**：补充 `session.deleteTitle` 国际化 key
- **API 配置重命名后 Agent 列表 tips 不更新**：`AgentLeftContent` 监听窗口 focus 事件自动刷新 API profiles

---

## v1.6.62 - 2026-02-27

### 修复 (Fix)

- **模型映射显示不生效**：`useAgentChat` 中 `modelMapping` 从普通变量改为 `ref`，修复新建会话选择带模型映射的 API Profile 时工具栏模型名不更新的问题
- **新建会话 API 配置选择不生效**：`createConversation` 漏传 `apiProfileId`，导致始终使用默认 profile（v1.6.61 修复未包含在构建产物中）

---

## v1.6.61 - 2026-02-27

### 新功能 (Features)

- **MCP 市场**：能力清单新增 MCP 类型支持，可从市场一键安装/卸载 MCP 配置；支持冲突检测与强制覆盖安装
- **Agent 能力清单 MCP 启闭**：Agent 模式能力清单中可对 MCP 进行启用/禁用，通过 SDK `toggleMcpServer` 对当前会话立即生效

### 修复 (Fix)

- **钉钉第一条消息无思考动画**：将流式监听器注册提前至 `loadMessages` 之前，修复钉钉消息触发时 `streaming` 事件已发出但监听器尚未注册导致动画缺失的问题
- **MCPTab 切回开发者模式不刷新**：补充 `isDeveloperMode` watch，从 Agent 模式切回开发者模式时自动刷新 MCP 列表

### 代码质量 (Chore)

- `capability-handlers.js` MCP 启闭兜底错误信息改为英文
- `MCPTab.vue` `handleView` 方法添加预留注释

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
