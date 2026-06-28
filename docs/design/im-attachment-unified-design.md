# IM 统一附件抽象设计

> 状态：阶段 1 已落地，阶段 2 待规划
> 当前实现：图片 + 文档附件；音频 / 视频仍未进入实现范围

## 1. 背景

当前 IM 链路已经具备图片双向能力，并已补齐文档类附件的三端出入站能力。图片、文档、音视频仍按不同处理管线分层：

- 图片已经能自动进入视觉理解链路。
- 文档类（`pdf`、`doc/docx`、`xls/xlsx`、`ppt/pptx`）已支持飞书、钉钉、企业微信三端收发。
- 语音和视频目前应视为另一类媒体管线，不应和文档混在同一实现里。

本设计的目标不是“重写图片能力”，而是先把现有图片能力纳入统一附件模型，再把文档、音视频按阶段补齐。阶段 1 的文档实现只负责下载、保存、预览和路径传递，不在 IM 层做文本抽取。

## 2. 设计目标

- 统一 IM 收发附件的元数据结构。
- 保留现有图片自动理解能力。
- 为文档类附件提供下载、预览、文件路径传递和 Agent 可读取入口。
- 为音视频类附件预留媒体管线与转写/缩略图能力。
- 让各 IM 平台只负责协议适配，不再嵌入过多附件业务判断。

## 3. 范围切分

### 阶段 1：图片 + 文档

阶段 1 的重点是“可读附件”：

- 图片：继续自动走视觉理解。
- 文档：`pdf`、`doc/docx`、`xls/xlsx`、`ppt/pptx`。
- 目标：下载、缓存、预览、把本地文件路径传给 Agent。
- 非目标：IM 层不做 PDF/Office 文本抽取，文档理解交给 Agent 既有文件/PDF能力。
- 出站：桌面端和内置 MCP 均可通过 `filePaths` 向飞书、钉钉、企业微信发送上述文档。
- 预览：PDF 走右侧本地 webview 预览；Office 复用 Notebook 的 Office 预览能力。

阶段 1 不追求音视频处理。

### 阶段 2：音频 + 视频

阶段 2 的重点是“媒体附件”：

- 音频：下载、播放、转写。
- 视频：下载、播放、缩略图、关键帧、可选转写。

这类能力与文档处理差异较大，单独一阶段更稳。

## 4. 统一抽象

建议新增统一对象 `Attachment`：

```ts
type AttachmentKind = 'image' | 'document' | 'media'
type AttachmentSubKind = 'png' | 'jpg' | 'pdf' | 'docx' | 'xlsx' | 'pptx' | 'audio' | 'video'

interface Attachment {
  id: string
  kind: AttachmentKind
  subKind: AttachmentSubKind
  mimeType: string
  filename: string
  sizeBytes: number
  source: 'inbound' | 'outbound' | 'desktop' | 'agent'
  channel: 'dingtalk' | 'feishu' | 'weixin' | 'enterprise-weixin'
  localPath?: string
  remoteRef?: string
  preview?: {
    kind: 'image' | 'text' | 'html' | 'pdf' | 'audio' | 'video'
    content?: string
    thumbnailUrl?: string
  }
  transcript?: string
  meta?: Record<string, unknown>
}
```

### 兼容原则

- 现有 `images` 字段保留。
- 图片在底层可映射为 `Attachment(kind='image')`，但对 Agent 输入仍可继续输出 `images`。
- 只有在新能力稳定后，再考虑让上层统一切换到 `attachments`。

## 5. 处理器接口

建议为每种附件类型引入 processor：

```ts
interface AttachmentProcessor {
  match(input): boolean
  normalize(input): Promise<Attachment>
  preparePreview(attachment): Promise<Attachment>
  extractForAgent(attachment): Promise<unknown>
  sendOutbound(attachment, target): Promise<void>
}
```

### 处理器职责

- `image processor`
  - 保留视觉理解。
  - 兼容现有 base64 `images` 输入。

- `document processor`
  - 识别 `pdf` / Office 文档。
  - PDF 直接复用右侧/Notebook 的文件预览能力，返回本地文件路径供 webview 预览。
  - Office 文档复用现有预览能力；Agent 分析时传递文件路径，不在 IM 层抽取正文。

- `media processor`
  - 处理音频与视频。
  - 负责播放资源、缩略图、转写与元信息提取。

## 6. 处理流程

### 入站

1. IM 平台收到消息。
2. 桥接层解析附件原始信息。
3. `AttachmentProcessor` 识别类型并标准化。
4. 生成统一 `Attachment`。
5. 按类型分发：
   - 图片 -> 视觉理解。
   - 文档 -> 下载缓存 + 预览 + 路径提示。
   - 音视频 -> 媒体缓存 + 后置处理。

### 出站

1. Agent 或 UI 产生附件请求。
2. 先生成统一 `Attachment`。
3. 根据渠道能力矩阵决定：
   - 原生附件直发。
   - 需要先上传再发送。
   - 只支持链接或卡片时使用降级展示。

## 7. 渠道能力矩阵

每个 IM 渠道都应声明自己的能力，而不是在业务代码里到处 `if platform`：

| 能力 | 含义 |
|------|------|
| `nativeImageSend` | 原生图片发送 |
| `nativeFileSend` | 原生文件发送 |
| `nativeAudioSend` | 原生音频发送 |
| `nativeVideoSend` | 原生视频发送 |
| `downloadAttachment` | 是否能下载入站附件 |
| `previewAttachment` | 是否能展示预览 |
| `agentImageVision` | 图片是否直接进入视觉理解 |
| `agentDocumentPath` | 文档是否以本地路径交给 Agent 读取 |
| `agentMediaTranscript` | 音视频是否可转写 |

降级规则建议：

- 原生可发优先原生发。
- 不可原生发则走“上传 + 链接/卡片”。
- 不可预览则只保留下载入口。

阶段 1 的当前三端能力：

| 渠道 | 入站文档 | 出站文档 | 说明 |
|------|----------|----------|------|
| 飞书 | 支持 | 支持 | 入站文件保存到会话目录，出站通过飞书文件消息发送 |
| 钉钉 | 支持 | 支持 | 入站保存本地附件，出站上传后发送 |
| 企业微信 | 支持 | 支持 | 主动发送依赖已配置的企业微信桥接能力 |

## 8. Agent 接入

Agent 侧不应该只认识图片数组，应该认识“附件集合”。

建议策略：

- 图片继续映射为 `images`，保持现有视觉理解不变。
- 文档只把文件名和本地路径写入普通上下文，Agent 需要分析时使用自身文件/PDF能力读取。
- 音视频先不强行塞进上下文，只保留摘要和转写入口。

这样可以避免把图片能力拆坏，也避免让 IM 层重复实现 Agent 已具备的文档理解能力。

## 9. 前端交互

前端建议按附件卡片统一展示：

- 图片：缩略图。
- 文档：文件名、类型、大小、预览/下载按钮。
- 音频：时长、播放按钮、下载按钮。
- 视频：缩略图、时长、播放按钮、下载按钮。

聊天输入侧建议支持：

- 拖拽附件。
- 粘贴图片。
- 选择文件。
- 自动识别类型并展示预览。

当前已落地行为：

- 图片仍保留原有预览和自动视觉理解。
- PDF 可在右侧直接预览，本地 file URL 会进行安全编码，兼容 macOS/Linux 路径、空格、中文、`#`、`?` 等字符。
- Office 文档在右侧复用 Notebook 预览能力，不弹出保存对话框作为主要预览路径。
- 文档附件进入 Agent 上下文时传递本地文件路径，Agent 可按需使用自身文件/PDF能力读取。

## 10. 实施顺序

建议顺序如下：

1. 先落统一 `Attachment` 数据结构。
2. 再把现有图片能力包装成第一个 processor。
3. 增加文档 processor。
4. 补 UI 卡片与 Agent 输入转换。
5. 最后再做音视频 processor。

## 11. 风险

- 直接把图片链路改成新抽象，容易破坏现有视觉理解。
- 文档预览和内容理解如果混在桥接层，会让 IM 代码越来越胖，也会重复 Agent 文件能力。
- 音视频如果和文档同阶段做，复杂度会失控。

## 12. 结论

推荐采用“统一底座 + 分阶段 processor”的方案：

- 阶段 1：图片 + 文档。当前已覆盖 PDF、Word、Excel、PowerPoint 在飞书、钉钉、企业微信三端的入站保存、桌面预览、Agent 路径传递、桌面/MCP 出站发送。
- 阶段 2：音频 + 视频。仍待单独规划，不应混入文档处理链路。

这样既能保住当前图片自动理解，又能把文档类附件真正补齐。
