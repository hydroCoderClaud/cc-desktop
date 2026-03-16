# NotebookWorkspace 重构设计文档

**日期**：2026-03-14
**分支**：feature/industry-agent-demo
**状态**：待实现

---

## 背景

`NotebookWorkspace.vue` 当前 2200+ 行，存在以下问题：

1. 单文件过大，违反模块化原则
2. 所有颜色硬编码，未接入工程主题系统
3. 大量 `.dark-theme .xxx` 重复覆盖样式（约占 40%）
4. 所有文字硬编码中文，未接入国际化框架
5. 图标语义不准确（`link` 用作思维导图，`file-text` 同时用于报告和演示文稿）

---

## 第一节：架构拆分

### 目标文件结构

```
src/renderer/pages/notebook/
├── components/
│   ├── NotebookWorkspace.vue     # 主容器：三栏布局 + resize 分隔条 + 顶部导航
│   ├── SourcePanel.vue           # 左侧来源面板（列表视图 + 详情视图）
│   ├── ChatPanel.vue             # 中间对话区域
│   └── StudioPanel.vue           # 右侧 Studio 面板（类型网格 + 成果详情）
└── composables/
    └── useNotebookLayout.js      # resize 逻辑、面板展开/收起、宽度自动调整
```

国际化翻译直接合并到全局 locales（见第四节），无需独立目录。

### 各文件职责

| 文件 | 职责 | 预估行数 |
|------|------|---------|
| `NotebookWorkspace.vue` | 三栏容器、顶部导航、resize 分隔条 | ~150 行 |
| `SourcePanel.vue` | 来源列表、搜索、详情展开/收起 | ~300 行 |
| `ChatPanel.vue` | 对话区域、输入框、欢迎页 | ~150 行 |
| `StudioPanel.vue` | 类型网格、成果列表、成果详情 | ~300 行 |
| `useNotebookLayout.js` | resize 逻辑、宽度状态、面板展开自动调整 | ~80 行 |

### 组件通信

`useNotebookLayout.js` 作为共享状态，所有组件直接 import 使用（无需 props 传递）：

```js
// useNotebookLayout.js 导出接口
export function useNotebookLayout() {
  const leftWidth = ref(320)
  const rightWidth = ref(340)
  const showLeftPanel = ref(true)
  const showRightPanel = ref(true)

  // 展开详情时自动扩展面板到容器 2/5
  const expandPanel = (side) => {
    const containerWidth = document.querySelector('.panels-container')?.offsetWidth || window.innerWidth
    const targetWidth = Math.round(containerWidth * 2 / 5)
    if (side === 'left') leftWidth.value = targetWidth
    else rightWidth.value = targetWidth
  }

  // 收起详情时恢复默认宽度
  const collapsePanel = (side) => {
    if (side === 'left') leftWidth.value = 320
    else rightWidth.value = 340
  }

  // resize 分隔条拖拽（左侧不影响右侧，右侧不影响左侧）
  const startResize = (side, e) => { /* ... */ }

  return { leftWidth, rightWidth, showLeftPanel, showRightPanel, expandPanel, collapsePanel, startResize }
}
```

---

## 第二节：主题系统接入

### 原则

- 完全删除所有 `.dark-theme .xxx` 硬编码覆盖
- 所有颜色改用 CSS 变量，响应 `useTheme` 的深浅模式和 6 套配色方案
- 不破坏工程其他页面

### CSS 变量映射（全部来自现有 useTheme，无需新增）

| 用途 | CSS 变量 |
|------|---------|
| 整体背景 | `var(--bg-color)` |
| 面板背景 | `var(--bg-color-secondary)` |
| 摘要卡片/搜索框背景 | `var(--bg-color-tertiary)` |
| 分隔线 | `var(--border-color)` |
| 主文字 | `var(--text-color)` |
| 次要文字 | `var(--text-color-secondary)` |
| 静默文字 | `var(--text-color-muted)` |
| hover 背景 | `var(--hover-bg)` |
| 主色按钮背景 | `var(--primary-color)` |
| 主色 hover | `var(--primary-color-hover)` |
| 主色浅背景 | `var(--primary-ghost)` |
| 危险色 | `var(--danger-color)` |
| 阴影 | `var(--shadow-color)` |

### 样式模板

每个子组件的样式遵循此模式，无任何 `.dark-theme` 覆盖：

```css
.panel-header {
  background: var(--bg-color-secondary);
  color: var(--text-color);
  border-bottom: 1px solid var(--border-color);
}

.source-item:hover {
  background: var(--hover-bg);
}

.send-btn {
  background: var(--primary-color);
  color: #fff;
}

.send-btn:hover {
  background: var(--primary-color-hover);
}
```

### 按钮形状规范

| 按钮类型 | 形状 | 尺寸 | 说明 |
|---------|------|------|------|
| 顶部导航带文字按钮（创建笔记本、分享、设置、应用） | 胶囊形 `border-radius: 24px` | 自适应 | 保持现状 |
| 所有纯图标按钮（header-btn、send-btn、detail-back-btn 等） | 圆形 `border-radius: 50%` | 32×32px | 统一改为圆形 |
| send-btn（发送） | 圆形 `border-radius: 50%` | 40×40px | 稍大，主操作 |

圆形按钮统一使用 `display: flex; align-items: center; justify-content: center`。

### 主色联动

- `create-notebook-btn`：背景改为 `var(--primary-color)`（原黑色），跟随主题配色
- `send-btn`：背景改为 `var(--primary-color)`
- `search-submit` hover：改为 `var(--primary-color)`

---

## 第三节：图标补充

### 新增图标（在 `src/renderer/components/icons/index.js` 补充）

基于 20×20 viewBox，stroke-based，与现有图标风格一致：

| 图标名 | 用途 | SVG 路径描述 |
|--------|------|------------|
| `mindmap` | 思维导图（替换 `link`） | 中心圆 + 4条放射线 + 端点圆 |
| `presentation` | 演示文稿（替换 `file-text`） | 矩形屏幕 + 底部支架三角 |
| `audio` | 音频概览（补充缺失） | 耳机形状（弧形 + 两侧耳罩） |
| `table` | 数据表格（补充缺失） | 3×3 网格线 |

### strokeWidth 实现方式

在各子组件的 `<Icon>` 标签上按需传入，不新建包装组件：

```html
<!-- header-btn 内的图标，圆形背景下更精致 -->
<button class="header-btn">
  <Icon name="panelLeft" :size="18" :strokeWidth="1.8" />
</button>

<!-- 普通列表图标保持默认 strokeWidth="2" -->
<Icon name="search" :size="18" />
```

---

## 第四节：国际化

### 集成方案

**选方案 A**：直接合并到全局 locales，无需新目录，`useLocale()` 开箱即用。

在 `src/renderer/locales/zh-CN.js` 和 `en-US.js` 中追加 `notebook` 命名空间。

### 翻译键结构

```js
// 追加到 src/renderer/locales/zh-CN.js
notebook: {
  nav: {
    createNotebook: '创建笔记本',
    share: '分享',
    settings: '设置',
    apps: '应用',
    fullscreen: '全屏',
    exitFullscreen: '退出全屏',
    editTitle: '点击编辑标题',
  },
  source: {
    title: '来源',
    add: '添加来源',
    searchPlaceholder: '在网络中搜索新来源',
    selectAll: '选择所有来源',
    guide: '来源指南',
    openExternal: '在外部打开源',
    web: 'Web',
    fastResearch: 'Fast Research',
  },
  chat: {
    title: '对话',
    welcome: '欢迎使用专业智能体',
    subtitle: '基于 NotebookLM 理念的智能工作空间',
    placeholder: '开始输入...',
    sources: '{count} 个来源',
  },
  studio: {
    title: 'Studio',
    generated: '已生成',
    empty: '暂无成果',
    emptyHint: '与智能体对话后将在此生成',
    export: '导出',
    copy: '复制',
    delete: '删除',
    play: '播放',
    betaBadge: 'Beta 版',
  },
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
```

### 接入方式

```js
import { useLocale } from '@composables/useLocale'
const { t } = useLocale()
// 模板中：{{ t('notebook.source.title') }}
```

---

## 实现顺序（含依赖关系）

```
1. 补充图标 icons/index.js          ← 无依赖
2. 追加全局 locales（zh-CN/en-US）  ← 无依赖
3. 创建 useNotebookLayout.js        ← 无依赖
      ↓
4. 拆分 SourcePanel.vue             ← 依赖 1、2、3
5. 拆分 ChatPanel.vue               ← 依赖 2、3
6. 拆分 StudioPanel.vue             ← 依赖 1、2、3
      ↓
7. 重写 NotebookWorkspace.vue       ← 依赖 4、5、6
8. 删除旧冗余样式                    ← 依赖 7 完成且测试通过
```

---

## 验收标准

### 行数

| 文件 | 上限 |
|------|------|
| `NotebookWorkspace.vue` | 150 行 |
| `SourcePanel.vue` | 300 行 |
| `ChatPanel.vue` | 150 行 |
| `StudioPanel.vue` | 300 行 |
| `useNotebookLayout.js` | 80 行 |

### 代码质量

- [ ] `grep -r '#[0-9a-fA-F]\{3,6\}' src/renderer/pages/notebook/` 无结果（无硬编码颜色）
- [ ] `grep -r '\.dark-theme' src/renderer/pages/notebook/` 无结果
- [ ] `grep -r 'hardcoded\|TODO' src/renderer/pages/notebook/` 无结果

### 功能测试

- [ ] 深色/浅色切换：所有颜色立即响应，无闪烁
- [ ] 6 套配色方案切换：主色按钮、链接等立即更新
- [ ] 语言切换 zh-CN ↔ en-US：所有文字正确切换
- [ ] 拖拽 resize：左侧拖拽不影响右侧位置，右侧拖拽不影响左侧位置
- [ ] 展开来源详情：左侧面板自动扩展到容器 2/5，关闭后恢复 320px
- [ ] 展开成果详情：右侧面板自动扩展到容器 2/5，关闭后恢复 340px
- [ ] 图标语义：mindmap/presentation/audio/table 四个新图标正确显示
- [ ] 圆形按钮：所有纯图标按钮为圆形，带文字按钮为胶囊形
