<template>
  <div class="session-toolbar">
    <div class="toolbar-title">
      <span class="icon">💬</span>
      <span class="text">{{ t('sessionManager.sessions') }}</span>
      <span v-if="activeSessions.length > 0" class="count">({{ activeSessions.length }})</span>
    </div>
    <button
      class="new-session-btn"
      @click="$emit('new-session')"
      :disabled="!project"
      :title="project ? t('sessionManager.newConversation') : t('messages.pleaseSelectProject')"
    >
      <span>+</span>
    </button>
  </div>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

defineProps({
  project: {
    type: Object,
    default: null
  },
  activeSessions: {
    type: Array,
    default: () => []
  }
})

defineEmits(['new-session'])
</script>

<style scoped>
.session-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #e5e5e0;
  background: #fafafa;
}

:deep(.dark-theme) .session-toolbar {
  background: #2a2a2a;
  border-color: #333333;
}

.toolbar-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  color: #666666;
}

:deep(.dark-theme) .toolbar-title {
  color: #999999;
}

.toolbar-title .icon {
  font-size: 16px;
}

.toolbar-title .count {
  font-weight: 400;
  color: #999999;
}

.new-session-btn {
  width: 28px;
  height: 28px;
  border-radius: 6px;
  background: #ff6b35;
  color: white;
  border: none;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.new-session-btn:hover:not(:disabled) {
  background: #ff5722;
  transform: scale(1.05);
}

.new-session-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
