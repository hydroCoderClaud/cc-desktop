<template>
  <div class="message-viewer-panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <span>{{ t('sessionManager.conversation') }}</span>
        <!-- Tag filter dropdown (CSS hover) -->
        <div v-if="messageFilterTagList.length > 0" class="tag-filter-wrapper">
          <span class="filter-icon" :class="{ active: activeTagFilter }">🏷️</span>
          <div class="tag-filter-dropdown">
            <div
              class="tag-filter-all"
              :class="{ active: !activeTagFilter }"
              @click="$emit('filter', 'all')"
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
                @click="$emit('filter', tag.id)"
              >
                {{ tag.name }} ({{ count }})
              </n-tag>
            </div>
          </div>
        </div>
      </div>
      <n-space v-if="selectedSession" align="center">
        <span class="select-hint">{{ t('sessionManager.selectHint') }}，Ctrl+C {{ t('sessionManager.copyShortcut') }}</span>
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
                <n-dropdown :options="messageTagOptions" @select="(tagId) => handleAddMessageTag(msg.id, tagId)">
                  <span class="tag-action" @click.stop>🏷️</span>
                </n-dropdown>
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
import { ref, computed, nextTick } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()
const scrollbarRef = ref(null)

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
  'copy',
  'export'
])

// Message tag dropdown options
const messageTagOptions = computed(() => {
  const options = props.allTags.map(tag => ({
    label: tag.name,
    key: tag.id,
    props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

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

const handleAddMessageTag = (messageId, tagId) => {
  if (tagId === 'manage') {
    emit('manage-tags')
  } else {
    emit('add-message-tag', messageId, tagId)
  }
}

const handleCopy = (key) => {
  emit('copy', key)
}

const handleExport = (key) => {
  emit('export', key)
}

const scrollToElement = (selector, delay = 0) => {
  setTimeout(() => {
    const el = document.querySelector(selector)
    if (el) {
      const scrollContainer = el.closest('.n-scrollbar-container')
      if (scrollContainer) {
        const containerRect = scrollContainer.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const scrollTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - (containerRect.height / 2) + (elRect.height / 2)
        scrollContainer.scrollTo({ top: scrollTop, behavior: 'smooth' })
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }
  }, delay)
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

const formatTime = (timestamp) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
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

.tag-filter-wrapper {
  position: relative;
  display: inline-block;
}

.filter-icon {
  cursor: pointer;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.filter-icon:hover,
.filter-icon.active {
  opacity: 1;
}

.tag-filter-dropdown {
  display: none;
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 1000;
  min-width: 160px;
  max-width: 280px;
  padding: 8px;
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
  margin-top: 4px;
}

.tag-filter-wrapper:hover .tag-filter-dropdown {
  display: block;
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

.tag-filter-popover {
  min-width: 160px;
  max-width: 280px;
}

.tag-filter-all {
  padding: 6px 8px;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 8px;
  font-size: 13px;
}

.tag-filter-all:hover {
  background: var(--hover-color, #f5f5f5);
}

.tag-filter-all.active {
  background: var(--primary-color-light, #e6f4ff);
  color: var(--primary-color, #1890ff);
}

.tag-filter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tag-filter-item {
  cursor: pointer;
  transition: all 0.15s;
}

.tag-filter-item:hover {
  transform: scale(1.05);
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

:root[data-theme="dark"] .tag-filter-dropdown {
  background: #333;
  box-shadow: 0 3px 12px rgba(0, 0, 0, 0.4);
}

:root[data-theme="dark"] .tag-filter-all:hover {
  background: #444;
}

:root[data-theme="dark"] .tag-filter-all.active {
  background: #2a3f4f;
}
</style>
