<template>
  <div class="industry-workspace" :class="{ 'dark-theme': isDark }">
    <!-- 顶部导航栏 -->
    <div class="top-nav">
      <div class="nav-left">
        <div class="app-logo" @click="toggleFullscreen" :title="isFullscreen ? '退出全屏' : '全屏'">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="15" stroke="#4a90d9" stroke-width="1.5" fill="#e8f4ff"/>
            <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" fill="#4a90d9" opacity="0.85"/>
          </svg>
        </div>
        <h1
          v-if="!editingTitle"
          class="notebook-title"
          @click="startEditTitle"
          title="点击编辑标题"
        >{{ notebookTitle }}</h1>
        <input
          v-else
          ref="titleInput"
          v-model="notebookTitle"
          class="notebook-title-input"
          spellcheck="false"
          @blur="stopEditTitle"
          @keyup.enter="stopEditTitle"
          @keyup.escape="stopEditTitle"
        />
      </div>
      <div class="nav-right">
        <button class="create-notebook-btn">
          <Icon name="plus" :size="16" />
          <span>创建笔记本</span>
        </button>
        <button class="nav-btn" title="分享">
          <Icon name="link" :size="16" />
          <span>分享</span>
        </button>
        <button class="nav-btn" title="设置">
          <Icon name="settings" :size="16" />
          <span>设置</span>
        </button>
        <button class="nav-btn" title="应用">
          <Icon name="grip" :size="16" />
          <span>应用</span>
        </button>
        <div class="user-avatar">
          <Icon name="user" :size="20" />
        </div>
      </div>
    </div>

    <!-- 三栏面板 -->
    <div class="panels-container">
    <!-- 左侧：来源面板 -->
    <div v-if="showLeftPanel" class="left-panel" :style="{ width: leftWidth + 'px' }">
      <div class="panel-header">
        <span class="panel-title">来源</span>
        <button v-if="expandedSource" class="header-btn" title="返回列表" @click="closeSourceDetail">
          <Icon name="chevronLeft" :size="18" />
        </button>
        <button v-else class="header-btn" title="收起" @click="showLeftPanel = false">
          <Icon name="panelLeft" :size="18" />
        </button>
      </div>

      <div class="panel-content">
        <!-- 列表视图 -->
        <template v-if="!expandedSource">
          <!-- 添加来源按钮 -->
          <button class="add-source-btn" @click="handleAddSource">
            <Icon name="plus" :size="16" />
            <span>添加来源</span>
          </button>

          <!-- 搜索框 -->
          <div class="search-section">
            <div class="search-box">
              <Icon name="search" :size="18" class="search-icon" />
              <input
                type="text"
                placeholder="在网络中搜索新来源"
                class="search-input"
              />
            </div>
            <div class="search-options">
              <button class="option-btn">
                <Icon name="globe" :size="14" />
                <span>Web</span>
                <Icon name="chevronDown" :size="14" />
              </button>
              <button class="option-btn">
                <Icon name="lightning" :size="14" />
                <span>Fast Research</span>
                <Icon name="chevronDown" :size="14" />
              </button>
              <button class="search-submit">
                <Icon name="arrowRight" :size="16" />
              </button>
            </div>
          </div>

          <!-- 全选 -->
          <div class="select-all">
            <span>选择所有来源</span>
            <label class="checkbox-label">
              <input
                type="checkbox"
                :checked="allSelected"
                @change="toggleSelectAll"
              />
              <span class="checkmark"></span>
            </label>
          </div>

          <!-- 源列表 -->
          <div class="source-list">
            <div
              v-for="source in sources"
              :key="source.id"
              class="source-item"
              @click="openSourceDetail(source)"
            >
              <div class="source-left">
                <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
                <span class="source-name">{{ source.name }}</span>
              </div>
              <label class="checkbox-label" @click.stop>
                <input
                  type="checkbox"
                  v-model="source.selected"
                />
                <span class="checkmark"></span>
              </label>
            </div>
          </div>
        </template>

        <!-- 详情视图 -->
        <template v-else>
          <!-- 顶部：标题 + 外部打开 -->
          <div class="detail-header">
            <button class="detail-back-btn" @click="closeSourceDetail" title="返回">
              <Icon name="chevronLeft" :size="16" />
            </button>
            <span class="detail-title">{{ expandedSource.name }}</span>
            <button class="detail-external-btn" @click="handleOpenExternal(expandedSource)" title="在外部打开源">
              <Icon name="externalLink" :size="16" />
            </button>
          </div>

          <!-- 上半部分：来源摘要（可收起） -->
          <div class="detail-summary-section">
            <div class="detail-summary-header" @click="summaryCollapsed = !summaryCollapsed">
              <Icon name="lightning" :size="14" color="#5c6bc0" />
              <span class="detail-summary-title">来源指南</span>
              <Icon :name="summaryCollapsed ? 'chevronDown' : 'chevronUp'" :size="14" class="summary-toggle-icon" />
            </div>
            <template v-if="!summaryCollapsed">
              <p class="detail-summary-text">{{ expandedSource.summary }}</p>
              <div class="detail-tags">
                <span v-for="tag in expandedSource.tags" :key="tag" class="detail-tag">{{ tag }}</span>
              </div>
            </template>
          </div>

          <!-- 下半部分：原始内容 -->
          <div class="detail-content-section">
            <!-- 网页类型 -->
            <template v-if="expandedSource.type === 'web'">
              <a v-if="expandedSource.url" :href="expandedSource.url" class="detail-source-url" target="_blank">{{ expandedSource.url }}</a>
              <pre class="detail-raw-text">{{ expandedSource.content }}</pre>
            </template>
            <!-- Markdown 类型 -->
            <template v-else-if="expandedSource.type === 'markdown'">
              <pre class="detail-raw-text detail-markdown">{{ expandedSource.content }}</pre>
            </template>
            <!-- 其他类型 -->
            <template v-else>
              <pre class="detail-raw-text">{{ expandedSource.content }}</pre>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- 左侧折叠条 -->
    <div v-else class="panel-collapsed-strip">
      <!-- 上部标题区 -->
      <div class="strip-header">
        <button class="header-btn" @click="showLeftPanel = true" title="展开">
          <Icon name="panelLeft" :size="18" />
        </button>
      </div>
      <!-- 内容区域容器 -->
      <div class="strip-body">
        <!-- 源图标列表 -->
        <div class="strip-content">
          <div
            v-for="source in sources"
            :key="source.id"
            class="strip-icon-item"
            :title="source.name"
          >
            <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
          </div>
        </div>
      </div>
    </div>

    <!-- 左侧与中间的拖拽分隔条 -->
    <div class="resize-handle" @mousedown="startResize('left', $event)"></div>

    <!-- 中间：对话区域 -->
    <div class="main-content">
      <div class="chat-header">
        <span class="chat-title">对话</span>
      </div>

      <div class="chat-content">
        <div class="welcome-message">
          <h2>欢迎使用专业智能体</h2>
          <p class="welcome-subtitle">基于 NotebookLM 理念的智能工作空间</p>
        </div>
      </div>

      <div class="chat-input-area">
        <div class="input-wrapper">
          <input
            type="text"
            placeholder="开始输入..."
            class="chat-input"
            @keyup.enter="handleSendMessage"
          />
          <span class="sources-count">{{ selectedSources.length }} 个来源</span>
          <button class="send-btn" @click="handleSendMessage">
            <Icon name="send" :size="18" />
          </button>
        </div>
      </div>
    </div>

    <!-- 中间与右侧的拖拽分隔条 -->
    <div class="resize-handle" @mousedown="startResize('right', $event)"></div>

    <!-- 右侧：Studio 面板 -->
    <div v-if="showRightPanel" class="right-panel" :style="{ width: rightWidth + 'px' }">
      <div class="panel-header">
        <template v-if="expandedAchievement">
          <span class="panel-title">Studio</span>
          <Icon name="chevronRight" :size="14" class="breadcrumb-icon" />
          <span class="panel-title">{{ availableTypes.find(t => t.id === expandedAchievement.type)?.name || expandedAchievement.type }}</span>
          <button class="header-btn" style="margin-left:auto" title="返回列表" @click="closeAchievementDetail">
            <Icon name="chevronRight" :size="18" />
          </button>
        </template>
        <template v-else>
          <span class="panel-title">Studio</span>
          <button class="header-btn" style="margin-left:auto" title="收起" @click="showRightPanel = false">
            <Icon name="panelRight" :size="18" />
          </button>
        </template>
      </div>

      <div class="panel-content">
        <!-- 列表视图 -->
        <template v-if="!expandedAchievement">
          <!-- 成果类型网格 -->
          <div class="type-grid">
            <div
              v-for="type in availableTypes"
              :key="type.id"
              class="type-card"
              :style="{ background: type.bgColor }"
              :title="type.tip"
            >
              <div class="type-card-top">
                <div class="type-icon-content" :style="{ color: type.color }">
                  <Icon :name="type.icon" :size="16" />
                </div>
                <span v-if="type.beta" class="beta-badge">Beta 版</span>
              </div>
              <span class="type-name">{{ type.name }}</span>
              <button class="type-edit-btn">
                <Icon name="edit" :size="14" />
              </button>
            </div>
          </div>

          <!-- 分隔线 -->
          <div class="panel-divider"></div>

          <!-- 已生成的成果列表 -->
          <div class="achievements-section">
            <div class="section-title">已生成</div>
            <div v-if="achievements.length === 0" class="empty-achievements">
              <p>暂无成果</p>
              <p class="hint">与智能体对话后将在此生成</p>
            </div>
            <div v-else class="achievements-list">
              <div
                v-for="achievement in achievements"
                :key="achievement.id"
                class="achievement-item"
                @click="openAchievementDetail(achievement)"
              >
                <Icon :name="achievement.icon" :size="20" :color="achievement.color" />
                <div class="achievement-info">
                  <div class="achievement-name">{{ achievement.name }}</div>
                  <div class="achievement-meta">
                    <span>{{ achievement.sourceCount }} 个来源</span>
                    <span class="dot">•</span>
                    <span>{{ achievement.time }}</span>
                  </div>
                </div>
                <div class="achievement-actions">
                  <button v-if="achievement.type === 'video' || achievement.type === 'audio'" class="play-btn" @click.stop>
                    <Icon name="play" :size="16" />
                  </button>
                  <button class="more-btn" @click.stop>
                    <Icon name="moreVertical" :size="16" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 详情视图 -->
        <template v-else>
          <div class="detail-header">
            <button class="detail-back-btn" @click="closeAchievementDetail" title="返回">
              <Icon name="chevronRight" :size="16" />
            </button>
            <span class="detail-title">{{ expandedAchievement.name }}</span>
            <button class="detail-external-btn" title="导出">
              <Icon name="export" :size="16" />
            </button>
            <button class="detail-external-btn" title="复制">
              <Icon name="copy" :size="16" />
            </button>
            <button class="detail-external-btn" title="删除" style="color: #d93025;">
              <Icon name="delete" :size="16" />
            </button>
          </div>

          <div class="detail-summary-section">
            <div class="detail-summary-header">
              <Icon :name="expandedAchievement.icon" :size="14" :color="expandedAchievement.color" />
              <span class="detail-summary-title">{{ expandedAchievement.name }}</span>
            </div>
            <div class="achievement-detail-meta">
              <span>{{ expandedAchievement.sourceCount }} 个来源</span>
              <span class="dot">•</span>
              <span>{{ expandedAchievement.time }}</span>
            </div>
          </div>

          <div class="detail-content-section">
            <pre class="detail-raw-text">{{ expandedAchievement.content || '暂无内容' }}</pre>
          </div>
        </template>
      </div>
    </div>

    <!-- 右侧折叠条 -->
    <div v-else class="panel-collapsed-strip panel-collapsed-right">
      <!-- 上部标题区 -->
      <div class="strip-header">
        <button class="header-btn" @click="showRightPanel = true" title="展开">
          <Icon name="panelRight" :size="18" />
        </button>
      </div>
      <!-- 内容区域容器 -->
      <div class="strip-body">
        <!-- 成果类型图标列表 -->
        <div class="strip-content strip-content-top">
          <div
            v-for="type in availableTypes"
            :key="type.id"
            class="strip-icon-item type-icon-item"
            :style="{ background: type.bgColor }"
            :title="type.name"
          >
            <div class="type-icon-small" :style="{ color: type.color }">
              <Icon :name="type.icon" :size="18" />
            </div>
            <span class="type-plus">+</span>
          </div>
        </div>
        <!-- 分隔线 -->
        <div class="strip-divider"></div>
        <!-- 已生成的成果 -->
        <div class="strip-content strip-content-bottom">
          <div
            v-for="achievement in achievements"
            :key="achievement.id"
            class="strip-icon-item"
            :title="achievement.name"
          >
            <Icon :name="achievement.icon" :size="20" :color="achievement.color" />
          </div>
          <!-- 悬浮添加按钮 -->
          <div class="strip-add-btn">
            <Icon name="file-text" :size="20" />
            <span class="add-plus">+</span>
          </div>
        </div>
      </div>
    </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useTheme } from '@composables/useTheme'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'

const message = useMessage()
const { isDark, toggleTheme } = useTheme()

const showLeftPanel = ref(true)
const showRightPanel = ref(true)

const leftWidth = ref(320)
const rightWidth = ref(340)

const startResize = (side, e) => {
  e.preventDefault()
  const startX = e.clientX
  const startLeft = leftWidth.value
  const startRight = rightWidth.value

  const onMove = (moveEvent) => {
    const container = document.querySelector('.panels-container')
    const containerWidth = container?.offsetWidth || window.innerWidth
    // 分隔条 + padding 占用的固定宽度（2个分隔条各12px，padding左右各16px）
    const fixedOverhead = 56
    const minMiddle = 300
    const minWidth = Math.round(containerWidth / 5)
    const delta = moveEvent.clientX - startX

    if (side === 'left') {
      const maxLeft = containerWidth - fixedOverhead - startRight - minMiddle
      const newWidth = Math.min(maxLeft, Math.max(minWidth, startLeft + delta))
      leftWidth.value = newWidth
    } else {
      const maxRight = containerWidth - fixedOverhead - startLeft - minMiddle
      const newWidth = Math.min(maxRight, Math.max(minWidth, startRight - delta))
      rightWidth.value = newWidth
    }
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

const notebookTitle = ref('MCP HydroSSH 推广视频')
const editingTitle = ref(false)
const titleInput = ref(null)

const startEditTitle = async () => {
  editingTitle.value = true
  await nextTick()
  titleInput.value?.select()
}

const stopEditTitle = () => {
  if (!notebookTitle.value.trim()) {
    notebookTitle.value = 'MCP HydroSSH 推广视频'
  }
  editingTitle.value = false
}

// 成果类型定义
const availableTypes = [
  { id: 'audio', name: '音频概览', icon: 'audio', beta: false, bgColor: '#E3F2FD', color: '#1976D2', tip: '生成一个由 AI 向您演示的解说音频' },
  { id: 'presentation', name: '演示文稿', icon: 'file-text', beta: true, bgColor: '#FFF3E0', color: '#F57C00', tip: '生成一份演示文稿' },
  { id: 'video', name: '视频概览', icon: 'video', beta: false, bgColor: '#E8F5E9', color: '#388E3C', tip: '生成一个由 AI 向您演示的解说视频' },
  { id: 'mindmap', name: '思维导图', icon: 'link', beta: false, bgColor: '#F3E5F5', color: '#7B1FA2', tip: '生成一张思维导图' },
  { id: 'report', name: '报告', icon: 'file-text', beta: false, bgColor: '#FFF8E1', color: '#FFA000', tip: '生成一份详细报告' },
  { id: 'flashcard', name: '闪卡', icon: 'heart', beta: false, bgColor: '#FCE4EC', color: '#C2185B', tip: '生成学习闪卡' },
  { id: 'quiz', name: '测验', icon: 'clipboard', beta: true, bgColor: '#FBE9E7', color: '#D84315', tip: '生成一份测验题目' },
  { id: 'infographic', name: '信息图', icon: 'image', beta: true, bgColor: '#E0F7FA', color: '#0097A7', tip: '生成一张信息图' },
  { id: 'table', name: '数据表格', icon: 'table', beta: false, bgColor: '#EDE7F6', color: '#512DA8', tip: '生成一份数据表格' }
]

// 源数据列表
const sources = ref([
  {
    id: '1',
    name: 'Page not found · GitHub · GitHub',
    type: 'web',
    typeLabel: '网页',
    selected: true,
    url: 'https://github.com/not-found',
    summary: '这份文档展示了一个典型的 GitHub 错误页面导航结构，在告知用户无法找到特定页面的同时，提供了全面的平台功能索引。它详细列出了 GitHub 在人工智能代码生成、自动化开发流程以及应用程序安全方面的各类工具，体现了该平台作为开发者核心生态系统的广度。',
    tags: ['AI 代码生成', '开发者工具', '应用程序安全', '开源社区', '企业级解决方案'],
    content: `Navigation Menu
Toggle navigation
Sign in
Appearance settings
· Platform
  ○ AI CODE CREATION
  ○ DEVELOPER WORKFLOWS
  ○ APPLICATION SECURITY
· Solutions
  ○ By Company Size
  ○ By Use Case
· Open Source
  ○ Community
  ○ Documentation`
  },
  {
    id: '2',
    name: 'mcp-hydrocoder-ssh-readme.md',
    type: 'markdown',
    typeLabel: 'Markdown',
    selected: true,
    summary: 'MCP HydroSSH 项目的 README 文档，介绍了 SSH 服务器管理工具的安装、配置和使用方法。',
    tags: ['MCP', 'SSH', '服务器管理'],
    content: `# MCP HydroSSH

MCP HydroSSH 是一个基于 Model Context Protocol 的 SSH 服务器管理工具。

## 安装

\`\`\`bash
npx -y @anthropic-ai/mcp-hydrossh
\`\`\`

## 功能特性

- 密钥文件认证
- 密码认证
- 权限控制
- 自动化管理`
  },
  {
    id: '3',
    name: 'mcpHydroSSH/README_CN.md',
    type: 'web',
    typeLabel: '网页',
    selected: true,
    url: 'https://github.com/hydroCoderClaud/mcpHydroSSH/blob/main/README_CN.md',
    summary: 'MCP HydroSSH 的中文文档，包含详细的使用说明和配置示例。',
    tags: ['MCP', 'SSH', '中文文档'],
    content: `# MCP HydroSSH 中文文档

欢迎使用 MCP HydroSSH！

## 快速开始

1. 安装依赖
2. 配置 SSH 密钥
3. 启动服务`
  }
])

// 成果数据
const achievements = ref([
  {
    id: '1',
    type: 'video',
    name: 'MCP HydroSSH 推广视频',
    icon: 'video',
    color: '#388E3C',
    sourceCount: 1,
    time: '2 小时前'
  },
  {
    id: '2',
    type: 'report',
    name: 'HydroCoder SSH 全栈管理指南',
    icon: 'file-text',
    color: '#FFA000',
    sourceCount: 3,
    time: '2 小时前'
  },
  {
    id: '3',
    type: 'table',
    name: 'MCP 工具与功能规范',
    icon: 'table',
    color: '#512DA8',
    sourceCount: 3,
    time: '2 小时前'
  },
  {
    id: '4',
    type: 'video',
    name: 'MCP HydroSSH：你的 SSH 助手',
    icon: 'video',
    color: '#388E3C',
    sourceCount: 1,
    time: '1 天前'
  }
])

const selectedSources = computed(() => sources.value.filter(s => s.selected))
const allSelected = computed(() => sources.value.length > 0 && sources.value.every(s => s.selected))

const getSourceIcon = (type) => {
  const iconMap = {
    web: 'globe',
    markdown: 'file-text',
    pdf: 'file-pdf',
    text: 'file',
    code: 'code',
    image: 'image',
    video: 'video',
    audio: 'audio'
  }
  return iconMap[type] || 'file'
}

const getSourceColor = (type) => {
  const colorMap = {
    web: '#555',
    markdown: '#2da44e',
    pdf: '#dc3545',
    text: '#555',
    code: '#0366d6',
    image: '#e85d2a',
    video: '#388E3C',
    audio: '#7B1FA2'
  }
  return colorMap[type] || '#555'
}

const handleAddSource = () => {
  message.info('添加来源功能开发中...')
}

const expandedSource = ref(null)
const summaryCollapsed = ref(false)

const expandedAchievement = ref(null)

const openAchievementDetail = (achievement) => {
  expandedAchievement.value = achievement
  const containerWidth = document.querySelector('.panels-container')?.offsetWidth || window.innerWidth
  rightWidth.value = Math.round(containerWidth * 2 / 5)
}

const closeAchievementDetail = () => {
  expandedAchievement.value = null
  rightWidth.value = 320
}

const openSourceDetail = (source) => {
  expandedSource.value = source
  summaryCollapsed.value = false
  const containerWidth = document.querySelector('.panels-container')?.offsetWidth || window.innerWidth
  leftWidth.value = Math.round(containerWidth * 2 / 5)
}

const closeSourceDetail = () => {
  expandedSource.value = null
  leftWidth.value = 320
}

const toggleSelectAll = () => {
  const newValue = !allSelected.value
  sources.value.forEach(s => s.selected = newValue)
}

const handleOpenExternal = (source) => {
  if (source.url) {
    window.open(source.url, '_blank')
  } else {
    message.info(`外部打开：${source.name}`)
  }
}

const handleSendMessage = () => {
  message.info('发送消息功能开发中...')
}

const isFullscreen = ref(false)

const toggleFullscreen = () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen()
    isFullscreen.value = true
  } else {
    document.exitFullscreen()
    isFullscreen.value = false
  }
}

document.addEventListener('fullscreenchange', () => {
  isFullscreen.value = !!document.fullscreenElement
})
</script>

<style scoped>
.industry-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: #f0f4ff;
  color: #333;
}

/* ===== 顶部导航栏 ===== */
.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  min-height: 56px;
  max-height: 56px;
  padding: 10px 24px 0;
  background: #f0f4ff;
  flex-shrink: 0;
  overflow: hidden;
}

.dark-theme .top-nav {
  background: #1e1e1e;
  border-bottom-color: #333;
}

.nav-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border-radius: 50%;
  color: #333;
}

.app-logo:hover {
  background: rgba(0, 0, 0, 0.05);
}

.dark-theme .app-logo {
  color: #e0e0e0;
}

.dark-theme .app-logo:hover {
  background: rgba(255, 255, 255, 0.1);
}

.notebook-title {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  margin: 0;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
}

.notebook-title:hover {
  background: rgba(0,0,0,0.05);
}

.dark-theme .notebook-title:hover {
  background: rgba(255,255,255,0.08);
}

.notebook-title-input {
  font-size: 18px;
  font-weight: 500;
  color: #333;
  margin: 0;
  border: 1px solid #4a90d9;
  border-radius: 6px;
  padding: 2px 6px;
  outline: none;
  background: #fff;
  min-width: 200px;
}

.dark-theme .notebook-title {
  color: #e0e0e0;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.create-notebook-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 18px;
  background: #1a1a1a;
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.create-notebook-btn:hover {
  background: #333;
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  background: rgba(0, 0, 0, 0.05);
  border: none;
  border-radius: 20px;
  color: #333;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  transition: all 0.15s;
}

.nav-btn:hover {
  background: rgba(0, 0, 0, 0.1);
}

.dark-theme .nav-btn {
  background: rgba(255, 255, 255, 0.1);
  color: #e0e0e0;
}

.dark-theme .nav-btn:hover {
  background: rgba(255, 255, 255, 0.15);
}

.nav-btn .icon {
  margin-right: 4px;
}

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  overflow: hidden;
  cursor: pointer;
  margin-left: 8px;
  border: 2px solid rgba(0,0,0,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.05);
  color: #555;
}

.dark-theme .user-avatar {
  border-color: #1e1e1e;
}

.user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* ===== 面板容器 ===== */
.panels-container {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 8px 16px 16px;
  overflow: hidden;
  align-items: stretch;
}

.left-panel,
.right-panel,
.main-content {
  border-radius: 16px;
  height: 100%;
}

/* ===== 拖拽分隔条 ===== */
.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  border-radius: 2px;
  transition: background 0.15s;
  background: transparent;
  margin: 0 4px;
}

.resize-handle:hover {
  background: transparent;
}

.dark-theme .resize-handle:hover {
  background: #444;
}
.left-panel {
  flex-shrink: 0;
  background: #fff;
  border: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.dark-theme .left-panel {
  background: #1e1e1e;
  border-color: #333;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 20px;
  height: 52px;
  min-height: 52px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
  overflow: hidden;
}

.dark-theme .panel-header {
  border-bottom-color: #333;
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.breadcrumb-icon {
  color: #999;
  flex-shrink: 0;
}

.dark-theme .panel-title {
  color: #e0e0e0;
}

.header-btn {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
  transition: all 0.15s;
  flex-shrink: 0;
}

.header-btn:hover {
  background: rgba(0, 0, 0, 0.05);
}

.dark-theme .header-btn {
  color: #999;
}

.dark-theme .header-btn:hover {
  background: rgba(255, 255, 255, 0.1);
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* ===== 详情视图 ===== */
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 12px;
  margin-bottom: 16px;
}


.detail-back-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
  flex-shrink: 0;
  transition: background 0.15s;
}

.detail-back-btn:hover {
  background: rgba(0,0,0,0.05);
}

.detail-title {
  flex: 1;
  font-size: 14px;
  font-weight: 600;
  color: #333;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-theme .detail-title {
  color: #e0e0e0;
}

.detail-external-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
  flex-shrink: 0;
  transition: background 0.15s;
}

.detail-external-btn:hover {
  background: rgba(0,0,0,0.05);
  color: #1a73e8;
}

/* 摘要区域 */
.detail-summary-section {
  background: #f0f4ff;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.dark-theme .detail-summary-section {
  background: #2a2a3a;
}

.detail-summary-header {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  margin-bottom: 10px;
}

.detail-summary-title {
  font-size: 13px;
  font-weight: 600;
  color: #333;
  flex: 1;
}

.dark-theme .detail-summary-title {
  color: #e0e0e0;
}

.summary-toggle-icon {
  color: #999;
  margin-left: auto;
}

.detail-summary-text {
  font-size: 13px;
  line-height: 1.7;
  color: #555;
  margin: 0 0 12px;
}

.dark-theme .detail-summary-text {
  color: #b0b0b0;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.detail-tag {
  padding: 4px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
}

.dark-theme .detail-tag {
  background: #3a3a4a;
  border-color: #444;
  color: #b0b0b0;
}

.detail-tag:hover {
  border-color: #aaa;
}

/* 原始内容区域 */
.detail-content-section {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
}

.dark-theme .detail-content-section {
  border-color: #444;
}

.detail-source-url {
  display: block;
  padding: 8px 14px;
  font-size: 12px;
  color: #1a73e8;
  text-decoration: none;
  border-bottom: 1px solid #e0e0e0;
  word-break: break-all;
}

.detail-source-url:hover {
  text-decoration: underline;
}

.dark-theme .detail-source-url {
  border-bottom-color: #444;
}

.detail-raw-text {
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #333;
  margin: 0;
  padding: 14px;
  overflow-x: auto;
}

.dark-theme .detail-raw-text {
  color: #e0e0e0;
}

.detail-markdown {
  font-family: inherit;
  font-size: 13px;
}

/* 添加来源按钮 */
.add-source-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid #e0e0e0;
  border-radius: 24px;
  color: #666;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  transition: all 0.15s;
}

.dark-theme .add-source-btn {
  background: #2a2a2a;
  border-color: #444;
  color: #b0b0b0;
}

.add-source-btn:hover {
  background: #e8e8e8;
  border-color: #ccc;
}

.dark-theme .add-source-btn:hover {
  background: #333;
  border-color: #555;
}

/* 搜索区域 */
.search-section {
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 24px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.dark-theme .search-section {
  background: #2a2a2a;
  border-color: #444;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.search-icon {
  color: #999;
  flex-shrink: 0;
}

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #333;
  outline: none;
}

.dark-theme .search-input {
  color: #e0e0e0;
}

.search-input::placeholder {
  color: #999;
}

.search-options {
  display: flex;
  gap: 8px;
  align-items: center;
}

.option-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  color: #333;
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.dark-theme .option-btn {
  background: #333;
  border-color: #555;
  color: #e0e0e0;
}

.option-btn:hover {
  border-color: #ccc;
  background: #f9f9f9;
}

.dark-theme .option-btn:hover {
  background: #3a3a3a;
}

.search-submit {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e0e0e0;
  border: none;
  border-radius: 50%;
  color: #666;
  cursor: pointer;
  transition: all 0.15s;
  margin-left: auto;
  flex-shrink: 0;
}

.dark-theme .search-submit {
  background: #444;
  color: #b0b0b0;
}

.search-submit:hover {
  background: #1a73e8;
  color: #fff;
}

/* 全选 */
.select-all {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  font-size: 13px;
  font-weight: 500;
  color: #333;
  padding: 0 2px 0 4px;
}

.dark-theme .select-all {
  color: #e0e0e0;
}

/* 源列表 */
.source-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.source-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 2px 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
  overflow: hidden;
}

.source-item:hover {
  background: #f5f5f5;
}

.dark-theme .source-item:hover {
  background: #2a2a2a;
}

.source-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.source-name {
  font-size: 13px;
  color: #333;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 18px;
}

.dark-theme .source-name {
  color: #e0e0e0;
}

/* 复选框 */
.checkbox-label {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.checkbox-label input {
  display: none;
}

.checkbox-label .checkmark {
  width: 18px;
  height: 18px;
  border: 1.5px solid #ccc;
  border-radius: 4px;
  position: relative;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #fff;
}

.dark-theme .checkmark {
  border-color: #555;
  background: #2a2a2a;
}

.checkbox-label:hover .checkmark {
  border-color: #999;
}

.checkbox-label input:checked + .checkmark {
  background: #fff;
  border-color: #ccc;
}

.checkbox-label input:checked + .checkmark::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 9px;
  border-right: 2px solid #333;
  border-bottom: 2px solid #333;
  transform: rotate(45deg) translate(-1px, -1px);
}

.dark-theme .checkbox-label input:checked + .checkmark::after {
  border-color: #e0e0e0;
}

/* 摘要卡片 */
.summary-card {
  background: #f0f4ff;
  border-radius: 12px;
  padding: 14px 16px;
  margin-bottom: 16px;
}

.dark-theme .summary-card {
  background: #2a2a3a;
}

.summary-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  color: #333;
  font-weight: 500;
  margin-bottom: 10px;
}

.dark-theme .summary-header {
  color: #e0e0e0;
}

.summary-title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.expand-icon {
  margin-left: auto;
  color: #999;
}

.summary-content {
  font-size: 13px;
  line-height: 1.7;
  color: #555;
  margin-bottom: 12px;
}

.dark-theme .summary-content {
  color: #b0b0b0;
}

.summary-content p {
  margin: 0;
}

.summary-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-btn {
  padding: 6px 14px;
  background: #fff;
  border: 1px solid #e0e0e0;
  border-radius: 16px;
  font-size: 12px;
  color: #555;
  cursor: pointer;
  transition: all 0.15s;
}

.dark-theme .tag-btn {
  background: #3a3a4a;
  border-color: #444;
  color: #b0b0b0;
}

.tag-btn:hover {
  background: #f5f5f5;
  border-color: #ccc;
}

/* 原始内容 */
.original-content {
  border: 1px solid #e0e0e0;
  border-radius: 12px;
  overflow: hidden;
}

.dark-theme .original-content {
  border-color: #444;
}

.content-title {
  padding: 12px 14px;
  border-bottom: 1px solid #e0e0e0;
  font-size: 13px;
  font-weight: 500;
  color: #333;
}

.dark-theme .content-title {
  border-bottom-color: #444;
  color: #e0e0e0;
}

.content-body {
  position: relative;
  max-height: 400px;
  overflow: auto;
}

.web-content {
  padding: 14px;
}

.web-link {
  display: block;
  color: #1a73e8;
  text-decoration: none;
  font-size: 12px;
  margin-bottom: 12px;
  word-break: break-all;
}

.web-link:hover {
  text-decoration: underline;
}

.web-text {
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #333;
  margin: 0;
}

.dark-theme .web-text {
  color: #e0e0e0;
}

.text-content {
  white-space: pre-wrap;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  line-height: 1.6;
  padding: 14px;
  margin: 0;
  color: #333;
}

.dark-theme .text-content {
  color: #e0e0e0;
}

.content-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 20px;
  color: #999;
  text-align: center;
}

.content-placeholder p {
  margin: 12px 0 0;
  font-size: 13px;
}

.content-scroll-indicator {
  position: sticky;
  bottom: 0;
  height: 30px;
  background: linear-gradient(to bottom, transparent, #fff);
  pointer-events: none;
}

.dark-theme .content-scroll-indicator {
  background: linear-gradient(to bottom, transparent, #1e1e1e);
}

/* 左侧收起后的窄条 */
.panel-collapsed-strip {
  width: 52px;
  height: 100%;
  background: #fff;
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0;
  cursor: pointer;
  overflow: hidden;
  scrollbar-width: none; /* Firefox */
}

.panel-collapsed-strip::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

.dark-theme .panel-collapsed-strip {
  background: #1e1e1e;
  border-color: #333;
}

/* 上部标题区 */
.strip-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 52px;
  min-height: 52px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
  box-sizing: border-box;
}

.dark-theme .strip-header {
  border-bottom-color: #333;
}

/* 内容区域容器 - 包含上下两个滚动区 */
.strip-body {
  width: 100%;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 收起状态下的图标项 */
.strip-icon-item {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  transition: all 0.15s;
  flex-shrink: 0;
  position: relative;
  margin: 4px 0;
}

.strip-icon-item:hover {
  background: #f5f5f5;
  transform: scale(1.05);
}

.dark-theme .strip-icon-item:hover {
  background: #2a2a2a;
}

/* 内容区域 */
.strip-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 8px;
  gap: 4px;
  overflow-y: auto;
  scrollbar-width: none; /* Firefox */
}

.strip-content::-webkit-scrollbar {
  display: none; /* Chrome/Safari */
}

/* 上部内容区域 - 可滚动 */
.strip-content-top {
  flex: 1;
  min-height: 0;
}

/* 下部内容区域 - 可滚动 */
.strip-content-bottom {
  flex: 1;
  min-height: 0;
  padding-bottom: 16px;
}

.panel-collapsed-right {
  border-left: none;
  border-right: none;
}

.dark-theme .panel-collapsed-right {
  border-right-color: #333;
}

/* 成果类型图标项（带背景色） */
.type-icon-item {
  width: 36px;
  height: 36px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  flex-shrink: 0;
  transition: all 0.15s;
  margin: 4px 0;
}

.type-icon-item:hover {
  transform: scale(1.05);
}

.type-icon-small {
  display: flex;
  align-items: center;
  justify-content: center;
}

.type-plus {
  position: absolute;
  bottom: -2px;
  right: -2px;
  font-size: 10px;
  font-weight: bold;
  color: #666;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 50%;
  width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dark-theme .type-plus {
  color: #999;
  background: rgba(0, 0, 0, 0.5);
}

/* 分隔线 */
.strip-divider {
  width: 100%;
  height: 1px;
  background: #e0e0e0;
  margin: 0;
  flex-shrink: 0;
}

.dark-theme .strip-divider {
  background: #333;
}

/* 悬浮添加按钮 */
.strip-add-btn {
  width: 40px;
  height: 40px;
  background: #1a73e8;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: white;
  position: sticky;
  bottom: 12px;
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3);
  transition: all 0.15s;
  flex-shrink: 0;
  margin-top: auto;
}

.strip-add-btn:hover {
  background: #1557b0;
  transform: scale(1.05);
}

.add-plus {
  position: absolute;
  bottom: 2px;
  right: 4px;
  font-size: 12px;
  font-weight: bold;
}

.strip-icon {
  font-size: 18px;
  color: #666;
}

.dark-theme .strip-icon {
  color: #999;
}

/* 收起按钮图标居中 */
.strip-icon .icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.panel-collapsed-right {
  border-right: none;
  border-left: none;
}

.dark-theme .panel-collapsed-right {
  border-left-color: #333;
}

/* ===== 中间主内容区 ===== */
.main-content {
  flex: 1;
  min-width: 300px;
  background: #fff;
  border: none;
  display: flex;
  flex-direction: column;
}

.dark-theme .main-content {
  background: #1e1e1e;
  border-color: #333;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 52px;
  min-height: 52px;
  border-bottom: 1px solid #e0e0e0;
  flex-shrink: 0;
}

.dark-theme .chat-header {
  border-bottom-color: #333;
}

.chat-title {
  font-size: 14px;
  font-weight: 600;
  color: #333;
}

.dark-theme .chat-title {
  color: #e0e0e0;
}

.chat-actions {
  display: flex;
  gap: 4px;
}

.action-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  color: #666;
}

.action-btn:hover {
  background: #f5f5f5;
}

.dark-theme .action-btn:hover {
  background: #2a2a2a;
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.welcome-message {
  text-align: center;
  padding: 40px 20px;
}

.welcome-message h2 {
  font-size: 24px;
  font-weight: 600;
  color: #333;
  margin: 0 0 8px;
}

.dark-theme .welcome-message h2 {
  color: #e0e0e0;
}

.welcome-subtitle {
  font-size: 14px;
  color: #999;
  margin: 0;
}

.chat-input-area {
  padding: 16px 20px;
}

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  padding: 8px 16px 8px 20px;
  background: #f5f5f5;
  border-radius: 28px;
}

.dark-theme .input-wrapper {
  background: #2a2a2a;
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: #333;
  outline: none;
}

.dark-theme .chat-input {
  color: #e0e0e0;
}

.chat-input::placeholder {
  color: #999;
}

.sources-count {
  font-size: 12px;
  color: #999;
  white-space: nowrap;
}

.send-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a73e8;
  color: white;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
}

.send-btn:hover {
  background: #1557b0;
}

/* ===== 右侧面板 ===== */
.right-panel {
  flex-shrink: 0;
  background: #fff;
  border: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.dark-theme .right-panel {
  background: #1e1e1e;
  border-color: #333;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

/* 类型网格 */
.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
  margin-bottom: 20px;
}

.type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
  overflow: hidden;
  min-width: 0;
}

.type-card:hover {
  transform: translateY(-1px);
  box-shadow: 0 3px 10px rgba(0,0,0,0.08);
}

.type-icon-content {
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.type-name {
  font-size: 12px;
  font-weight: 500;
  color: #333;
  text-align: left;
  line-height: 1.3;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dark-theme .type-name {
  color: #e0e0e0;
}

.beta-badge {
  font-size: 9px;
  background: #333;
  color: #fff;
  padding: 2px 5px;
  border-radius: 3px;
  font-weight: 600;
  white-space: nowrap;
}

.type-card-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.type-edit-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255,255,255,0.85);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: #666;
}

.dark-theme .type-edit-btn {
  background: rgba(0,0,0,0.5);
}

.type-card:hover .type-edit-btn {
  opacity: 1;
}

/* 分隔线 */
.panel-divider {
  height: 1px;
  background: #e0e0e0;
  margin: 0 0 20px;
}

.dark-theme .panel-divider {
  background: #333;
}

/* 已生成成果 */
.achievements-section {
  margin-bottom: 20px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 12px;
}

.empty-achievements {
  padding: 30px 20px;
  text-align: center;
  color: #999;
}

.empty-achievements p {
  margin: 0 0 4px;
  font-size: 13px;
}

.empty-achievements .hint {
  font-size: 12px;
}

.achievements-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.achievement-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: #f9f9f9;
  border-radius: 10px;
  transition: all 0.15s;
}

.dark-theme .achievement-item {
  background: #252525;
}

.achievement-item:hover {
  background: #f0f0f0;
}

.achievement-info {
  flex: 1;
  min-width: 0;
}

.achievement-name {
  font-size: 13px;
  font-weight: 500;
  color: #333;
  margin-bottom: 4px;
}

.dark-theme .achievement-name {
  color: #e0e0e0;
}

.achievement-meta {
  font-size: 11px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 6px;
}

.dot {
  font-size: 8px;
}

.achievement-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s;
}

.achievement-item:hover .achievement-actions {
  opacity: 1;
}

.play-btn,
.more-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0,0,0,0.05);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  color: #666;
}

.dark-theme .play-btn,
.dark-theme .more-btn {
  background: rgba(255,255,255,0.1);
  color: #b0b0b0;
}

.play-btn:hover,
.more-btn:hover {
  background: rgba(0,0,0,0.1);
  color: #333;
}

/* 添加笔记按钮 */
.add-note-section {
  position: sticky;
  bottom: 0;
  padding-top: 12px;
  background: linear-gradient(to bottom, transparent, #fff);
}

.dark-theme .add-note-section {
  background: linear-gradient(to bottom, transparent, #1e1e1e);
}

.add-note-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 20px;
  background: #1a73e8;
  color: white;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(26, 115, 232, 0.3);
}

.add-note-btn:hover {
  background: #1557b0;
}

/* 成果详情 */
.achievement-detail-meta {
  font-size: 12px;
  color: #999;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.achievement-detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 16px;
}

.achievement-action-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 14px;
  background: #f5f5f5;
  border: 1px solid #e0e0e0;
  border-radius: 10px;
  font-size: 13px;
  color: #333;
  cursor: pointer;
  transition: all 0.15s;
}

.achievement-action-btn:hover {
  background: #ebebeb;
}

.achievement-action-btn.primary {
  background: #e8f0fe;
  border-color: #c5d8fb;
  color: #1a73e8;
}

.achievement-action-btn.primary:hover {
  background: #d2e3fc;
}

.achievement-action-btn.danger {
  background: #fce8e6;
  border-color: #f5c6c2;
  color: #d93025;
}

.achievement-action-btn.danger:hover {
  background: #fad2cf;
}

.dark-theme .achievement-action-btn {
  background: #2a2a2a;
  border-color: #444;
  color: #e0e0e0;
}

.dark-theme .achievement-action-btn:hover {
  background: #333;
}
</style>
