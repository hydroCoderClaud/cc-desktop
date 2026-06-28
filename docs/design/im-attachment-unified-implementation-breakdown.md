# IM 统一附件抽象实施任务拆解

> 状态：阶段 1 文档附件已落地；音频 / 视频待后续规划
> 关联文档：
> - `docs/design/im-attachment-unified-design.md`
> - `docs/design/built-in-mcp.md`
> - `docs/design/integrations.md`
> - `docs/design/image-recognition.md`

## 1. 文档目标

本文将“IM 统一附件抽象设计”拆成可执行任务清单，按阶段定义：

- 改动目标
- 代码范围
- 关键实现点
- 测试点
- 验收门槛
- 回滚点

本拆解遵循一个最高原则：**不破坏现有图片自动理解链路**。

## 当前实现快照

截至当前实现，阶段 1 已覆盖：

- 图片能力并入统一附件展示语义，同时保持 `images` 输入和自动视觉理解不变。
- 文档类附件支持 `pdf/doc/docx/xls/xlsx/ppt/pptx`。
- 飞书、钉钉、企业微信三端支持文档入站保存和出站发送。
- 桌面右侧支持 PDF 直接预览，Office 文档复用 Notebook 预览能力。
- 内置 MCP `mcp__hydrodesktop__im_send` 支持 `filePaths`，可从会话内指定本地文档发往 IM 目标。
- IM 层不抽取 PDF/Office 正文，Agent 需要分析时使用本地文件路径和自身文件/PDF能力读取。

仍未实现：

- 音频 / 视频附件下载、播放、转写。
- 将所有上层调用完全迁移到单一 `attachments` 输入；当前仍保留图片 `images` 兼容路径。

## 2. 总体策略

### 2.1 实施顺序

当前实际推进结果：

1. 已建立统一附件底座和文档附件辅助模块。
2. 已保留现有图片能力，并将图片与文档在展示和 Agent 输入上分流。
3. 已补文档类附件入站、出站和预览。
4. 已补聊天输入、右侧预览、MCP `filePaths` 等用户路径。
5. 音频 / 视频仍待下一阶段单独规划。

### 2.2 不可跨越的门槛

在任何阶段开始编码前，都必须满足：

- 现有 `images` 输入格式保持兼容
- 现有图片视觉理解逻辑保持可用
- 现有 IM 桥接消息入站 / 出站不被重写
- 文档和音视频不与图片共享一套“硬编码分支逻辑”

### 2.3 兼容原则

所有新附件能力都必须遵循：

- 先兼容旧逻辑，再切新抽象
- 先做读路径，再做写路径
- 先做标准化，再做增强处理

## 3. 当前边界与关键文件

### 3.1 Agent 输入边界

- `src/main/agent-session-manager.js`
- `src/renderer/composables/useAgentChat.js`
- `src/renderer/pages/main/components/agent/ChatInput.vue`

### 3.2 IM 桥接边界

- `src/main/managers/dingtalk-bridge.js`
- `src/main/managers/dingtalk-image.js`
- `src/main/managers/feishu-bridge.js`
- `src/main/managers/feishu-message-api.js`
- `src/main/managers/weixin-bridge.js`
- `src/main/managers/weixin-notify-service.js`
- `src/main/managers/enterprise-weixin-bridge.js`

### 3.3 文件/预览边界

- `src/main/managers/agent-file-manager.js`
- `src/main/managers/notebook-file-reader.js`
- `src/renderer/pages/main/components/AgentRightPanel/FilePreview.vue`

### 3.4 文档边界

- `docs/design/image-recognition.md`
- `docs/design/integrations.md`
- `docs/design/built-in-mcp.md`

## 4. 阶段 0：前置准备

### 4.1 目标

在真正改造前，先建立附件设计的安全网和现状基线。

### 4.2 任务

#### Task 0.1：补齐附件现状清单

目标：

- 记录当前图片入站 / 出站链路
- 记录现有 Agent 多模态输入格式
- 记录现有文档 / 视频 / 二进制文件读取能力

涉及文件：

- `docs/design/image-recognition.md`
- `docs/design/integrations.md`
- `docs/design/built-in-mcp.md`
- `docs/design/im-attachment-unified-design.md`

产出：

- 附件现状清单

#### Task 0.2：补齐回归测试基线

目标：

- 在改造前确认现有图片链路可用
- 确认 Agent 输入图片的路径不回退

建议执行：

- 图片相关单测
- IM 相关单测
- Agent 消息格式相关单测

产出：

- 基线测试报告

### 4.3 阶段门槛

只有在“现状记录完整、现有图片链路稳定”后，才允许进入阶段 1。

## 5. 阶段 1：统一附件底座

### 5.1 目标

建立统一 `Attachment` 数据模型和 `AttachmentProcessor` 接口，但不破坏现有图片能力。

### 5.2 核心原则

- 先做抽象，不急着改所有调用方
- 图片先作为首个 processor 落地
- `images` 字段继续保留

### 5.3 任务清单

#### Task 1.1：定义统一附件数据结构

目标：

- 新增统一附件对象定义

建议新增文件：

- `src/main/managers/attachment-types.js`
- 或等价的共享类型模块

实现要点：

- 定义 `kind / subKind / mimeType / filename / sizeBytes / source / channel`
- 预留 `preview / transcript / remoteRef / localPath`
- 统一 `AttachmentKind` 与 `AttachmentSubKind`

测试：

- 新增 `tests/main/attachment-types.test.js`

#### Task 1.2：定义附件处理器接口

目标：

- 建立每类附件的标准处理入口

建议新增文件：

- `src/main/managers/attachment-processor.js`
- 或 `src/main/managers/attachment-processors/*`

实现要点：

- `match()`
- `normalize()`
- `preparePreview()`
- `extractForAgent()`
- `sendOutbound()`

注意：

- 接口要支持“无输出 / 降级输出”
- 不要把 UI 逻辑放进 processor

测试：

- 新增 processor 接口单测

#### Task 1.3：接入图片 processor 作为首个实现

目标：

- 把现有图片能力包装成统一 processor

涉及文件：

- `src/main/managers/weixin-notify-service.js`
- `src/main/managers/dingtalk-image.js`
- `src/main/managers/feishu-bridge.js`
- `src/main/managers/enterprise-weixin-bridge.js`
- `src/main/agent-session-manager.js`

实现要点：

- 识别 `image/*` 并标准化为 `Attachment`
- 保持现有 `images` 输出不变
- 图片仍然自动进入视觉理解链路

注意：

- 这是最关键的兼容任务
- 不允许把图片改成只剩 `attachments`

测试：

- 图片入站测试
- 图片出站测试
- Agent 图片理解测试

### 5.4 阶段门槛

只有在“统一数据结构 + 图片 processor 兼容”稳定后，才允许进入阶段 2。

## 6. 阶段 2：文档类附件

### 6.1 目标

支持 `pdf` 与 Office 文档的下载、预览和 Agent 路径输入。

边界说明：

- PDF 在右侧面板直接预览，复用 Notebook 文件预览返回路径的思路。
- IM 层不引入 PDF/Office 文本抽取库。
- Agent 需要理解文档内容时，接收本地文件路径并使用自身文件/PDF能力读取。

当前状态：已完成。实现覆盖飞书、钉钉、企业微信三端，并包含桌面主动发送与内置 MCP 发送。

### 6.2 任务清单

#### Task 2.1：补齐文档类型识别

目标：

- 识别 `pdf/doc/docx/xls/xlsx/ppt/pptx`

涉及文件：

- `src/main/managers/agent-file-manager.js`
- 新的文档 processor

实现要点：

- 扩展 MIME / 扩展名映射
- 文档与图片分流
- 二进制识别保持兜底

测试：

- 文档类型识别单测
- 出站支持格式单测：`.pdf/.doc/.docx/.xls/.xlsx/.ppt/.pptx`
- 不支持格式拒绝单测

#### Task 2.2：文档预览与路径管线

目标：

- 为文档生成可预览入口和可传给 Agent 的本地路径

涉及文件：

- `src/main/managers/agent-file-manager.js`
- `src/main/managers/notebook-file-reader.js`
- 新的文档 processor

实现要点：

- PDF 直接返回 `{ type: 'pdf', content: fullPath }` 供右侧 webview 预览
- Office 文档复用现有预览能力
- 附件元数据中保留 `localPath`，不把文档正文注入 prompt
- 本地 PDF/HTML webview src 使用安全 file URL 构造，兼容 macOS/Linux 绝对路径和特殊字符文件名

注意：

- 不在 IM 层实现文档理解
- 不新增 PDF 抽取依赖
- 优先保证预览和路径传递稳定

测试：

- PDF 预览测试
- 文档附件路径提示测试
- macOS/POSIX 风格路径测试

#### Task 2.3：文档 Agent 输入适配

目标：

- 把文档本地路径传给 Agent

涉及文件：

- `src/main/agent-session-manager.js`
- `src/renderer/composables/useAgentChat.js`

实现要点：

- 文档文件名和 `localPath` 进入上下文
- 不强行把文档塞进 `images`
- 保持图片与文档的输入分流
- 文档内容读取由 Agent 自身文件/PDF能力完成
- 入站附件保存到会话工作目录下的 `im_attachments/`

测试：

- 文档路径进入 Agent 的上下文测试

#### Task 2.4：文档出站策略

目标：

- 根据 IM 能力矩阵决定原生发送或降级展示

涉及文件：

- 各 IM bridge
- 附件能力矩阵模块
- `src/main/managers/im-file-attachments.js`
- `src/main/managers/desktop-capability-query-options.js`

实现要点：

- 原生支持时直发
- 不支持时回退到链接 / 卡片 / 下载
- 保留文件名、大小、类型
- `filePaths` 同时支持桌面 UI 和内置 MCP 调用

测试：

- 渠道降级策略测试
- 飞书、钉钉、企业微信主动发送文档测试
- MCP `im_send.filePaths` 三端透传测试

### 6.3 阶段门槛

当前门槛已达成：文档可预览、路径可进 Agent、三端可出站，且 macOS/POSIX 文档路径已有回归覆盖。

## 7. 阶段 3：前端统一附件展示

### 7.1 目标

把图片、文档、音频、视频统一成一套聊天 UI 展示。

### 7.2 任务清单

#### Task 3.1：附件卡片组件

目标：

- 统一附件消息展示样式

涉及文件：

- `src/renderer/pages/main/components/agent/MessageBubble.vue`
- `src/renderer/pages/main/components/agent/ChatInputImagePreview.vue`
- 新的附件卡片组件

实现要点：

- 图片显示缩略图
- 文档显示文件信息与下载按钮
- 音视频预留时长与播放入口

测试：

- 组件快照 / 交互测试

#### Task 3.2：聊天输入附件选择

目标：

- 支持拖拽、粘贴、选择文件

涉及文件：

- `src/renderer/pages/main/components/agent/ChatInput.vue`
- `src/renderer/pages/main/components/agent/ChatInputToolbar.vue`

实现要点：

- 自动识别附件类型
- 图片保持原有预览
- 文档显示文件卡片预览

测试：

- 输入附件选择测试

### 7.3 阶段门槛

只有在“前端可统一展示附件”后，才允许进入阶段 4。

## 8. 阶段 4：音频 / 视频附件

### 8.1 目标

补齐语音和视频的下载、预览、播放、转写能力。

### 8.2 任务清单

#### Task 4.1：媒体类型识别

目标：

- 识别音频和视频文件

涉及文件：

- 新的 media processor
- `src/main/managers/agent-file-manager.js`

实现要点：

- 识别常见音频 / 视频 MIME
- 生成缩略图或封面
- 记录时长

测试：

- 音频 / 视频识别测试

#### Task 4.2：媒体预览与播放

目标：

- 提供可播放预览

涉及文件：

- 前端附件卡片
- 媒体预览组件

实现要点：

- 音频播放
- 视频播放
- 下载入口保留

测试：

- 播放控件测试

#### Task 4.3：媒体转写 / 摘要

目标：

- 提供可选的转写或摘要入口

涉及文件：

- 媒体 processor
- Agent 输入转换层

实现要点：

- 音频转写结果进入文本摘要
- 视频先保留元信息，再按需扩展关键帧或转写

测试：

- 转写输出测试

### 8.3 阶段门槛

只有在“音频 / 视频可稳定下载与播放”后，才允许进入增强阶段。

## 9. 回滚策略

任何阶段若出现回归，都应优先回滚到：

1. 只保留图片 processor
2. 继续使用现有 `images` 兼容路径
3. 文档 / 媒体能力保持关闭或降级

## 10. 建议的后续执行顺序

建议实际编码顺序如下：

1. 已完成阶段 1 的图片兼容、文档入站、文档预览、文档出站和 MCP `filePaths`。
2. 下一步如继续扩展，应先回归三端文档能力，再单独设计音频 / 视频阶段。
3. 音频 / 视频不要复用文档 processor 的抽取/预览假设，应按媒体管线重新拆任务。

## 11. 结论

这套拆分的核心不是“一次性做完所有附件能力”，而是：

- 先把统一底座建稳
- 再保住图片理解不回退
- 然后按文档、音视频逐步扩展

这样每一步都能独立验收，也更容易控制 IM 相关回归风险。
