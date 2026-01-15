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
        <span class="tab-icon" :class="tab.status">
          {{ getStatusIcon(tab.status) }}
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
      v-if="currentProject"
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
  background: #f5f5f0;
  border-bottom: 1px solid #e5e5e0;
  padding: 0 8px;
  height: 40px;
  gap: 4px;
}

:deep(.dark-theme) .tab-bar {
  background: #2a2a2a;
  border-color: #333333;
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
  background: #ffffff;
  border: 1px solid #e5e5e0;
  border-bottom: none;
  border-radius: 8px 8px 0 0;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 180px;
  min-width: 100px;
  position: relative;
  top: 1px;
}

:deep(.dark-theme) .tab {
  background: #333333;
  border-color: #444444;
}

.tab:hover {
  background: #fafafa;
}

:deep(.dark-theme) .tab:hover {
  background: #3a3a3a;
}

.tab.active {
  background: #ffffff;
  border-color: #ff6b35;
  border-bottom-color: #ffffff;
}

:deep(.dark-theme) .tab.active {
  background: #242424;
  border-bottom-color: #242424;
}

.welcome-tab {
  min-width: auto;
  max-width: none;
  padding: 6px 10px;
  background: #f0f0f0;
}

:deep(.dark-theme) .welcome-tab {
  background: #2d2d2d;
}

.welcome-tab.active {
  background: #ffffff;
}

:deep(.dark-theme) .welcome-tab.active {
  background: #242424;
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
  color: #999999;
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
  border-radius: 6px;
  background: transparent;
  border: 1px dashed #cccccc;
  font-size: 16px;
  color: #999999;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.new-tab-btn:hover {
  background: #ff6b35;
  border-style: solid;
  border-color: #ff6b35;
  color: white;
}
</style>
