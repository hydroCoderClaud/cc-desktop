<template>
  <div class="agent-left-content">
    <!-- 新建对话按钮 -->
    <div class="new-session-area">
      <button class="new-session-btn" @click="handleNewConversation">
        <span class="icon">+</span>
        <span>{{ t('agent.newConversation') }}</span>
      </button>
    </div>

    <!-- 对话列表 -->
    <div class="conversation-list">
      <!-- 今天 -->
      <template v-if="groupedConversations.today.length > 0">
        <div class="group-header">
          <span>{{ t('common.today') || '今天' }}</span>
        </div>
        <div
          v-for="conv in groupedConversations.today"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: activeSessionId === conv.id }"
          @click="$emit('select', conv)"
        >
          <div class="conv-info">
            <Icon name="chat" :size="12" class="conv-icon" />
            <span class="conv-title">{{ conv.title || t('agent.chat') }}</span>
          </div>
          <div class="conv-actions">
            <button class="action-btn" @click.stop="$emit('close', conv)" :title="t('common.close')">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
      </template>

      <!-- 昨天 -->
      <template v-if="groupedConversations.yesterday.length > 0">
        <div class="group-header">
          <span>{{ t('common.yesterday') }}</span>
        </div>
        <div
          v-for="conv in groupedConversations.yesterday"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: activeSessionId === conv.id }"
          @click="$emit('select', conv)"
        >
          <div class="conv-info">
            <Icon name="chat" :size="12" class="conv-icon" />
            <span class="conv-title">{{ conv.title || t('agent.chat') }}</span>
          </div>
          <div class="conv-actions">
            <button class="action-btn" @click.stop="$emit('close', conv)" :title="t('common.close')">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
      </template>

      <!-- 更早 -->
      <template v-if="groupedConversations.older.length > 0">
        <div class="group-header">
          <span>{{ t('session.older') || '更早' }}</span>
        </div>
        <div
          v-for="conv in groupedConversations.older"
          :key="conv.id"
          class="conversation-item"
          :class="{ active: activeSessionId === conv.id }"
          @click="$emit('select', conv)"
        >
          <div class="conv-info">
            <Icon name="chat" :size="12" class="conv-icon" />
            <span class="conv-title">{{ conv.title || t('agent.chat') }}</span>
          </div>
          <div class="conv-actions">
            <button class="action-btn" @click.stop="$emit('close', conv)" :title="t('common.close')">
              <Icon name="close" :size="12" />
            </button>
          </div>
        </div>
      </template>

      <!-- 空状态 -->
      <div v-if="conversations.length === 0 && !loading" class="empty-hint">
        <Icon name="robot" :size="32" style="margin-bottom: 8px; opacity: 0.5;" />
        <div>{{ t('agent.noConversations') }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useAgentPanel } from '@composables/useAgentPanel'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  activeSessionId: {
    type: String,
    default: null
  }
})

const emit = defineEmits(['select', 'close', 'created'])

const {
  conversations,
  loading,
  groupedConversations,
  loadConversations,
  createConversation,
  closeConversation
} = useAgentPanel()

const handleNewConversation = async () => {
  const session = await createConversation({ type: 'chat' })
  if (session) {
    emit('created', session)
  }
}

onMounted(() => {
  loadConversations()
})

defineExpose({
  loadConversations,
  createConversation,
  closeConversation
})
</script>

<style scoped>
.agent-left-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.new-session-area {
  padding: 12px;
  flex-shrink: 0;
}

.new-session-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 10px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.new-session-btn:hover {
  background: var(--primary-color-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(255, 107, 53, 0.3);
}

.new-session-btn .icon {
  font-size: 16px;
  font-weight: bold;
}

.conversation-list {
  flex: 1;
  overflow-y: auto;
  padding: 0 12px 12px;
}

.group-header {
  display: flex;
  align-items: center;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  padding: 12px 4px 6px;
}

.conversation-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  margin-bottom: 2px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
}

.conversation-item:hover {
  background: var(--hover-bg);
}

.conversation-item.active {
  background: var(--warning-bg);
  border: 1px solid var(--primary-color);
}

.conv-info {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 0;
}

.conv-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

.conv-title {
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.conv-actions {
  display: flex;
  opacity: 0;
  transition: opacity 0.15s;
}

.conversation-item:hover .conv-actions {
  opacity: 1;
}

.action-btn {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.action-btn:hover {
  background: #ff4d4f;
  color: white;
}

.empty-hint {
  padding: 24px 16px;
  text-align: center;
  font-size: 13px;
  color: var(--text-color-muted);
  display: flex;
  flex-direction: column;
  align-items: center;
}
</style>
