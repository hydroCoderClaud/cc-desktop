<template>
  <div class="message-viewer-panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <span>{{ t('sessionManager.conversation') }}</span>
        <!-- Tag filter dropdown (click) -->
        <div v-if="messageFilterTagList.length > 0" class="tag-filter-wrapper" v-click-outside="() => showTagFilter = false">
          <span class="filter-icon" :class="{ active: activeTagFilter }" @click="showTagFilter = !showTagFilter">🏷️</span>
          <div v-show="showTagFilter" class="tag-filter-dropdown">
            <div
              class="tag-filter-all"
              :class="{ active: !activeTagFilter }"
              @click="handleFilterSelect('all')"
            >
              {{ t('sessionManager.showAll') }}
            </div>
            <div class="tag-filter-list">
              <n-tag
                v-for="{ tag, count } in messageFilterTagList"
                :key="tag.id"
                size="small"
                :color="{ color: activeTagFilter?.id === tag.id ? tag.color : 'transparent', textColor: activeTagFilter?.id === tag.id ? '#fff' : 'inherit', borderColor: tag.color }"
                class="tag-filter-item"
                @click="handleFilterSelect(tag.id)"
              >
                {{ tag.name }} ({{ count }})
              </n-tag>
            </div>
          </div>
        </div>
      </div>
      <n-space v-if="selectedSession" align="center">
        <span class="select-hint">{{ t('sessionManager.selectHint') }}</span>
        <span class="nav-buttons">
          <n-tooltip>
            <template #trigger>
              <n-button size="small" quaternary @click="scrollToOldest">⬆️</n-button>
            </template>
            {{ t('sessionManager.goToOldest') }}
          </n-tooltip>
          <n-tooltip>
            <template #trigger>
              <n-button size="small" quaternary @click="scrollToNewest">⬇️</n-button>
            </template>
            {{ t('sessionManager.goToNewest') }}
          </n-tooltip>
        </span>
        <n-dropdown :options="copyOptions" @select="handleCopy">
          <n-button size="small">
            {{ t('sessionManager.copy') }}
            <span v-if="selectedMessages.length > 0" class="selected-count">({{ selectedMessages.length }})</span>
          </n-button>
        </n-dropdown>
        <n-dropdown :options="exportOptions" @select="handleExport">
          <n-button size="small">
            {{ t('sessionManager.export') }}
            <span v-if="selectedMessages.length > 0" class="selected-count">({{ selectedMessages.length }})</span>
          </n-button>
        </n-dropdown>
      </n-space>
    </div>
    <n-scrollbar ref="scrollbarRef" style="max-height: calc(100vh - 220px)">
      <n-spin :show="loadingMessages">
        <div v-if="!selectedSession" class="empty-state">
          <n-empty :description="t('sessionManager.selectSession')" />
        </div>
        <div v-else-if="displayMessages.length === 0 && !loadingMessages" class="empty-state">
          <n-empty :description="activeTagFilter ? t('sessionManager.noTaggedMessages') : t('sessionManager.noMessages')" />
        </div>
        <div v-else class="messages-container" @click="handleLinkClick">
          <div
            v-for="msg in displayMessages"
            :key="msg.id"
            :data-message-id="msg.id"
            class="message-item"
            :class="[msg.role, { highlighted: highlightedMessageId === msg.id, active: selectedMessages.some(m => m.id === msg.id) }]"
            @click="$emit('select-message', msg, $event)"
          >
            <div class="message-header">
              <span class="role-label">
                {{ msg.role === 'user' ? t('sessionManager.user') : t('sessionManager.assistant') }}
              </span>
              <div class="message-header-right">
                <span class="message-time">{{ formatTime(msg.timestamp) }}</span>
                <div class="tag-action-wrapper" v-click-outside="() => openMessageTagId = null">
                  <span class="tag-action" @click.stop="openMessageTagId = openMessageTagId === msg.id ? null : msg.id">🏷️</span>
                  <div v-show="openMessageTagId === msg.id" class="tag-filter-dropdown message-tag-dropdown">
                    <div class="tag-filter-list">
                      <n-tag
                        v-for="tag in allTags"
                        :key="tag.id"
                        size="small"
                        :color="{ color: 'transparent', textColor: 'inherit', borderColor: tag.color }"
                        class="tag-filter-item"
                        @click.stop="handleAddMessageTagSelect(msg.id, tag.id)"
                      >
                        {{ tag.name }}
                      </n-tag>
                    </div>
                    <div class="tag-filter-divider"></div>
                    <div class="quick-add-row" @click.stop>
                      <input
                        v-model="quickTagName"
                        class="quick-add-input"
                        :placeholder="t('sessionManager.quickAddTag')"
                        @keyup.enter="handleQuickAddTag(msg.id)"
                      />
                      <span class="quick-add-btn" @click="handleQuickAddTag(msg.id)">+</span>
                    </div>
                    <div class="tag-filter-action" @click.stop="handleAddMessageTagSelect(msg.id, 'manage')">
                      ⚙️ {{ t('sessionManager.manageTags') }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <!-- Message tags -->
            <div v-if="messageTagsMap[msg.id]" class="message-tags">
              <n-tag
                v-for="tag in messageTagsMap[msg.id]"
                :key="tag.id"
                size="tiny"
                :color="{ color: tag.color, textColor: '#fff' }"
                closable
                @close="$emit('remove-message-tag', msg.id, tag.id)"
                @click.stop="$emit('filter', tag.id)"
              >
                {{ tag.name }}
              </n-tag>
            </div>
            <div class="message-content" v-html="formatContent(msg.content)"></div>
            <div v-if="msg.tokens_in || msg.tokens_out" class="message-usage">
              {{ msg.tokens_in || 0 }} in / {{ msg.tokens_out || 0 }} out
            </div>
          </div>
        </div>
      </n-spin>
    </n-scrollbar>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { vClickOutside } from '@composables/useClickOutside'
import { formatTime, scrollToElement } from '@composables/useFormatters'

const { t } = useLocale()
const message = useMessage()
const scrollbarRef = ref(null)
const showTagFilter = ref(false)
const openMessageTagId = ref(null)
const quickTagName = ref('')

const props = defineProps({
  selectedSession: Object,
  displayMessages: {
    type: Array,
    required: true
  },
  selectedMessages: {
    type: Array,
    default: () => []
  },
  messageTagsMap: {
    type: Object,
    default: () => ({})
  },
  messageFilterTagList: {
    type: Array,
    default: () => []
  },
  activeTagFilter: Object,
  allTags: {
    type: Array,
    default: () => []
  },
  loadingMessages: Boolean,
  highlightedMessageId: [Number, String]
})

const emit = defineEmits([
  'select-message',
  'filter',
  'add-message-tag',
  'remove-message-tag',
  'manage-tags',
  'quick-add-tag',
  'copy',
  'export'
])

// Handle tag filter selection
const handleFilterSelect = (key) => {
  showTagFilter.value = false
  emit('filter', key)
}

// Handle add message tag selection
const handleAddMessageTagSelect = (messageId, tagId) => {
  openMessageTagId.value = null
  if (tagId === 'manage') {
    emit('manage-tags')
  } else {
    emit('add-message-tag', messageId, tagId)
  }
}

// Handle quick add tag
const handleQuickAddTag = (messageId) => {
  const name = quickTagName.value.trim()
  if (!name) return
  emit('quick-add-tag', { messageId, name })
  quickTagName.value = ''
}

// Export options
const exportOptions = computed(() => {
  const options = [
    { label: t('sessionManager.exportAllMd'), key: 'all-markdown' },
    { label: t('sessionManager.exportAllJson'), key: 'all-json' }
  ]

  if (props.selectedMessages.length > 0) {
    options.push({ type: 'divider', key: 'd1' })
    const count = props.selectedMessages.length
    options.push({ label: `${t('sessionManager.exportSelectedMd')} (${count})`, key: 'selected-markdown' })
    options.push({ label: `${t('sessionManager.exportSelectedJson')} (${count})`, key: 'selected-json' })
  }

  return options
})

// Copy options
const copyOptions = computed(() => {
  const options = [
    { label: t('sessionManager.copyAllMd'), key: 'all-markdown' },
    { label: t('sessionManager.copyAllJson'), key: 'all-json' }
  ]

  if (props.selectedMessages.length > 0) {
    options.push({ type: 'divider', key: 'd1' })
    const count = props.selectedMessages.length
    options.push({ label: `${t('sessionManager.copySelectedMd')} (${count})`, key: 'selected-markdown' })
    options.push({ label: `${t('sessionManager.copySelectedJson')} (${count})`, key: 'selected-json' })
  }

  return options
})

const handleCopy = (key) => {
  emit('copy', key)
}

const handleExport = (key) => {
  emit('export', key)
}

const scrollToOldest = () => {
  if (props.displayMessages.length > 0) {
    const firstMsg = props.displayMessages[0]
    scrollToElement(`[data-message-id="${firstMsg.id}"]`, 0)
  }
}

const scrollToNewest = () => {
  if (props.displayMessages.length > 0) {
    const lastMsg = props.displayMessages[props.displayMessages.length - 1]
    scrollToElement(`[data-message-id="${lastMsg.id}"]`, 0)
  }
}

const formatContent = (content) => {
  if (!content) return ''

  let text = String(content)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  const urlRegex = /(https?:\/\/[^\s<>"']+)/g
  text = text.replace(urlRegex, '<a href="$1" class="external-link" data-url="$1">$1</a>')
  text = text.replace(/\n/g, '<br>')

  return text
}

const handleLinkClick = (event) => {
  const target = event.target
  if (target.classList.contains('external-link')) {
    event.preventDefault()
    const url = target.dataset.url
    if (url && window.electronAPI?.openExternal) {
      window.electronAPI.openExternal(url)
    }
  }
}

// Expose scroll methods for parent component
defineExpose({
  scrollToNewest,
  scrollToOldest,
  scrollToElement
})
</script>

<style scoped>
@import '../styles/tag-dropdown.css';

.message-viewer-panel {
  flex: 1;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
  min-width: 0;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--border-color, #e0e0e0);
  font-weight: 600;
  font-size: 14px;
}

.panel-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.messages-container {
  padding: 8px 6px;
}

.message-item {
  padding: 12px 16px;
  margin-bottom: 12px;
  border-radius: 8px;
  background: var(--message-bg, #f8f8f8);
  cursor: pointer;
}

.message-item.user {
  background: var(--user-message-bg, #e6f4ff);
  margin-left: 40px;
}

.message-item.assistant {
  background: var(--assistant-message-bg, #f0f0f0);
  margin-right: 40px;
}

.message-header {
  display: flex;
  justify-content: space-between;
  margin-bottom: 8px;
  font-size: 12px;
}

.role-label {
  font-weight: 600;
  color: var(--primary-color, #1890ff);
}

.message-time {
  color: #888;
}

.message-header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.tag-action {
  cursor: pointer;
  font-size: 12px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.tag-action:hover {
  opacity: 1;
}

.tag-action-wrapper {
  position: relative;
  display: inline-block;
}

.message-tag-dropdown {
  right: 0;
  left: auto;
}

.message-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
  margin-bottom: 4px;
}

.message-content {
  font-size: 14px;
  line-height: 1.6;
  word-break: break-word;
}

.message-content :deep(.external-link) {
  color: #1890ff;
  text-decoration: underline;
  cursor: pointer;
  word-break: break-all;
}

.message-content :deep(.external-link:hover) {
  color: #40a9ff;
}

.message-usage {
  margin-top: 8px;
  font-size: 11px;
  color: #888;
  text-align: right;
}

.message-item.highlighted {
  outline: 2px solid var(--primary-color, #1890ff);
  outline-offset: 2px;
  animation: highlight-pulse 1s ease-in-out;
}

.message-item.active {
  outline: 2px solid var(--primary-color, #1890ff);
  outline-offset: 2px;
}

.selected-count {
  margin-left: 4px;
  font-size: 12px;
  color: var(--primary-color, #1890ff);
}

.select-hint {
  font-size: 11px;
  color: #888;
  margin-right: 8px;
}

.nav-buttons {
  display: inline-flex;
  gap: 0;
}

.empty-state {
  padding: 40px 20px;
  text-align: center;
}

@keyframes highlight-pulse {
  0%, 100% { outline-color: var(--primary-color, #1890ff); }
  50% { outline-color: #52c41a; }
}

:root[data-theme="dark"] .message-viewer-panel {
  background: #252525;
  border-color: #333;
}

:root[data-theme="dark"] .message-item.user {
  background: #2a3f4f;
}

:root[data-theme="dark"] .message-item.assistant {
  background: #333;
}

:root[data-theme="dark"] .message-content :deep(.external-link) {
  color: #69b1ff;
}

:root[data-theme="dark"] .message-content :deep(.external-link:hover) {
  color: #91caff;
}
</style>
