<template>
  <div class="agent-chat-tab" v-show="visible">
    <!-- 消息列表 -->
    <div class="messages-list" ref="messagesListRef">
      <!-- 欢迎引导（无消息且未在流式输出时显示） -->
      <div v-if="messages.length === 0 && !isStreaming" class="welcome-guide">
        <div class="welcome-icon">
          <Icon name="robot" :size="48" />
        </div>
        <h3 class="welcome-title">{{ t('agent.welcomeTitle') }}</h3>
        <p class="welcome-desc">{{ t('agent.welcomeDesc') }}</p>
        <div class="welcome-hints">
          <div class="hint-item" v-for="(hint, i) in welcomeHints" :key="i" @click="handleSend(hint)">
            <Icon name="send" :size="14" class="hint-icon" />
            <span>{{ hint }}</span>
          </div>
        </div>
      </div>

      <template v-for="msg in messages" :key="msg.id">
        <!-- 用户/助手消息 -->
        <MessageBubble v-if="msg.role === 'user' || msg.role === 'assistant'" :message="msg" />
        <!-- 工具调用 -->
        <ToolCallCard v-else-if="msg.role === 'tool'" :message="msg" />
      </template>

      <!-- 历史会话恢复提示 -->
      <div v-if="isRestored && messages.length > 0" class="restored-divider">
        <span class="restored-line"></span>
        <span class="restored-text">{{ t('agent.restoredHint') }}</span>
        <span class="restored-line"></span>
      </div>

      <!-- 流式输出指示器 -->
      <StreamingIndicator
        :visible="isStreaming"
        :text="currentStreamText"
        :elapsed="streamingElapsed"
      />

      <!-- 错误提示 -->
      <div v-if="error" class="error-banner">
        <Icon name="xCircle" :size="16" />
        <span>{{ error }}</span>
      </div>

      <!-- 滚动锚点 -->
      <div ref="scrollAnchor"></div>
    </div>

    <!-- 输入框 -->
    <ChatInput
      ref="chatInputRef"
      :is-streaming="isStreaming"
      :is-compacting="isCompacting"
      :disabled="false"
      :placeholder="t('agent.inputPlaceholder')"
      :context-tokens="contextTokens"
      :slash-commands="slashCommands"
      v-model:model-value="selectedModel"
      @send="handleSend"
      @cancel="handleCancel"
      @compact="compactConversation"
    />
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useLocale } from '@composables/useLocale'
import { useAgentChat } from '@composables/useAgentChat'
import MessageBubble from './agent/MessageBubble.vue'
import ToolCallCard from './agent/ToolCallCard.vue'
import StreamingIndicator from './agent/StreamingIndicator.vue'
import ChatInput from './agent/ChatInput.vue'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  sessionId: {
    type: String,
    required: true
  },
  visible: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['ready'])

// 使用 Agent 对话 composable
const {
  messages,
  isStreaming,
  isRestored,
  currentStreamText,
  error,
  selectedModel,
  streamingElapsed,
  contextTokens,
  isCompacting,
  slashCommands,
  loadMessages,
  sendMessage,
  cancelGeneration,
  compactConversation,
  setupListeners,
  cleanup
} = useAgentChat(props.sessionId)

// 欢迎引导提示词
const welcomeHints = computed(() => [
  t('agent.hintTranslate'),
  t('agent.hintSummarize'),
  t('agent.hintCode'),
  t('agent.hintAnalyze')
])

const messagesListRef = ref(null)
const scrollAnchor = ref(null)
const chatInputRef = ref(null)

// 自动滚动到底部
const scrollToBottom = () => {
  nextTick(() => {
    if (scrollAnchor.value) {
      scrollAnchor.value.scrollIntoView({ behavior: 'smooth' })
    }
  })
}

// 监听消息变化，自动滚动
watch([messages, currentStreamText], () => {
  scrollToBottom()
})

// 发送消息
const handleSend = async (text) => {
  await sendMessage(text)
  scrollToBottom()
}

// 取消生成
const handleCancel = async () => {
  await cancelGeneration()
}

onMounted(async () => {
  setupListeners()
  await loadMessages()  // 加载历史消息
  scrollToBottom()
  emit('ready', { sessionId: props.sessionId })
})

onUnmounted(() => {
  cleanup()
})

defineExpose({
  focus: () => chatInputRef.value?.focus()
})
</script>

<style scoped>
.agent-chat-tab {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color);
}

.messages-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px 0;
}

/* Welcome Guide */
.welcome-guide {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
  text-align: center;
}

.welcome-icon {
  color: var(--primary-color);
  opacity: 0.7;
  margin-bottom: 16px;
}

.welcome-title {
  font-size: 20px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
}

.welcome-desc {
  font-size: 14px;
  color: var(--text-color-muted);
  margin: 0 0 24px;
  max-width: 400px;
  line-height: 1.6;
}

.welcome-hints {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 100%;
  max-width: 360px;
}

.hint-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-size: 13px;
  color: var(--text-color);
  cursor: pointer;
  transition: all 0.2s;
}

.hint-item:hover {
  border-color: var(--primary-color);
  background: var(--hover-bg);
}

.hint-icon {
  color: var(--primary-color);
  flex-shrink: 0;
}

/* Restored Divider */
.restored-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 24px;
  margin: 8px 0;
}

.restored-line {
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.restored-text {
  font-size: 12px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  margin: 8px 16px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 8px;
  color: #ff4d4f;
  font-size: 13px;
}
</style>
