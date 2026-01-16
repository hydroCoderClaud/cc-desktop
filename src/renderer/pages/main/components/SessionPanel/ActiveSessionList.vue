<template>
  <div class="active-sessions">
    <div class="section-header">
      <span class="dot running"></span>
      <span>运行中 ({{ sessions.length }})</span>
    </div>

    <div
      v-for="(session, index) in sessions"
      :key="session.id"
      class="session-item"
      :class="{
        active: focusedSessionId === session.id,
        'other-project': currentProjectId && session.projectId !== currentProjectId
      }"
      @click="$emit('select', session)"
    >
      <div class="session-info">
        <div class="session-name">
          <span class="status-icon" :class="session.status">
            {{ getStatusIcon(session.status) }}
          </span>
          <span class="name">{{ session.title || session.projectName || 'Session' }}</span>
        </div>
        <div class="session-meta">
          <span v-if="session.title" class="project-name-hint">{{ session.projectName }} · </span>
          {{ formatTime(session.createdAt) }} · PID: {{ session.pid || '-' }}
        </div>
      </div>
      <div class="session-actions">
        <div class="order-btns">
          <button
            class="order-btn"
            :disabled="index === 0"
            @click.stop="$emit('move-up', index)"
            title="上移"
          >
            ↑
          </button>
          <button
            class="order-btn"
            :disabled="index === sessions.length - 1"
            @click.stop="$emit('move-down', index)"
            title="下移"
          >
            ↓
          </button>
        </div>
        <button
          class="close-btn"
          @click.stop="$emit('close', session)"
          title="终止会话"
        >
          ×
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { getSessionStatusIcon } from '@composables/useSessionUtils'
import { formatTimeShort } from '@composables/useFormatters'

defineProps({
  sessions: {
    type: Array,
    default: () => []
  },
  focusedSessionId: {
    type: String,
    default: null
  },
  currentProjectId: {
    type: Number,
    default: null
  }
})

defineEmits(['select', 'close', 'move-up', 'move-down'])

// 使用公共函数
const getStatusIcon = getSessionStatusIcon
const formatTime = formatTimeShort
</script>

<style scoped>
.active-sessions {
  margin-bottom: 16px;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  padding: 8px 8px 4px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #52c41a;
}

.dot.running {
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.session-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color-tertiary);
  border: 1px solid transparent;
}

.session-item:hover {
  background: var(--hover-bg);
}

.session-item.active {
  background: var(--warning-bg);
  border-color: var(--primary-color);
}

.session-info {
  flex: 1;
  overflow: hidden;
}

.session-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
}

.status-icon {
  font-size: 12px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-meta {
  font-size: 11px;
  color: var(--text-color-muted);
  margin-top: 2px;
}

.project-name-hint {
  color: #52c41a;
}

.session-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.2s;
}

.session-item:hover .session-actions {
  opacity: 1;
}

.order-btns {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.order-btn {
  width: 18px;
  height: 14px;
  border-radius: 3px;
  background: transparent;
  border: 1px solid var(--border-color);
  font-size: 10px;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
  line-height: 1;
}

.order-btn:hover:not(:disabled) {
  background: var(--hover-bg);
  border-color: var(--primary-color);
  color: var(--primary-color);
}

.order-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.close-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 16px;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.close-btn:hover {
  background: #ff4d4f;
  color: white;
}

/* 其他项目的会话样式 */
.session-item.other-project {
  opacity: 0.7;
  border-left: 3px solid var(--text-color-muted);
}

.session-item.other-project:hover {
  opacity: 1;
}
</style>
