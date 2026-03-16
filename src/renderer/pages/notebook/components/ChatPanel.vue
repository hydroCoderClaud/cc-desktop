<template>
  <div class="main-content">
    <div class="chat-header">
      <span class="chat-title">{{ t('notebook.chat.title') }}</span>
    </div>
    <div class="chat-content">
      <div class="welcome-message">
        <h2>{{ t('notebook.chat.welcome') }}</h2>
        <p class="welcome-subtitle">{{ t('notebook.chat.subtitle') }}</p>
      </div>
    </div>
    <div class="chat-input-area">
      <div class="input-wrapper">
        <input
          type="text"
          :placeholder="t('notebook.chat.placeholder')"
          class="chat-input"
          @keyup.enter="$emit('send')"
        />
        <span class="sources-count">{{ t('notebook.chat.sources', { count: selectedCount }) }}</span>
        <button class="send-btn" @click="$emit('send')">
          <Icon name="send" :size="18" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'

defineProps({ selectedCount: { type: Number, default: 0 } })
defineEmits(['send'])

const { t } = useLocale()
</script>

<style scoped>
.main-content {
  flex: 1;
  min-width: 300px;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
}

.chat-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 52px;
  min-height: 52px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.chat-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.chat-content {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.welcome-message {
  text-align: center;
  padding: 40px 20px;
}

.welcome-message h2 {
  font-size: 24px;
  font-weight: 600;
  color: var(--text-color);
  margin: 0 0 8px;
}

.welcome-subtitle {
  font-size: 14px;
  color: var(--text-color-muted);
  margin: 0;
}

.chat-input-area { padding: 16px 20px; }

.input-wrapper {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 800px;
  margin: 0 auto;
  padding: 8px 16px 8px 20px;
  background: var(--bg-color-tertiary);
  border-radius: 28px;
}

.chat-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-color);
  outline: none;
}

.chat-input::placeholder { color: var(--text-color-muted); }

.sources-count {
  font-size: 12px;
  color: var(--text-color-muted);
  white-space: nowrap;
}

.send-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary-color);
  color: #fff;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: background 0.15s;
  flex-shrink: 0;
}

.send-btn:hover { background: var(--primary-color-hover); }
</style>
