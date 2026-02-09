/**
 * 统一图标系统
 * 所有图标基于 20x20 viewBox，stroke-based 设计
 * 使用方式：<Icon name="refresh" :size="20" />
 */

// 图标 SVG 路径定义
export const iconPaths = {
  // 操作类
  // 紧凑循环：双弧 + 箭头，半径6更紧凑
  refresh: '<path d="M4 10a6 6 0 0 1 6-6"/><path d="M16 10a6 6 0 0 1-6 6"/><path d="M10 4l2.5 1.5-2.5 1.5"/><path d="M10 16l-2.5-1.5 2.5-1.5"/>',
  search: '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M13 13l4 4"/>',
  add: '<path d="M10 4v12M4 10h12"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  edit: '<path d="M12 3l5 5-9 9H3v-5l9-9z"/>',
  delete: '<path d="M4 6h12M6 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M5 6l1 11a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-11"/><path d="M8 9v5M12 9v5"/>',
  copy: '<rect x="6" y="6" width="11" height="11" rx="1"/><path d="M3 14V4a1 1 0 0 1 1-1h10"/>',

  // 导入导出
  import: '<path d="M10 3v10m0 0l-3-3m3 3l3-3"/><path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>',
  export: '<path d="M10 13V3m0 0L7 6m3-3l3 3"/><path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>',
  download: '<path d="M10 3v10m0 0l-3-3m3 3l3-3"/><path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>',
  upload: '<path d="M10 13V3m0 0L7 6m3-3l3 3"/><path d="M3 14v2a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-2"/>',

  // 导航类
  chevronDown: '<path d="M6 8l4 4 4-4"/>',
  chevronUp: '<path d="M6 12l4-4 4 4"/>',
  chevronLeft: '<path d="M12 6l-4 4 4 4"/>',
  chevronRight: '<path d="M8 6l4 4-4 4"/>',
  externalLink: '<path d="M11 3h6v6M17 3L8 12M14 11v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',

  // 文件类
  folder: '<path d="M3 5a1 1 0 0 1 1-1h4l2 2h6a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5z"/>',
  folderOpen: '<path d="M4 4h4l2 2h7a1 1 0 0 1 1 1v2H3V5a1 1 0 0 1 1-1z"/><path d="M2 9h16l-2 8H4L2 9z"/>',
  file: '<path d="M6 2h6l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/>',
  // 文件+文字：打开文本文件
  fileText: '<path d="M6 2h6l4 4v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M12 2v4h4"/><path d="M7 9h6M7 12h6M7 15h4"/>',

  // 终端类
  terminal: '<rect x="2" y="3" width="16" height="14" rx="2"/><path d="M5 8l3 2-3 2M10 12h4"/>',
  play: '<path d="M6 4l10 6-10 6V4z"/>',
  stop: '<rect x="4" y="4" width="12" height="12" rx="1"/>',
  pause: '<path d="M6 4v12M14 4v12"/>',

  // 用户类
  user: '<circle cx="10" cy="6" r="3"/><path d="M4 18v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/>',
  robot: '<rect x="4" y="6" width="12" height="10" rx="3"/><path d="M7 4v2M13 4v2"/><circle cx="7" cy="3" r="1"/><circle cx="13" cy="3" r="1"/><path d="M7 10h.01M13 10h.01"/><path d="M8 13.5q2 1.5 4 0"/>',

  // 状态类
  check: '<path d="M4 10l4 4 8-8" stroke-width="2.5"/>',
  warning: '<path d="M10 3L2 17h16L10 3z"/><path d="M10 8v4M10 14v.01"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v4M10 7v.01"/>',
  error: '<circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/>',

  // 设置类
  // 6齿长城齿轮：方形齿像城墙垛口，和太阳图标区分明显
  settings: '<circle cx="10" cy="10" r="2.5"/><path d="M11.5 4.5L12 2.5H8L8.5 4.5L6 6L4.5 4.5L2.5 8L4.5 8.5L4.5 11.5L2.5 12L4.5 15.5L6 14L8.5 15.5L8 17.5H12L11.5 15.5L14 14L15.5 15.5L17.5 12L15.5 11.5L15.5 8.5L17.5 8L15.5 4.5L14 6Z"/>',
  wrench: '<path d="M14.7 3.3a5 5 0 0 0-6.3 6.3L3.7 14.3a1.5 1.5 0 0 0 0 2.1l0 0a1.5 1.5 0 0 0 2.1 0l4.7-4.7a5 5 0 0 0 6.3-6.3l-2.8 2.8-2.1-2.1 2.8-2.8z"/>',
  // 齿轮（复杂版本，带锯齿边缘）
  gear: '<path d="M10 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M17.4 10c0-.4 0-.7-.1-1l1.5-1.2-1.5-2.6-1.8.6c-.5-.4-1-.7-1.7-.9L13.5 3h-3l-.3 1.9c-.6.2-1.2.5-1.7.9l-1.8-.6-1.5 2.6L6.7 9c-.1.3-.1.7-.1 1s0 .7.1 1l-1.5 1.2 1.5 2.6 1.8-.6c.5.4 1 .7 1.7.9l.3 1.9h3l.3-1.9c.6-.2 1.2-.5 1.7-.9l1.8.6 1.5-2.6-1.5-1.2c.1-.3.1-.7.1-1z"/>',
  sliders: '<path d="M4 6h4M12 6h4M4 10h8M16 10h0M4 14h2M10 14h6"/><circle cx="10" cy="6" r="2"/><circle cx="14" cy="10" r="2"/><circle cx="8" cy="14" r="2"/>',

  // 功能类
  plugin: '<path d="M9 2v3M15 2v3M9 15v3M15 15v3"/><rect x="5" y="5" width="14" height="10" rx="2"/>',
  skill: '<path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L5.1 17l.9-5.3-4-3.9 5.5-.8L10 2z"/>',
  hook: '<path d="M10 2v6a4 4 0 0 0 4 4h4"/><path d="M14 8l4 4-4 4"/>',
  agent: '<circle cx="10" cy="8" r="4"/><path d="M4 18c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M10 4V2M14 5l1-1.7M16 8h2"/>',
  mcp: '<circle cx="10" cy="10" r="3"/><path d="M10 3v4M10 13v4M3 10h4M13 10h4"/>',
  prompt: '<path d="M4 4h12v12H4z" rx="1"/><path d="M7 8h6M7 12h4"/>',

  // 工具类
  api: '<path d="M6 8h8M6 12h8"/><rect x="3" y="4" width="14" height="12" rx="2"/>',
  key: '<circle cx="8" cy="8" r="3"/><path d="M10.5 10.5L17 17M14 14l2 2"/>',
  lock: '<rect x="5" y="9" width="10" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0v3"/>',
  unlock: '<rect x="5" y="9" width="10" height="8" rx="1"/><path d="M7 9V6a3 3 0 0 1 6 0"/>',

  // 界面类
  menu: '<path d="M3 6h14M3 10h14M3 14h14"/>',
  moreHorizontal: '<circle cx="5" cy="10" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="15" cy="10" r="1"/>',
  moreVertical: '<circle cx="10" cy="5" r="1"/><circle cx="10" cy="10" r="1"/><circle cx="10" cy="15" r="1"/>',
  grip: '<circle cx="6" cy="6" r="1"/><circle cx="14" cy="6" r="1"/><circle cx="6" cy="10" r="1"/><circle cx="14" cy="10" r="1"/><circle cx="6" cy="14" r="1"/><circle cx="14" cy="14" r="1"/>',

  // 主题类
  sun: '<circle cx="10" cy="10" r="3"/><path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.93 4.93l1.41 1.41M13.66 13.66l1.41 1.41M4.93 15.07l1.41-1.41M13.66 6.34l1.41-1.41"/>',
  moon: '<path d="M17 10a7 7 0 1 1-7-7 5 5 0 0 0 7 7z"/>',

  // 收藏类
  star: '<path d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L5.1 17l.9-5.3-4-3.9 5.5-.8L10 2z"/>',
  starFilled: '<path fill="currentColor" d="M10 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6L5.1 17l.9-5.3-4-3.9 5.5-.8L10 2z"/>',
  heart: '<path d="M10 17l-6.5-6.5a4 4 0 1 1 6.5-4 4 4 0 1 1 6.5 4L10 17z"/>',

  // 箭头类
  arrowUp: '<path d="M10 16V4M5 9l5-5 5 5"/>',
  arrowDown: '<path d="M10 4v12M5 11l5 5 5-5"/>',
  arrowLeft: '<path d="M16 10H4M9 5l-5 5 5 5"/>',
  arrowRight: '<path d="M4 10h12M11 5l5 5-5 5"/>',

  // 双箭头（分页用）
  chevronDoubleLeft: '<path d="M11 6l-4 4 4 4M17 6l-4 4 4 4"/>',
  chevronDoubleRight: '<path d="M9 6l4 4-4 4M3 6l4 4-4 4"/>',

  // 其他
  link: '<path d="M8 12l4-4"/><path d="M11 7l2-2a2.8 2.8 0 0 1 4 4l-2 2"/><path d="M9 13l-2 2a2.8 2.8 0 0 1-4-4l2-2"/>',
  unlink: '<path d="M8 12l4-4"/><path d="M11 7l2-2M15 9l2-2M7 11l-2 2M5 15l-2 2"/>',
  sync: '<path d="M3 10a7 7 0 0 1 11.9-5"/><path d="M3 4v6h6"/><path d="M17 10a7 7 0 0 1-11.9 5"/><path d="M17 16v-6h-6"/>',
  filter: '<path d="M3 4h14l-5 6v7l-4-2V10L3 4z"/>',
  sort: '<path d="M4 6h12M6 10h8M8 14h4"/>',

  // 历史和聊天
  history: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 2.5"/>',
  message: '<path d="M3 4h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-3 3V5a1 1 0 0 1 1-1z"/>',
  chat: '<path d="M3 4h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H6l-3 3V5a1 1 0 0 1 1-1z"/>',

  // 加号（更简洁的加号）
  plus: '<path d="M10 4v12M4 10h12"/>',
  minus: '<path d="M4 10h12"/>',

  // 箭头插入
  insertDown: '<path d="M10 4v10M6 11l4 4 4-4"/><path d="M4 17h12"/>',

  // 队列
  queue: '<path d="M4 5h12M4 10h8M4 15h4"/>',

  // 地球（全局）
  globe: '<circle cx="10" cy="10" r="7"/><path d="M2 10h16M10 3c-2 2.5-2 11.5 0 14M10 3c2 2.5 2 11.5 0 14"/>',

  // 时钟（加载）
  clock: '<circle cx="10" cy="10" r="7"/><path d="M10 6v4l2 2"/>',

  // 首页
  home: '<path d="M3 10l7-7 7 7"/><path d="M5 9v8a1 1 0 0 0 1 1h3v-5h2v5h3a1 1 0 0 0 1-1V9"/>',

  // 压缩/紧凑
  compress: '<path d="M4 8h3V5M4 12h3v3M16 8h-3V5M16 12h-3v3"/><rect x="6" y="6" width="8" height="8" rx="1"/>',

  // 向上/向下箭头（用于token显示）
  arrowDownSmall: '<path d="M10 6v8M6 10l4 4 4-4"/>',
  arrowUpSmall: '<path d="M10 14V6M6 10l4-4 4 4"/>',

  // 发送
  send: '<path d="M3 10l14-7-7 14v-7H3z"/>',

  // 运行中/活动状态
  activity: '<path d="M2 10h4l2-5 4 10 2-5h4"/>',

  // 错误 X
  xCircle: '<circle cx="10" cy="10" r="7"/><path d="M7 7l6 6M13 7l-6 6"/>',

  // 眼睛（显示/隐藏密码）
  eye: '<circle cx="10" cy="10" r="2.5"/><path d="M2 10s3-5 8-5 8 5 8 5-3 5-8 5-8-5-8-5z"/>',
  eyeOff: '<path d="M2 10s3-5 8-5c1.1 0 2.1.2 3 .5M18 10s-1.3 2.2-3.5 3.5M7.5 14.5A8.4 8.4 0 0 1 2 10"/><path d="M3 3l14 14"/><circle cx="10" cy="10" r="2.5"/>',

  // 剪贴板
  clipboard: '<rect x="6" y="3" width="8" height="2" rx="1"/><path d="M5 5H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-1"/><rect x="5" y="3" width="10" height="4" rx="1"/>',

  // 标签
  tag: '<path d="M3 5a2 2 0 0 1 2-2h4.6a2 2 0 0 1 1.4.6l6.4 6.4a2 2 0 0 1 0 2.8l-4.6 4.6a2 2 0 0 1-2.8 0L3.6 11A2 2 0 0 1 3 9.6V5z"/><circle cx="7" cy="7" r="1.5" fill="currentColor"/>',

  // 清扫/清理
  broom: '<path d="M14 3l3 3M10 7l-7 7v3h3l7-7M6 14l2 2"/>',

  // 闪电
  zap: '<path d="M11 2L4 12h5l-1 6 7-10H10l1-6z"/>',

  // 火箭（高性能/Opus）
  rocket: '<path d="M10 18c-2-2-2-5 0-7s5-3 8-2c1 3 0 6-2 8-2 2-5 2-7 0z"/><path d="M10 18l-3 0 0-3"/><circle cx="13" cy="9" r="1.5"/>',

  // 风（快速/Haiku）
  wind: '<path d="M3 8h10a2 2 0 1 0-2-2M3 12h12a2 2 0 1 1-2 2M3 16h8a2 2 0 1 0-2-2"/>',

  // 拼图（插件）
  puzzle: '<path d="M17 9h-1V7a2 2 0 0 0-2-2h-2a2 2 0 0 0-4 0H6a2 2 0 0 0-2 2v2a2 2 0 0 0 0 4v2a2 2 0 0 0 2 2h2a2 2 0 0 0 4 0h2a2 2 0 0 0 2-2v-2a2 2 0 0 0 0-4z"/>',

  // 建筑（官方/企业）
  building: '<rect x="3" y="5" width="14" height="12" rx="1"/><path d="M6 8h2M6 11h2M6 14h2M12 8h2M12 11h2M12 14h2"/><path d="M9 17v-4h2v4"/>',

  // 字母图标（用于 Tab 标识）
  letterS: '<text x="10" y="15" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" stroke="none">S</text>',
  letterM: '<text x="10" y="15" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" stroke="none">M</text>',
  letterA: '<text x="10" y="15" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" stroke="none">A</text>',
  letterH: '<text x="10" y="15" text-anchor="middle" font-size="14" font-weight="600" fill="currentColor" stroke="none">H</text>',

  // 面板控制
  panelsCollapse: '<path d="M3 4v12M17 4v12"/><path d="M6 10l3-3v6l-3-3M14 10l-3-3v6l3-3"/>'
}

// 图标名称列表（用于校验）
export const iconNames = Object.keys(iconPaths)

// 默认导出图标路径
export default iconPaths
