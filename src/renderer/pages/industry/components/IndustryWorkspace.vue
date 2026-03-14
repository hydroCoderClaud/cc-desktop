<template>
  <div class="industry-workspace">
    <!-- 顶部导航栏 -->
    <div class="top-nav">
      <div class="nav-left">
        <div class="app-logo" @click="toggleFullscreen" :title="isFullscreen ? t('industry.nav.exitFullscreen') : t('industry.nav.fullscreen')">
          <svg width="30" height="30" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="16" cy="16" r="15" :stroke="primaryColor" stroke-width="1.5" :fill="primaryGhost"/>
            <path d="M16 7 C16 7 10 14 10 18 a6 6 0 0 0 12 0 C22 14 16 7 16 7z" :fill="primaryColor" opacity="0.85"/>
          </svg>
        </div>
        <h1
          v-if="!editingTitle"
          class="notebook-title"
          @click="startEditTitle"
          :title="t('industry.nav.editTitle')"
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
          <span>{{ t('industry.nav.createNotebook') }}</span>
        </button>
        <button class="nav-btn" :title="t('industry.nav.share')">
          <Icon name="link" :size="16" />
          <span>{{ t('industry.nav.share') }}</span>
        </button>
        <button class="nav-btn" :title="t('industry.nav.settings')">
          <Icon name="settings" :size="16" />
          <span>{{ t('industry.nav.settings') }}</span>
        </button>
        <button class="nav-btn" :title="t('industry.nav.apps')">
          <Icon name="grip" :size="16" />
          <span>{{ t('industry.nav.apps') }}</span>
        </button>
        <div class="user-avatar">
          <Icon name="user" :size="20" />
        </div>
      </div>
    </div>

    <!-- 三栏面板 -->
    <div class="panels-container">
      <SourcePanel
        :sources="sources"
        :all-selected="allSelected"
        @add-source="handleAddSource"
        @toggle-select-all="toggleSelectAll"
        @open-external="handleOpenExternal"
      />

      <div class="resize-handle" @mousedown="startResize('left', $event)"></div>

      <ChatPanel :selected-count="selectedSources.length" @send="handleSendMessage" />

      <div class="resize-handle" @mousedown="startResize('right', $event)"></div>

      <StudioPanel :achievements="achievements" :available-types="availableTypes" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useTheme } from '@composables/useTheme'
import { useIndustryLayout } from '../composables/useIndustryLayout'
import SourcePanel from './SourcePanel.vue'
import ChatPanel from './ChatPanel.vue'
import StudioPanel from './StudioPanel.vue'

const message = useMessage()
const { t } = useLocale()
const { cssVars } = useTheme()
const { startResize } = useIndustryLayout()

const primaryColor = computed(() => cssVars.value?.['--primary-color'] || '#4a90d9')
const primaryGhost = computed(() => cssVars.value?.['--primary-ghost'] || '#e8f4ff')

const notebookTitle = ref('MCP HydroSSH 推广视频')
const editingTitle = ref(false)
const titleInput = ref(null)
const isFullscreen = ref(false)

const startEditTitle = async () => {
  editingTitle.value = true
  await nextTick()
  titleInput.value?.select()
}

const stopEditTitle = () => {
  if (!notebookTitle.value.trim()) notebookTitle.value = 'MCP HydroSSH 推广视频'
  editingTitle.value = false
}

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

const availableTypes = [
  { id: 'audio', icon: 'audio', beta: false, bgColor: '#E3F2FD', color: '#1976D2', tip: '生成一个由 AI 向您演示的解说音频' },
  { id: 'presentation', icon: 'presentation', beta: true, bgColor: '#FFF3E0', color: '#F57C00', tip: '生成一份演示文稿' },
  { id: 'video', icon: 'video', beta: false, bgColor: '#E8F5E9', color: '#388E3C', tip: '生成一个由 AI 向您演示的解说视频' },
  { id: 'mindmap', icon: 'mindmap', beta: false, bgColor: '#F3E5F5', color: '#7B1FA2', tip: '生成一张思维导图' },
  { id: 'report', icon: 'fileText', beta: false, bgColor: '#FFF8E1', color: '#FFA000', tip: '生成一份详细报告' },
  { id: 'flashcard', icon: 'heart', beta: false, bgColor: '#FCE4EC', color: '#C2185B', tip: '生成学习闪卡' },
  { id: 'quiz', icon: 'clipboard', beta: true, bgColor: '#FBE9E7', color: '#D84315', tip: '生成一份测验题目' },
  { id: 'infographic', icon: 'image', beta: true, bgColor: '#E0F7FA', color: '#0097A7', tip: '生成一张信息图' },
  { id: 'table', icon: 'table', beta: false, bgColor: '#EDE7F6', color: '#512DA8', tip: '生成一份数据表格' }
]

const sources = ref([
  {
    id: '1',
    name: 'Page not found · GitHub · GitHub',
    type: 'web',
    selected: true,
    url: 'https://github.com/not-found',
    summary: '这份文档展示了一个典型的 GitHub 错误页面导航结构，在告知用户无法找到特定页面的同时，提供了全面的平台功能索引。',
    tags: ['AI 代码生成', '开发者工具', '应用程序安全', '开源社区', '企业级解决方案'],
    content: `Navigation Menu\nToggle navigation\nSign in\n· Platform\n  ○ AI CODE CREATION\n  ○ DEVELOPER WORKFLOWS`
  },
  {
    id: '2',
    name: 'mcp-hydrocoder-ssh-readme.md',
    type: 'markdown',
    selected: true,
    summary: 'MCP HydroSSH 项目的 README 文档，介绍了 SSH 服务器管理工具的安装、配置和使用方法。',
    tags: ['MCP', 'SSH', '服务器管理'],
    content: `# MCP HydroSSH\n\nMCP HydroSSH 是一个基于 Model Context Protocol 的 SSH 服务器管理工具。`
  },
  {
    id: '3',
    name: 'mcpHydroSSH/README_CN.md',
    type: 'web',
    selected: true,
    url: 'https://github.com/hydroCoderClaud/mcpHydroSSH/blob/main/README_CN.md',
    summary: 'MCP HydroSSH 的中文文档，包含详细的使用说明和配置示例。',
    tags: ['MCP', 'SSH', '中文文档'],
    content: `# MCP HydroSSH 中文文档\n\n欢迎使用 MCP HydroSSH！`
  }
])

const achievements = ref([
  { id: '1', type: 'video', name: 'MCP HydroSSH 推广视频', icon: 'video', color: '#388E3C', sourceCount: 1, time: '2 小时前' },
  { id: '2', type: 'report', name: 'HydroCoder SSH 全栈管理指南', icon: 'fileText', color: '#FFA000', sourceCount: 3, time: '2 小时前' },
  { id: '3', type: 'table', name: 'MCP 工具与功能规范', icon: 'table', color: '#512DA8', sourceCount: 3, time: '2 小时前' },
  { id: '4', type: 'video', name: 'MCP HydroSSH：你的 SSH 助手', icon: 'video', color: '#388E3C', sourceCount: 1, time: '1 天前' }
])

const selectedSources = computed(() => sources.value.filter(s => s.selected))
const allSelected = computed(() => sources.value.length > 0 && sources.value.every(s => s.selected))

const toggleSelectAll = () => {
  const newValue = !allSelected.value
  sources.value.forEach(s => s.selected = newValue)
}

const handleAddSource = () => message.info('添加来源功能开发中...')
const handleOpenExternal = (source) => {
  if (source.url) window.open(source.url, '_blank')
  else message.info(`外部打开：${source.name}`)
}
const handleSendMessage = () => message.info('发送消息功能开发中...')
</script>

<style scoped>
.industry-workspace {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg-color);
  color: var(--text-color);
}

.top-nav {
  display: flex;
  justify-content: space-between;
  align-items: center;
  height: 56px;
  min-height: 56px;
  max-height: 56px;
  padding: 10px 24px 0;
  background: var(--bg-color);
  flex-shrink: 0;
  overflow: hidden;
}

.nav-left { display: flex; align-items: center; gap: 8px; }

.app-logo {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: transparent;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
}

.app-logo:hover { background: var(--hover-bg); }

.notebook-title {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  cursor: pointer;
  border-radius: 6px;
  padding: 2px 6px;
}

.notebook-title:hover { background: var(--hover-bg); }

.notebook-title-input {
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color);
  margin: 0;
  border: 1px solid var(--primary-color);
  border-radius: 6px;
  padding: 2px 6px;
  outline: none;
  background: var(--bg-color-secondary);
  min-width: 200px;
}

.nav-right { display: flex; align-items: center; gap: 8px; }

.create-notebook-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 18px;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.create-notebook-btn:hover { background: var(--primary-color-hover); }

.nav-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 14px;
  background: var(--hover-bg);
  border: none;
  border-radius: 20px;
  color: var(--text-color);
  font-size: 14px;
  cursor: pointer;
  transition: background 0.15s;
}

.nav-btn:hover { background: var(--border-color); }

.user-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  cursor: pointer;
  margin-left: 8px;
  border: 2px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  color: var(--text-color-muted);
}

.panels-container {
  flex: 1;
  display: flex;
  gap: 0;
  padding: 8px 16px 16px;
  overflow: hidden;
  align-items: stretch;
}

.resize-handle {
  width: 4px;
  height: 100%;
  cursor: col-resize;
  flex-shrink: 0;
  border-radius: 2px;
  background: transparent;
  margin: 0 4px;
  transition: background 0.15s;
}

.resize-handle:hover { background: var(--border-color); }
</style>
