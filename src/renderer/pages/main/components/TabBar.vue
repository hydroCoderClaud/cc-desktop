<template>
  <div class="tab-bar" :class="{ 'has-right-toggle': showRightToggle }">
    <div class="tabs-container">
      <!-- Welcome Tab (固定在最左边) -->
      <div
        class="tab welcome-tab"
        :class="{ active: activeTabId === 'welcome' }"
        @click="$emit('select-tab', { id: 'welcome' })"
      >
        <span class="tab-icon"><Icon name="home" :size="14" /></span>
        <span class="tab-name">{{ t('main.welcome') }}</span>
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
          <Icon :name="getStatusIconName(tab.status, tab.type, tab.sessionType)" :size="12" />
        </span>
        <span class="tab-name" :title="tab.title || tab.projectPath">
          {{ tab.title || tab.projectName || 'Session' }}
        </span>
        <button
          class="tab-close"
          @click.stop="closeTab(tab)"
          :title="t('common.disconnect')"
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
      :title="t('session.newSession')"
    >
      <Icon name="add" :size="16" />
    </button>
    <button
      v-if="showRightToggle"
      class="header-side-toggle"
      @click="$emit('open-right-panel')"
      :title="t('panel.showRight')"
    >
      <Icon name="panelRight" :size="16" :strokeWidth="1.8" />
    </button>
  </div>
</template>

<script setup>
import Icon from '@components/icons/Icon.vue'
import { SessionStatus, SessionType } from '@composables/useSessionUtils'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

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
  },
  showRightToggle: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits([
  'select-tab',
  'close-tab',
  'new-tab',
  'open-right-panel'
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
const getStatusIconName = (status, type = SessionType.SESSION, sessionType = '') => {
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

  // Agent 对话图标
  if (type === SessionType.AGENT_CHAT) {
    // 钉钉会话使用特殊图标
    if (sessionType === 'dingtalk') {
      return status === SessionStatus.ERROR ? 'xCircle' : 'dingtalk'
    }
    switch (status) {
      case SessionStatus.RUNNING:
        return 'robot'
      case SessionStatus.STARTING:
        return 'clock'
      case SessionStatus.EXITED:
        return 'stop'
      case SessionStatus.ERROR:
        return 'xCircle'
      default:
        return 'robot'
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
  box-sizing: border-box;
  position: relative;
  display: flex;
  align-items: center;
  background: var(--panel-bg-subtle);
  border: 1px solid var(--panel-border);
  border-bottom: none;
  border-radius: var(--panel-radius) var(--panel-radius) 0 0;
  padding: 0 10px;
  height: 50px;
  gap: 6px;
  flex-shrink: 0;
}

.tab-bar.has-right-toggle {
  padding-right: 12px;
}

.tab-bar::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--panel-border);
}

.tabs-container {
  display: flex;
  align-items: stretch;
  gap: 4px;
  flex: 1;
  height: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.tabs-container::-webkit-scrollbar {
  display: none;
}

.tab {
  position: relative;
  display: flex;
  align-items: center;
  align-self: stretch;
  gap: 6px;
  height: 100%;
  padding: 0 12px;
  min-height: 0;
  background: transparent;
  border: none;
  border-radius: 0;
  cursor: pointer;
  transition: all 0.2s;
  max-width: 180px;
  min-width: 84px;
  color: var(--text-color-muted);
}

.tab:hover {
  color: var(--text-color);
  background: color-mix(in srgb, var(--hover-bg) 45%, transparent);
}

.tab.active {
  background: transparent;
  color: var(--primary-color);
  box-shadow: none;
}

.tab.active::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 1px;
  background: var(--primary-color);
  z-index: 1;
}

.welcome-tab {
  min-width: auto;
  max-width: none;
  padding: 0 10px 0 8px;
}

.welcome-tab.active {
  background: transparent;
  color: var(--primary-color);
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
  font-size: 12px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.tab.active .tab-name {
  font-weight: 600;
}

.tab-close {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 14px;
  color: currentColor;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  opacity: 0;
  transition: all 0.15s;
}

.tab:hover .tab-close {
  opacity: 0.55;
}

.tab.active .tab-close {
  opacity: 0.38;
}

.tab-close:hover {
  background: var(--danger-color);
  color: white;
}

.new-tab-btn {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  font-size: 18px;
  font-weight: 500;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: all 0.2s;
}

.header-side-toggle {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: transparent;
  border: 1px solid transparent;
  font-size: 18px;
  font-weight: 500;
  color: var(--primary-color);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-right: 6px;
  opacity: 0.82;
  transition: all 0.2s;
}

.new-tab-btn:hover,
.header-side-toggle:hover {
  background: var(--hover-bg);
  color: var(--primary-color-hover);
}
</style>
