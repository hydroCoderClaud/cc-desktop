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
          <span v-if="currentProjectId && session.projectId !== currentProjectId" class="other-badge">
            其他
          </span>
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
  color: #8c8c8c;
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
  background: #f9f9f9;
  border: 1px solid transparent;
}

:deep(.dark-theme) .session-item {
  background: #2a2a2a;
}

.session-item:hover {
  background: #f0f0f0;
}

:deep(.dark-theme) .session-item:hover {
  background: #333333;
}

.session-item.active {
  background: #fff7e6;
  border-color: #ff6b35;
}

:deep(.dark-theme) .session-item.active {
  background: #3a2a1a;
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
  color: #8c8c8c;
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
  border: 1px solid #d9d9d9;
  font-size: 10px;
  color: #8c8c8c;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  padding: 0;
  line-height: 1;
}

.order-btn:hover:not(:disabled) {
  background: #f0f0f0;
  border-color: #ff6b35;
  color: #ff6b35;
}

.order-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

:deep(.dark-theme) .order-btn {
  border-color: #444;
  color: #888;
}

:deep(.dark-theme) .order-btn:hover:not(:disabled) {
  background: #3a3a3a;
}

.close-btn {
  width: 22px;
  height: 22px;
  border-radius: 4px;
  background: transparent;
  border: none;
  font-size: 16px;
  color: #999999;
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
  border-left: 3px solid #8c8c8c;
}

.session-item.other-project:hover {
  opacity: 1;
}

.other-badge {
  font-size: 10px;
  padding: 1px 5px;
  background: #8c8c8c;
  color: white;
  border-radius: 4px;
  margin-left: 4px;
}

:deep(.dark-theme) .other-badge {
  background: #666666;
}
</style>
