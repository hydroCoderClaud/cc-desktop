<template>
  <div class="agent-chat-tab" v-show="visible">
    <!-- 消息列表 -->
    <div class="messages-list" ref="messagesListRef">
      <template v-for="msg in messages" :key="msg.id">
        <!-- 用户/助手消息 -->
        <MessageBubble v-if="msg.role === 'user' || msg.role === 'assistant'" :message="msg" />
        <!-- 工具调用 -->
        <ToolCallCard v-else-if="msg.role === 'tool'" :message="msg" />
      </template>

      <!-- 流式输出指示器 -->
      <StreamingIndicator
        :visible="isStreaming"
        :text="currentStreamText"
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
      :disabled="false"
      :placeholder="t('agent.inputPlaceholder')"
      @send="handleSend"
      @cancel="handleCancel"
    />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
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
  currentStreamText,
  error,
  loadMessages,
  sendMessage,
  cancelGeneration,
  setupListeners,
  cleanup
} = useAgentChat(props.sessionId)

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
