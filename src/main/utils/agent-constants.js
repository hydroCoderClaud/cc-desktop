/**
 * Agent 模块常量定义
 * 从 agent-session-manager.js 提取
 */

/**
 * Agent 会话状态
 */
const AgentStatus = {
  IDLE: 'idle',           // 空闲，等待用户输入
  STREAMING: 'streaming', // 正在流式输出
  ERROR: 'error'          // 出错
}

/**
 * Agent 类型
 */
const AgentType = {
  CHAT: 'chat',               // 通用对话
  SPECIALIZED: 'specialized', // 专用 Agent
  LIGHTAPP: 'lightapp'        // 轻应用 Agent
}

/**
 * 文件浏览相关常量（模块级，避免每次调用重建）
 */

// 隐藏目录集合
const HIDDEN_DIRS = new Set([
  // 版本控制 & 工具配置
  '.git', '.claude', '.svn', '.hg', '.qoder', '.serena',
  // Node.js / 前端
  'node_modules', '.next', '.nuxt', 'dist', '.cache',
  '.npm', '.yarn', '.pnpm-store', 'bower_components',
  // Python 虚拟环境 & 工具
  'venv', '.venv', '.env', 'virtualenv',
  '.conda', '__pycache__', '.mypy_cache', '.pytest_cache',
  '.tox', '.eggs',
  // IDE
  '.vscode', '.idea', '.vs', '.fleet',
  // 构建产物
  '.gradle', 'target', 'build', '.terraform'
])

// 后缀匹配模式（用于 .egg-info 等目录）
const HIDDEN_DIR_SUFFIXES = ['.egg-info']

// 隐藏文件集合
const HIDDEN_FILES = new Set(['CLAUDE.md', '.claudeignore', '.gitignore', '.DS_Store', 'Thumbs.db'])

// 文本文件扩展名
const TEXT_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.vue', '.svelte',
  '.py', '.rb', '.go', '.rs', '.java', '.kt', '.c', '.cpp', '.h', '.hpp', '.cs',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf',
  '.md', '.txt', '.log', '.csv', '.tsv',
  '.html', '.htm', '.css', '.scss', '.less', '.sass',
  '.xml',
  '.sh', '.bash', '.zsh', '.fish', '.bat', '.cmd', '.ps1',
  '.sql', '.graphql', '.gql',
  '.env', '.gitignore', '.dockerignore', '.editorconfig',
  '.lock', '.prisma', '.proto'
])

// 图片文件扩展名
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp'])

// 视频文件扩展名
const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.avi', '.mkv', '.ogg'])

// 语言映射
const LANG_MAP = {
  '.js': 'javascript', '.ts': 'typescript', '.jsx': 'jsx', '.tsx': 'tsx',
  '.vue': 'vue', '.py': 'python', '.rb': 'ruby', '.go': 'go', '.rs': 'rust',
  '.java': 'java', '.kt': 'kotlin', '.c': 'c', '.cpp': 'cpp', '.h': 'c', '.cs': 'csharp',
  '.json': 'json', '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
  '.md': 'markdown', '.txt': 'text', '.log': 'text',
  '.html': 'html', '.htm': 'html', '.css': 'css', '.scss': 'scss',
  '.xml': 'xml', '.sql': 'sql', '.sh': 'bash', '.bat': 'batch',
  '.graphql': 'graphql', '.proto': 'protobuf'
}

// 文件大小限制
const MAX_TEXT_SIZE = 512 * 1024       // 文本预览上限 512KB
const MAX_IMG_SIZE = 2 * 1024 * 1024   // 图片预览上限 2MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024 // 视频预览上限 50MB

// MIME 类型映射
const MIME_MAP = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.bmp': 'image/bmp'
}

// 视频 MIME 类型映射
const VIDEO_MIME_MAP = {
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo', '.mkv': 'video/x-matroska', '.ogg': 'video/ogg'
}

module.exports = {
  AgentStatus,
  AgentType,
  HIDDEN_DIRS,
  HIDDEN_DIR_SUFFIXES,
  HIDDEN_FILES,
  TEXT_EXTS,
  IMAGE_EXTS,
  VIDEO_EXTS,
  LANG_MAP,
  MAX_TEXT_SIZE,
  MAX_IMG_SIZE,
  MAX_VIDEO_SIZE,
  MIME_MAP,
  VIDEO_MIME_MAP
}
