# Claude Code Desktop 设计系统规范

> 版本 1.0 | 精致工业风 (Refined Industrial)

## 设计理念

**核心原则**：
1. **低疲劳** - 长时间使用不刺眼，色彩克制
2. **高清晰** - 信息层次分明，交互状态明确
3. **跨平台** - macOS/Windows 视觉一致，尊重系统特性
4. **可定制** - 多主题切换，满足个人偏好

**设计语言**：精致工业风
- 圆角柔和但不过度（6-8px）
- 阴影轻盈有层次
- 图标线性统一
- 动效克制精准

---

## 1. 主题配色系统

### 1.1 五套主题方案

#### 🔥 Theme: Ember (当前默认 - 优化版)
温暖活力，Claude 品牌色

```css
/* Ember Light */
--theme-ember-light: {
  --primary: #E85A2D;           /* 降低饱和度，减少刺眼 */
  --primary-hover: #D14820;
  --primary-active: #B83D18;
  --primary-ghost: rgba(232, 90, 45, 0.08);
  --primary-ghost-hover: rgba(232, 90, 45, 0.15);

  --bg-base: #FAFAF8;           /* 微暖白，不刺眼 */
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F2F2EE;
  --bg-overlay: rgba(255, 255, 255, 0.85);

  --text-primary: #1A1A1A;
  --text-secondary: #5C5C5C;
  --text-tertiary: #8C8C8C;
  --text-inverse: #FFFFFF;

  --border-default: #E5E5E0;
  --border-hover: #D4D4CF;
  --border-focus: #E85A2D;

  --success: #2E9E5E;
  --warning: #D97706;
  --danger: #DC2626;
  --info: #2563EB;
}

/* Ember Dark */
--theme-ember-dark: {
  --primary: #FF7043;           /* 暗色下稍亮 */
  --primary-hover: #FF8A65;
  --primary-active: #E85A2D;
  --primary-ghost: rgba(255, 112, 67, 0.12);
  --primary-ghost-hover: rgba(255, 112, 67, 0.22);

  --bg-base: #141414;
  --bg-elevated: #1E1E1E;
  --bg-sunken: #0A0A0A;
  --bg-overlay: rgba(30, 30, 30, 0.92);

  --text-primary: #ECECEC;
  --text-secondary: #A3A3A3;
  --text-tertiary: #6B6B6B;
  --text-inverse: #141414;

  --border-default: #2E2E2E;
  --border-hover: #404040;
  --border-focus: #FF7043;

  --success: #34D399;
  --warning: #FBBF24;
  --danger: #F87171;
  --info: #60A5FA;
}
```

#### 🌊 Theme: Ocean
冷静专业，适合长时间编码

```css
/* Ocean Light */
--theme-ocean-light: {
  --primary: #2563EB;
  --primary-hover: #1D4ED8;
  --primary-active: #1E40AF;
  --primary-ghost: rgba(37, 99, 235, 0.08);
  --primary-ghost-hover: rgba(37, 99, 235, 0.15);

  --bg-base: #F8FAFC;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F1F5F9;
  --bg-overlay: rgba(255, 255, 255, 0.88);

  --text-primary: #0F172A;
  --text-secondary: #475569;
  --text-tertiary: #94A3B8;
  --text-inverse: #FFFFFF;

  --border-default: #E2E8F0;
  --border-hover: #CBD5E1;
  --border-focus: #2563EB;

  --success: #059669;
  --warning: #D97706;
  --danger: #DC2626;
  --info: #0284C7;
}

/* Ocean Dark */
--theme-ocean-dark: {
  --primary: #3B82F6;
  --primary-hover: #60A5FA;
  --primary-active: #2563EB;
  --primary-ghost: rgba(59, 130, 246, 0.12);
  --primary-ghost-hover: rgba(59, 130, 246, 0.22);

  --bg-base: #0F172A;
  --bg-elevated: #1E293B;
  --bg-sunken: #020617;
  --bg-overlay: rgba(30, 41, 59, 0.92);

  --text-primary: #F1F5F9;
  --text-secondary: #94A3B8;
  --text-tertiary: #64748B;
  --text-inverse: #0F172A;

  --border-default: #334155;
  --border-hover: #475569;
  --border-focus: #3B82F6;

  --success: #34D399;
  --warning: #FBBF24;
  --danger: #F87171;
  --info: #38BDF8;
}
```

#### 🌲 Theme: Forest
自然护眼，减少蓝光

```css
/* Forest Light */
--theme-forest-light: {
  --primary: #059669;
  --primary-hover: #047857;
  --primary-active: #065F46;
  --primary-ghost: rgba(5, 150, 105, 0.08);
  --primary-ghost-hover: rgba(5, 150, 105, 0.15);

  --bg-base: #F9FBF9;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F0F5F0;
  --bg-overlay: rgba(255, 255, 255, 0.88);

  --text-primary: #14251A;
  --text-secondary: #4A5D52;
  --text-tertiary: #7A8F82;
  --text-inverse: #FFFFFF;

  --border-default: #DCE7DE;
  --border-hover: #C5D6C9;
  --border-focus: #059669;

  --success: #059669;
  --warning: #B45309;
  --danger: #B91C1C;
  --info: #0369A1;
}

/* Forest Dark */
--theme-forest-dark: {
  --primary: #10B981;
  --primary-hover: #34D399;
  --primary-active: #059669;
  --primary-ghost: rgba(16, 185, 129, 0.12);
  --primary-ghost-hover: rgba(16, 185, 129, 0.22);

  --bg-base: #0D1512;
  --bg-elevated: #162019;
  --bg-sunken: #060A08;
  --bg-overlay: rgba(22, 32, 25, 0.92);

  --text-primary: #E8F0EB;
  --text-secondary: #9DB3A5;
  --text-tertiary: #5E7567;
  --text-inverse: #0D1512;

  --border-default: #243D2E;
  --border-hover: #365443;
  --border-focus: #10B981;

  --success: #34D399;
  --warning: #FCD34D;
  --danger: #FCA5A5;
  --info: #7DD3FC;
}
```

#### 💜 Theme: Violet
创意优雅，现代感

```css
/* Violet Light */
--theme-violet-light: {
  --primary: #7C3AED;
  --primary-hover: #6D28D9;
  --primary-active: #5B21B6;
  --primary-ghost: rgba(124, 58, 237, 0.08);
  --primary-ghost-hover: rgba(124, 58, 237, 0.15);

  --bg-base: #FAFAFC;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F3F2F7;
  --bg-overlay: rgba(255, 255, 255, 0.88);

  --text-primary: #1C1527;
  --text-secondary: #544D63;
  --text-tertiary: #8E86A0;
  --text-inverse: #FFFFFF;

  --border-default: #E5E2ED;
  --border-hover: #D4D0E0;
  --border-focus: #7C3AED;

  --success: #059669;
  --warning: #D97706;
  --danger: #DC2626;
  --info: #2563EB;
}

/* Violet Dark */
--theme-violet-dark: {
  --primary: #A78BFA;
  --primary-hover: #C4B5FD;
  --primary-active: #8B5CF6;
  --primary-ghost: rgba(167, 139, 250, 0.12);
  --primary-ghost-hover: rgba(167, 139, 250, 0.22);

  --bg-base: #13111C;
  --bg-elevated: #1E1A2E;
  --bg-sunken: #0A0910;
  --bg-overlay: rgba(30, 26, 46, 0.92);

  --text-primary: #EDE9FE;
  --text-secondary: #A5A0B8;
  --text-tertiary: #6B6580;
  --text-inverse: #13111C;

  --border-default: #312E45;
  --border-hover: #45415E;
  --border-focus: #A78BFA;

  --success: #34D399;
  --warning: #FBBF24;
  --danger: #F87171;
  --info: #60A5FA;
}
```

#### ⚫ Theme: Graphite
极简中性，零干扰

```css
/* Graphite Light */
--theme-graphite-light: {
  --primary: #525252;
  --primary-hover: #404040;
  --primary-active: #262626;
  --primary-ghost: rgba(82, 82, 82, 0.08);
  --primary-ghost-hover: rgba(82, 82, 82, 0.15);

  --bg-base: #FAFAFA;
  --bg-elevated: #FFFFFF;
  --bg-sunken: #F0F0F0;
  --bg-overlay: rgba(255, 255, 255, 0.88);

  --text-primary: #171717;
  --text-secondary: #525252;
  --text-tertiary: #A3A3A3;
  --text-inverse: #FFFFFF;

  --border-default: #E5E5E5;
  --border-hover: #D4D4D4;
  --border-focus: #525252;

  --success: #16A34A;
  --warning: #CA8A04;
  --danger: #DC2626;
  --info: #2563EB;
}

/* Graphite Dark */
--theme-graphite-dark: {
  --primary: #A3A3A3;
  --primary-hover: #D4D4D4;
  --primary-active: #737373;
  --primary-ghost: rgba(163, 163, 163, 0.12);
  --primary-ghost-hover: rgba(163, 163, 163, 0.22);

  --bg-base: #141414;
  --bg-elevated: #1F1F1F;
  --bg-sunken: #0A0A0A;
  --bg-overlay: rgba(31, 31, 31, 0.92);

  --text-primary: #EDEDED;
  --text-secondary: #A3A3A3;
  --text-tertiary: #666666;
  --text-inverse: #141414;

  --border-default: #2E2E2E;
  --border-hover: #404040;
  --border-focus: #A3A3A3;

  --success: #4ADE80;
  --warning: #FACC15;
  --danger: #F87171;
  --info: #60A5FA;
}
```

---

## 2. 图标系统

### 2.1 设计原则

- **风格**：线性图标，2px 描边，圆角端点
- **尺寸**：16px (紧凑) / 20px (默认) / 24px (强调)
- **颜色**：继承 `currentColor`，随文字/主题变化
- **视觉重量**：保持一致，避免某些图标过重或过轻

### 2.2 核心图标 SVG

```html
<!-- 刷新 / Refresh -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 10a7 7 0 1 1 1.5 4.3"/>
  <path d="M3 15V10h5"/>
</svg>

<!-- 搜索 / Search -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="8.5" cy="8.5" r="5.5"/>
  <path d="M13 13l4 4"/>
</svg>

<!-- 导入 / Import -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 3v10m0 0l-3-3m3 3l3-3"/>
  <path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>
</svg>

<!-- 导出 / Export -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 13V3m0 0L7 6m3-3l3 3"/>
  <path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>
</svg>

<!-- 添加 / Add -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M10 4v12M4 10h12"/>
</svg>

<!-- 关闭 / Close -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <path d="M5 5l10 10M15 5L5 15"/>
</svg>

<!-- 编辑 / Edit -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3l5 5-9 9H3v-5l9-9z"/>
</svg>

<!-- 删除 / Delete -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 6h12M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/>
  <path d="M5 6l1 11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-11"/>
  <path d="M8 9v5M12 9v5"/>
</svg>

<!-- 设置 / Settings -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <circle cx="10" cy="10" r="2.5"/>
  <path d="M10 2v2.5M10 15.5V18M18 10h-2.5M4.5 10H2M15.66 4.34l-1.77 1.77M6.11 13.89l-1.77 1.77M15.66 15.66l-1.77-1.77M6.11 6.11L4.34 4.34"/>
</svg>

<!-- 展开 / Expand -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 8l4 4 4-4"/>
</svg>

<!-- 收起 / Collapse -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 12l4-4 4 4"/>
</svg>

<!-- 外部链接 / External Link -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M11 3h6v6M17 3L8 12M14 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>
</svg>

<!-- 复制 / Copy -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="6" y="6" width="11" height="11" rx="1"/>
  <path d="M3 14V4a1 1 0 0 1 1-1h10"/>
</svg>

<!-- 文件夹 / Folder -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5z"/>
</svg>

<!-- 终端 / Terminal -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="2" y="3" width="16" height="14" rx="2"/>
  <path d="M5 8l3 2-3 2M10 12h4"/>
</svg>

<!-- 播放 / Play -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 4l10 6-10 6V4z"/>
</svg>

<!-- 停止 / Stop -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="4" y="4" width="12" height="12" rx="1"/>
</svg>

<!-- 用户 / User -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="10" cy="6" r="3"/>
  <path d="M4 18v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/>
</svg>

<!-- 插件 / Plugin -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="3" y="3" width="14" height="14" rx="2"/>
  <path d="M7 7h6M7 10h6M7 13h4"/>
</svg>

<!-- 机器人 / Bot -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <rect x="4" y="6" width="12" height="10" rx="2"/>
  <path d="M10 2v4M7 10h.01M13 10h.01M8 14h4"/>
</svg>

<!-- 更多 / More -->
<svg viewBox="0 0 20 20" fill="currentColor">
  <circle cx="4" cy="10" r="1.5"/>
  <circle cx="10" cy="10" r="1.5"/>
  <circle cx="16" cy="10" r="1.5"/>
</svg>

<!-- 勾选 / Check -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 10l4 4 8-8"/>
</svg>

<!-- 警告 / Warning -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M10 3L2 17h16L10 3z"/>
  <path d="M10 8v4M10 14v.01"/>
</svg>

<!-- 信息 / Info -->
<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="10" cy="10" r="7"/>
  <path d="M10 9v4M10 7v.01"/>
</svg>
```

### 2.3 图标尺寸规范

| 场景 | 尺寸 | 用途 |
|------|------|------|
| 紧凑 | 16px | Tab 关闭按钮、行内操作 |
| 默认 | 20px | 工具栏按钮、列表图标 |
| 强调 | 24px | 空状态、模态框标题 |

---

## 3. 按钮与交互状态

### 3.1 图标按钮（重点：hover 清晰度）

**核心问题**：小按钮 hover 时背景色覆盖图标，导致看不清

**解决方案**：「光晕悬停」效果 - 使用半透明背景 + 轻微放大

```css
/* 图标按钮基础样式 */
.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
}

.icon-btn svg {
  width: 18px;
  height: 18px;
  transition: transform 0.15s ease;
}

/* ✅ 正确的 hover 效果：光晕背景，图标始终清晰 */
.icon-btn:hover {
  background: var(--primary-ghost-hover);  /* 半透明主色 */
  color: var(--primary);                    /* 图标变主色 */
}

.icon-btn:hover svg {
  transform: scale(1.05);  /* 轻微放大增强存在感 */
}

/* Active 状态 */
.icon-btn:active {
  background: var(--primary-ghost);
  transform: scale(0.95);
}

/* 危险操作按钮 */
.icon-btn--danger:hover {
  background: rgba(220, 38, 38, 0.12);
  color: var(--danger);
}

/* 禁用状态 */
.icon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.icon-btn:disabled:hover {
  background: transparent;
  transform: none;
}

/* 紧凑尺寸（Tab 关闭按钮等） */
.icon-btn--sm {
  width: 22px;
  height: 22px;
  border-radius: 4px;
}
.icon-btn--sm svg {
  width: 14px;
  height: 14px;
}
```

### 3.2 常规按钮

```css
/* 按钮基础 */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1;
  border-radius: 6px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.15s ease;
  font-family: inherit;
}

/* 主要按钮 */
.btn--primary {
  background: var(--primary);
  color: var(--text-inverse);
  border-color: var(--primary);
}
.btn--primary:hover {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
}
.btn--primary:active {
  background: var(--primary-active);
  border-color: var(--primary-active);
}

/* 次要按钮 */
.btn--secondary {
  background: transparent;
  color: var(--text-primary);
  border-color: var(--border-default);
}
.btn--secondary:hover {
  background: var(--bg-sunken);
  border-color: var(--border-hover);
}

/* 幽灵按钮（无边框） */
.btn--ghost {
  background: transparent;
  color: var(--text-secondary);
  border-color: transparent;
}
.btn--ghost:hover {
  background: var(--primary-ghost-hover);
  color: var(--primary);
}

/* 危险按钮 */
.btn--danger {
  background: var(--danger);
  color: white;
  border-color: var(--danger);
}
.btn--danger:hover {
  background: #B91C1C;
  border-color: #B91C1C;
}

/* 禁用状态 */
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
```

### 3.3 macOS 风格适配

```css
/* macOS 特有样式 */
@supports (-webkit-backdrop-filter: blur(10px)) {
  .macos {
    /* 毛玻璃效果 */
    --glass-bg: rgba(255, 255, 255, 0.72);
    --glass-bg-dark: rgba(30, 30, 30, 0.78);
  }

  .macos .sidebar,
  .macos .toolbar {
    background: var(--glass-bg);
    -webkit-backdrop-filter: blur(20px);
    backdrop-filter: blur(20px);
  }

  .macos.dark .sidebar,
  .macos.dark .toolbar {
    background: var(--glass-bg-dark);
  }
}

/* 窗口控制按钮区域留白（macOS 红绿灯） */
.macos .titlebar {
  padding-left: 78px;  /* 为红绿灯按钮留空间 */
}

/* 圆角适配 */
.macos .card,
.macos .modal {
  border-radius: 10px;  /* macOS 偏好更大圆角 */
}

/* 阴影适配 */
.macos .elevated {
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.04),
    0 2px 8px rgba(0, 0, 0, 0.08),
    0 8px 24px rgba(0, 0, 0, 0.06);
}
```

---

## 4. 组件规范

### 4.1 卡片

```css
.card {
  background: var(--bg-elevated);
  border: 1px solid var(--border-default);
  border-radius: 8px;
  padding: 16px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.card:hover {
  border-color: var(--border-hover);
}

.card--interactive:hover {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-ghost);
}

.card__header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;
}

.card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.card__subtitle {
  font-size: 12px;
  color: var(--text-tertiary);
}
```

### 4.2 输入框

```css
.input {
  width: 100%;
  height: 32px;
  padding: 0 10px;
  font-size: 13px;
  color: var(--text-primary);
  background: var(--bg-base);
  border: 1px solid var(--border-default);
  border-radius: 6px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.input::placeholder {
  color: var(--text-tertiary);
}

.input:hover {
  border-color: var(--border-hover);
}

.input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-ghost);
}

.input--error {
  border-color: var(--danger);
}
.input--error:focus {
  box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12);
}
```

### 4.3 标签页

```css
.tabs {
  display: flex;
  gap: 2px;
  padding: 4px;
  background: var(--bg-sunken);
  border-radius: 8px;
}

.tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-secondary);
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.tab:hover {
  color: var(--text-primary);
  background: var(--bg-elevated);
}

.tab--active {
  color: var(--primary);
  background: var(--bg-elevated);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}
```

### 4.4 模态框

```css
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  animation: fadeIn 0.15s ease;
}

.modal {
  width: 90%;
  max-width: 480px;
  max-height: 85vh;
  background: var(--bg-elevated);
  border-radius: 12px;
  box-shadow:
    0 0 0 1px rgba(0, 0, 0, 0.05),
    0 10px 40px rgba(0, 0, 0, 0.2);
  overflow: hidden;
  animation: slideUp 0.2s ease;
}

.modal__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border-default);
}

.modal__title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-primary);
}

.modal__body {
  padding: 20px;
  overflow-y: auto;
}

.modal__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 20px;
  border-top: 1px solid var(--border-default);
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(10px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}
```

---

## 5. 字体规范

### 5.1 当前问题

项目中存在字体不统一的问题：

| 位置 | 当前使用 | 问题 |
|------|----------|------|
| UI 字体 | `Plus Jakarta Sans` + 系统字体 | 需要加载外部字体 |
| 终端字体 | `Ubuntu Mono` | 单一选择 |
| 代码块 | `Consolas`, `Monaco`, `SF Mono` 混用 | fallback 顺序不一致 |
| 特殊 | `Crimson Pro` (serif) | 与整体风格不符 |

### 5.2 统一字体栈

```css
:root {
  /* ========== 字体族 ========== */

  /* UI 字体 - 优先系统字体，无需加载外部资源 */
  --font-ui: -apple-system, BlinkMacSystemFont, "Segoe UI",
             "PingFang SC", "Microsoft YaHei", "Noto Sans SC",
             sans-serif;

  /* 等宽字体 - 终端 + 代码块统一使用（用户可配置）
   *
   * 设计决策：终端字体 = 代码块字体，用户只需设置一次
   * 来源：config.settings.terminal.fontFamily
   * 默认值：见下方 fallback
   */
  --font-mono: "JetBrains Mono", "Cascadia Code", "SF Mono",
               "Consolas", "Monaco", "Ubuntu Mono", monospace;

  /* ========== 字号系统 ========== */
  --text-xs: 11px;     /* 辅助信息、徽章 */
  --text-sm: 12px;     /* 次要文本、标签 */
  --text-base: 13px;   /* 正文默认 */
  --text-lg: 14px;     /* 强调文本、列表项 */
  --text-xl: 16px;     /* 小标题 */
  --text-2xl: 18px;    /* 大标题 */
  --text-3xl: 24px;    /* 页面标题 */

  /* 终端专用字号（可由用户设置覆盖） */
  --terminal-font-size: 14px;

  /* ========== 行高 ========== */
  --leading-none: 1;
  --leading-tight: 1.25;
  --leading-snug: 1.375;
  --leading-normal: 1.5;
  --leading-relaxed: 1.625;
  --leading-loose: 2;

  /* ========== 字重 ========== */
  --font-normal: 400;
  --font-medium: 500;
  --font-semibold: 600;
  --font-bold: 700;

  /* ========== 字间距 ========== */
  --tracking-tight: -0.025em;
  --tracking-normal: 0;
  --tracking-wide: 0.025em;
}

/* 基础字体应用 */
body {
  font-family: var(--font-ui);
  font-size: var(--text-base);
  line-height: var(--leading-normal);
  font-weight: var(--font-normal);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* 代码相关元素 - 统一使用 --font-mono */
code, kbd, pre, samp, .mono {
  font-family: var(--font-mono);
}

/* 终端组件 - 同样使用 --font-mono */
.terminal, .xterm {
  font-family: var(--font-mono);
  font-size: var(--terminal-font-size);
}
```

### 5.3 实现方案

```javascript
// 在 Vue 组件中动态设置 --font-mono
// 当用户更改终端字体设置时，同步更新 CSS 变量

const updateMonoFont = (fontFamily) => {
  document.documentElement.style.setProperty('--font-mono', fontFamily)
}

// 初始化时从配置读取
const terminalSettings = await window.electronAPI.getTerminalSettings()
if (terminalSettings?.fontFamily) {
  updateMonoFont(terminalSettings.fontFamily)
}
```

### 5.4 平台特定优化

```css
/* macOS 特定优化 */
@supports (-webkit-backdrop-filter: blur(1px)) {
  :root {
    /* macOS 使用 SF 字体系列 */
    --font-ui: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif;
  }
}

/* Windows 特定优化 */
@media screen and (-ms-high-contrast: active), (-ms-high-contrast: none) {
  :root {
    --font-ui: "Segoe UI", "Microsoft YaHei", sans-serif;
  }
}
```

### 5.5 迁移检查清单

需要统一替换的位置：

- [ ] `src/renderer/pages/main/components/LeftPanel.vue` - 移除 `Crimson Pro`
- [ ] `src/renderer/pages/main/components/TerminalTab.vue` - 使用 `var(--font-mono)`
- [ ] `src/renderer/components/ProviderCard.vue:123` - 改用 `var(--font-mono)`
- [ ] `src/renderer/pages/main/components/MainContent.vue:536` - 改用 `var(--font-mono)`
- [ ] `src/renderer/pages/custom-models/components/CustomModelsContent.vue:301` - 改用 `var(--font-mono)`
- [ ] `src/renderer/pages/main/components/RightPanel/tabs/AITab.vue:811` - 改用 `var(--font-mono)`
- [ ] 所有 `font-family: monospace` → `var(--font-mono)`
- [ ] 初始化时从用户设置同步 `--font-mono` CSS 变量

---

## 6. 间距与布局

```css
:root {
  /* 间距 */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  /* 圆角 */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
  --radius-xl: 12px;

  /* 阴影 */
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.12);

  /* 过渡 */
  --transition-fast: 0.1s ease;
  --transition-normal: 0.15s ease;
  --transition-slow: 0.25s ease;
}
```

---

## 7. 动效规范

```css
/* 基础过渡 */
.transition-colors {
  transition: color var(--transition-normal),
              background-color var(--transition-normal),
              border-color var(--transition-normal);
}

.transition-transform {
  transition: transform var(--transition-normal);
}

.transition-all {
  transition: all var(--transition-normal);
}

/* 进入动画 */
@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes slideInUp {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes scaleIn {
  from {
    opacity: 0;
    transform: scale(0.95);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}

/* 加载动画 */
@keyframes spin {
  to { transform: rotate(360deg); }
}

.animate-spin {
  animation: spin 1s linear infinite;
}

/* 脉冲效果（用于状态指示） */
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.animate-pulse {
  animation: pulse 2s ease-in-out infinite;
}
```

---

## 8. 实施建议

### 8.1 优先级

1. **P0 - 立即修复**
   - 图标按钮 hover 效果（使用光晕悬停）
   - 硬编码颜色替换为 CSS 变量

2. **P1 - 短期优化**
   - 统一图标为 SVG 组件
   - 扩展 CSS 变量（danger、success、muted 等）

3. **P2 - 中期完善**
   - 实现多主题切换功能
   - 添加主题持久化设置

### 8.2 文件结构建议

```
src/renderer/
├── styles/
│   ├── variables.css      # CSS 变量定义
│   ├── themes/
│   │   ├── ember.css      # Ember 主题
│   │   ├── ocean.css      # Ocean 主题
│   │   ├── forest.css     # Forest 主题
│   │   ├── violet.css     # Violet 主题
│   │   └── graphite.css   # Graphite 主题
│   ├── base.css           # 基础样式重置
│   └── components.css     # 通用组件样式
├── components/
│   └── icons/
│       └── Icon.vue       # 统一图标组件
```

---

## 附录：Naive UI 主题覆盖示例

```javascript
// theme/claude-theme.js
export const createThemeOverrides = (themeName, isDark) => {
  const themes = {
    ember: { primary: isDark ? '#FF7043' : '#E85A2D' },
    ocean: { primary: isDark ? '#3B82F6' : '#2563EB' },
    forest: { primary: isDark ? '#10B981' : '#059669' },
    violet: { primary: isDark ? '#A78BFA' : '#7C3AED' },
    graphite: { primary: isDark ? '#A3A3A3' : '#525252' },
  }

  const { primary } = themes[themeName]

  return {
    common: {
      primaryColor: primary,
      primaryColorHover: adjustColor(primary, isDark ? 15 : -10),
      primaryColorPressed: adjustColor(primary, isDark ? -10 : -20),
      // ... 其他覆盖
    },
    Button: {
      // ...
    },
    // ... 其他组件
  }
}
```
