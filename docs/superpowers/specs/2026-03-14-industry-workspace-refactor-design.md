# IndustryWorkspace 重构设计文档

**日期**：2026-03-14
**分支**：feature/industry-agent-demo
**状态**：待实现

---

## 背景

`IndustryWorkspace.vue` 当前 2200+ 行，存在以下问题：

1. 单文件过大，违反模块化原则
2. 所有颜色硬编码，未接入工程主题系统
3. 大量 `.dark-theme .xxx` 重复覆盖样式（约占 40%）
4. 所有文字硬编码中文，未接入国际化框架
5. 图标语义不准确（`link` 用作思维导图，`file-text` 同时用于报告和演示文稿）

---

## 第一节：架构拆分

### 目标文件结构

```
src/renderer/pages/industry/
├── components/
│   ├── IndustryWorkspace.vue     # 主容器：三栏布局 + resize 逻辑
│   ├── SourcePanel.vue           # 左侧来源面板（列表视图 + 详情视图）
│   ├── ChatPanel.vue             # 中间对话区域
│   └── StudioPanel.vue           # 右侧 Studio 面板（类型网格 + 成果详情）
├── composables/
│   └── useIndustryLayout.js      # resize 逻辑、面板展开/收起、宽度自动调整
├── locales/
│   ├── zh-CN.js                  # industry 模块中文翻译
│   └── en-US.js                  # industry 模块英文翻译
└── App.vue / main.js             # 不变
```

### 各文件职责

| 文件 | 职责 | 预估行数 |
|------|------|---------|
| `IndustryWorkspace.vue` | 三栏容器、顶部导航、resize 分隔条 | ~150 行 |
| `SourcePanel.vue` | 来源列表、搜索、详情展开/收起 | ~300 行 |
| `ChatPanel.vue` | 对话区域、输入框、欢迎页 | ~150 行 |
| `StudioPanel.vue` | 类型网格、成果列表、成果详情 | ~300 行 |
| `useIndustryLayout.js` | resize 逻辑、宽度状态、面板展开自动调整 | ~80 行 |

### 组件通信

- `useIndustryLayout.js` 提供 `leftWidth`、`rightWidth`、`showLeftPanel`、`showRightPanel`、`startResize`
- 子面板通过 props 接收宽度，通过 emit 通知展开/收起
- 展开详情时自动调整宽度（2/5 容器宽）逻辑集中在 `useIndustryLayout.js`

---

## 第二节：主题系统接入

### 原则

- 完全删除所有 `.dark-theme .xxx` 硬编码覆盖
- 所有颜色改用 CSS 变量，响应 `useTheme` 的深浅模式和 6 套配色方案
- 不破坏工程其他页面

### CSS 变量映射

industry 模块直接复用工程现有 CSS 变量，无需新增：

| 用途 | CSS 变量 |
|------|---------|
| 面板背景 | `var(--bg-color-secondary)` |
| 摘要卡片/搜索框背景 | `var(--bg-color-tertiary)` |
| 分隔线 | `var(--border-color)` |
| 主文字 | `var(--text-color)` |
| 次要文字 | `var(--text-color-secondary)` |
| 静默文字 | `var(--text-color-muted)` |
| hover 背景 | `var(--hover-bg)` |
| 主色按钮 | `var(--primary-color)` |
| 主色 hover | `var(--primary-color-hover)` |
| 危险色 | `var(--danger-color)` |
| 整体背景 | `var(--bg-color)` |

### 按钮形状规范

| 按钮类型 | 形状 | 说明 |
|---------|------|------|
| 顶部导航带文字按钮（创建笔记本、分享、设置、应用） | 胶囊形（`border-radius: 24px`） | 保持现状 |
| 所有纯图标按钮（header-btn、send-btn、strip-add-btn、detail-back-btn 等） | 圆形（`border-radius: 50%`） | 统一改为圆形 |

### 主色联动

- `create-notebook-btn`：背景改为 `var(--primary-color)`（原黑色），跟随主题配色
- `send-btn`：背景改为 `var(--primary-color)`
- `strip-add-btn`：背景改为 `var(--primary-color)`
- `search-submit` hover：改为 `var(--primary-color)`

---

## 第三节：图标补充

### 新增图标

在 `src/renderer/components/icons/index.js` 补充以下图标：

| 图标名 | 用途 | SVG 路径方向 |
|--------|------|------------|
| `mindmap` | 思维导图（替换 `link`） | 中心节点 + 放射线 |
| `presentation` | 演示文稿（替换 `file-text`） | 屏幕 + 投影台 |
| `audio` | 音频概览 | 声波 / 耳机 |
| `table` | 数据表格 | 网格线 |

### 图标 strokeWidth 调整

所有 `header-btn` 内的图标 `strokeWidth` 从默认 2 改为 1.8，圆形背景下更精致。

---

## 第四节：国际化

### 文件位置

```
src/renderer/pages/industry/locales/
├── zh-CN.js
└── en-US.js
```

### 翻译键结构

```js
// zh-CN.js
export default {
  industry: {
    // 顶部导航
    nav: {
      createNotebook: '创建笔记本',
      share: '分享',
      settings: '设置',
      apps: '应用',
      fullscreen: '全屏',
      exitFullscreen: '退出全屏',
      editTitle: '点击编辑标题',
    },
    // 来源面板
    source: {
      title: '来源',
      add: '添加来源',
      searchPlaceholder: '在网络中搜索新来源',
      selectAll: '选择所有来源',
      guide: '来源指南',
      openExternal: '在外部打开源',
      back: '返回',
      web: 'Web',
      fastResearch: 'Fast Research',
    },
    // 对话面板
    chat: {
      title: '对话',
      welcome: '欢迎使用专业智能体',
      subtitle: '基于 NotebookLM 理念的智能工作空间',
      placeholder: '开始输入...',
      sources: '{count} 个来源',
    },
    // Studio 面板
    studio: {
      title: 'Studio',
      generated: '已生成',
      empty: '暂无成果',
      emptyHint: '与智能体对话后将在此生成',
      export: '导出',
      copy: '复制',
      delete: '删除',
      play: '播放',
      sources: '{count} 个来源',
      betaBadge: 'Beta 版',
    },
    // 成果类型
    types: {
      audio: '音频概览',
      presentation: '演示文稿',
      video: '视频概览',
      mindmap: '思维导图',
      report: '报告',
      flashcard: '闪卡',
      quiz: '测验',
      infographic: '信息图',
      table: '数据表格',
    }
  }
}
```

### 接入方式

每个子组件：
```js
import { useLocale } from '@composables/useLocale'
const { t } = useLocale()
```

模板中：`{{ t('industry.source.title') }}`

---

## 实现顺序

1. 补充图标（`icons/index.js`）
2. 创建 `useIndustryLayout.js`
3. 创建 industry locales 文件
4. 拆分 `SourcePanel.vue`
5. 拆分 `ChatPanel.vue`
6. 拆分 `StudioPanel.vue`
7. 重写 `IndustryWorkspace.vue` 主容器（接入主题、国际化）
8. 删除旧的冗余样式

---

## 验收标准

- [ ] 单文件不超过 400 行
- [ ] 无硬编码颜色值
- [ ] 无 `.dark-theme` 覆盖样式
- [ ] 深色/浅色切换正常响应
- [ ] 6 套配色方案切换正常响应
- [ ] 所有文字通过 `t()` 输出
- [ ] 拖拽 resize 行为与重构前一致
- [ ] 图标语义准确
