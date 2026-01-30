<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <!-- Welcome Tab (固定在最左边) -->
      <div
        class="tab welcome-tab"
        :class="{ active: activeTabId === 'welcome' }"
        @click="$emit('select-tab', { id: 'welcome' })"
      >
        <span class="tab-icon"><Icon name="home" :size="14" /></span>
        <span class="tab-name">欢迎</span>
      </div>

      <!-- Session Tabs -->
      <div
        v-for="tab in tabs"
        :key="tab.id"
        class="tab"
        :class="{ active: activeTabId === tab.id }"
        @click="selectTab(tab)"
      >
        <span class="tab-icon" :class="[tab.status, tab.type]">
          <Icon :name="getStatusIconName(tab.status, tab.type)" :size="12" />
        </span>
        <span class="tab-name" :title="tab.title || tab.projectPath">
          {{ tab.title || tab.projectName || 'Session' }}
        </span>
        <button
          class="tab-close"
          @click.stop="closeTab(tab)"
          title="断开连接（后台继续运行）"
        >
          <Icon name="close" :size="12" />
        </button>
      </div>
    </div>

    <!-- 新建 Tab 按钮 -->
    <button
      v-if="showNewButton && currentProject"
      class="new-tab-btn"
      @click="$emit('new-tab')"
      title="新建会话"
    >
      <Icon name="add" :size="16" />
    </button>
  </div>
</template>

<script setup>
import Icon from '@components/icons/Icon.vue'
import { SessionStatus, SessionType } from '@composables/useSessionUtils'

// Props
const props = defineProps({
  tabs: {
    type: Array,
    default: () => []
    // Tab 结构: { id, sessionId, projectId, projectName, projectPath, title, status }
  },
  activeTabId: {
    type: String,
    default: null
  },
  currentProject: {
    type: Object,
    default: null
  },
  showNewButton: {
    type: Boolean,
    default: true
  }
})

// Emits
const emit = defineEmits([
  'select-tab',
  'close-tab',
  'new-tab'
])

// 选择 Tab
const selectTab = (tab) => {
  emit('select-tab', tab)
}

// 关闭 Tab
const closeTab = (tab) => {
  emit('close-tab', tab)
}

// 根据状态获取图标名称
const getStatusIconName = (status, type = SessionType.SESSION) => {
  // 纯终端使用终端图标
  if (type === SessionType.TERMINAL) {
    switch (status) {
      case SessionStatus.RUNNING:
        return 'terminal'
      case SessionStatus.STARTING:
        return 'clock'
      case SessionStatus.EXITED:
        return 'stop'
      case SessionStatus.ERROR:
        return 'xCircle'
      default:
        return 'terminal'
    }
  }

  // Claude 会话图标
  switch (status) {
    case SessionStatus.RUNNING:
      return 'play'
    case SessionStatus.STARTING:
      return 'clock'
    case SessionStatus.EXITED:
      return 'stop'
    case SessionStatus.ERROR:
      return 'xCircle'
    default:
      return 'chat'
  }
}
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: flex-end;
  background: var(--bg-color-secondary);
  padding: 0 8px;
  height: 40px;
  gap: 4px;
}

.tabs-container {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  flex: 1;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 180px;
  min-width: 100px;
  color: var(--text-color);
}

.tab:hover {
  background: var(--hover-bg);
}

.tab.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: white;
}

.welcome-tab {
  min-width: auto;
  max-width: none;
  padding: 6px 10px;
  background: var(--bg-color-tertiary);
}

.welcome-tab.active {
  background: var(--primary-color);
  color: white;
}

.tab-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.tab-icon.running {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.tab-name {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tab-close {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s;
}

.tab:hover .tab-close {
  opacity: 1;
}

.tab-close:hover {
  background: #ff4d4f;
  color: white;
}

.new-tab-btn {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--primary-color);
  border: none;
  font-size: 18px;
  font-weight: 500;
  color: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.new-tab-btn:hover {
  background: var(--primary-color-hover);
}
</style>
