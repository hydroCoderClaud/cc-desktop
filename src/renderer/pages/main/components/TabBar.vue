<template>
  <div class="tab-bar">
    <div class="tabs-container">
      <!-- Welcome Tab (固定在最左边) -->
      <div
        class="tab welcome-tab"
        :class="{ active: activeTabId === 'welcome' }"
        @click="$emit('select-tab', { id: 'welcome' })"
      >
        <span class="tab-icon">🏠</span>
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
          {{ getStatusIcon(tab.status, tab.type) }}
        </span>
        <span class="tab-name" :title="tab.title || tab.projectPath">
          {{ tab.title || tab.projectName || 'Session' }}
        </span>
        <button
          class="tab-close"
          @click.stop="closeTab(tab)"
          title="断开连接（后台继续运行）"
        >
          ×
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
      +
    </button>
  </div>
</template>

<script setup>
import { getSessionStatusIcon } from '@composables/useSessionUtils'

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

// 使用公共函数
const getStatusIcon = getSessionStatusIcon
</script>

<style scoped>
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--bg-color);
  border-bottom: 1px solid var(--border-color);
  padding: 0 8px;
  height: 40px;
  gap: 4px;
}

.tabs-container {
  display: flex;
  align-items: center;
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
  position: relative;
  top: 1px;
  color: var(--text-color);
}

.tab:hover {
  background: var(--hover-bg);
}

.tab.active {
  background: var(--bg-color-secondary);
  border-color: var(--primary-color);
  border-bottom-color: var(--bg-color-secondary);
}

.welcome-tab {
  min-width: auto;
  max-width: none;
  padding: 6px 10px;
  background: var(--bg-color-tertiary);
}

.welcome-tab.active {
  background: var(--bg-color-secondary);
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
