<template>
  <div class="session-list-panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <span>{{ t('sessionManager.sessionList') }}</span>
        <n-tag v-if="selectedProject" size="small" type="info">
          {{ filteredSessions.length }}
        </n-tag>
        <!-- Session tag filter -->
        <n-popover
          v-if="sessionFilterTagList.length > 0"
          trigger="hover"
          placement="bottom-start"
        >
          <template #trigger>
            <span class="filter-icon" :class="{ active: sessionTagFilter }">🏷️</span>
          </template>
          <div class="tag-filter-popover">
            <div
              class="tag-filter-all"
              :class="{ active: !sessionTagFilter }"
              @click="$emit('filter', 'all')"
            >
              {{ t('sessionManager.showAll') }}
            </div>
            <div class="tag-filter-list">
              <n-tag
                v-for="{ tag, count } in sessionFilterTagList"
                :key="tag.id"
                size="small"
                :color="{ color: sessionTagFilter?.id === tag.id ? tag.color : 'transparent', textColor: sessionTagFilter?.id === tag.id ? '#fff' : 'inherit', borderColor: tag.color }"
                class="tag-filter-item"
                @click="$emit('filter', tag.id)"
              >
                {{ tag.name }} ({{ count }})
              </n-tag>
            </div>
          </div>
        </n-popover>
      </div>
      <n-space v-if="selectedSession" :size="4">
        <n-dropdown :options="addTagOptions" @select="handleAddTag">
          <n-button size="tiny" quaternary :title="t('sessionManager.addTag')">+🏷️</n-button>
        </n-dropdown>
      </n-space>
    </div>
    <n-scrollbar style="max-height: calc(100vh - 220px)">
      <n-spin :show="loadingSessions">
        <div v-if="!selectedProject" class="empty-state">
          <n-empty :description="t('sessionManager.selectProject')" />
        </div>
        <div v-else-if="filteredSessions.length === 0 && !loadingSessions" class="empty-state">
          <n-empty :description="sessionTagFilter ? t('sessionManager.noTaggedSessions') : t('sessionManager.noSessions')" />
        </div>
        <div
          v-for="session in filteredSessions"
          :key="session.id"
          :data-session-id="session.id"
          class="session-item"
          :class="{ active: selectedSession?.id === session.id }"
          @click="$emit('select', session)"
        >
          <div class="session-header-row">
            <div class="session-time">{{ formatDate(session.last_message_at) }}</div>
            <div class="session-actions">
              <span
                class="action-icon"
                :class="{ active: session.is_favorite }"
                @click.stop="$emit('toggle-favorite', session)"
                :title="session.is_favorite ? t('sessionManager.unfavorite') : t('sessionManager.favorite')"
              >
                {{ session.is_favorite ? '⭐' : '☆' }}
              </span>
            </div>
          </div>
          <div class="session-summary">
            {{ session.firstUserMessage || session.summary || t('sessionManager.newConversation') }}
          </div>
          <div class="session-meta">
            <span>{{ session.message_count || 0 }} {{ t('sessionManager.messages') }}</span>
            <span v-if="session.model" class="model-tag">{{ session.model }}</span>
          </div>
          <div v-if="session.tags && session.tags.length > 0" class="session-tags">
            <n-tag
              v-for="tag in session.tags"
              :key="tag.id"
              size="tiny"
              :color="{ color: tag.color, textColor: '#fff' }"
              closable
              @close="$emit('remove-tag', session.id, tag.id)"
              @click.stop
            >
              {{ tag.name }}
            </n-tag>
          </div>
        </div>
      </n-spin>
    </n-scrollbar>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  selectedProject: Object,
  selectedSession: Object,
  filteredSessions: {
    type: Array,
    required: true
  },
  sessionFilterTagList: {
    type: Array,
    default: () => []
  },
  sessionTagFilter: Object,
  allTags: {
    type: Array,
    default: () => []
  },
  loadingSessions: Boolean
})

const emit = defineEmits(['select', 'filter', 'add-tag', 'remove-tag', 'toggle-favorite', 'manage-tags'])

// Add tag dropdown options
const addTagOptions = computed(() => {
  const options = props.allTags.map(tag => ({
    label: tag.name,
    key: tag.id,
    props: { style: `border-left: 3px solid ${tag.color}; padding-left: 8px;` }
  }))
  options.push({ type: 'divider', key: 'd1' })
  options.push({ label: '⚙️ ' + t('sessionManager.manageTags'), key: 'manage' })
  return options
})

const handleAddTag = (key) => {
  if (key === 'manage') {
    emit('manage-tags')
  } else {
    emit('add-tag', props.selectedSession.id, key)
  }
}

const formatDate = (timestamp) => {
  if (!timestamp) return ''
  const d = new Date(timestamp)
  return d.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}
</script>

<style scoped>
.session-list-panel {
  width: 320px;
  flex-shrink: 0;
  background: var(--bg-color-secondary, #fff);
  border-radius: 8px;
  padding: 12px;
  border: 1px solid var(--border-color, #e0e0e0);
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

.session-item {
  padding: 12px;
  border-radius: 6px;
  cursor: pointer;
  margin-bottom: 6px;
  border: 1px solid var(--border-color, #e0e0e0);
  transition: all 0.15s;
}

.session-item:hover {
  border-color: var(--primary-color, #1890ff);
}

.session-item.active {
  border-color: var(--primary-color, #1890ff);
  background: var(--primary-color-light, #e6f4ff);
}

.session-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}

.session-time {
  font-size: 11px;
  color: #888;
}

.session-actions {
  display: flex;
  gap: 4px;
}

.action-icon {
  cursor: pointer;
  font-size: 14px;
  opacity: 0.5;
  transition: opacity 0.15s;
}

.action-icon:hover,
.action-icon.active {
  opacity: 1;
}

.session-summary {
  font-size: 13px;
  margin-bottom: 6px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.session-meta {
  font-size: 11px;
  color: #888;
  display: flex;
  gap: 8px;
  align-items: center;
}

.model-tag {
  background: var(--tag-bg, #f0f0f0);
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
}

.session-tags {
  margin-top: 6px;
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
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

:root[data-theme="dark"] .session-list-panel {
  background: #252525;
  border-color: #333;
}

:root[data-theme="dark"] .session-item:hover {
  background: #333;
}

:root[data-theme="dark"] .session-item.active {
  background: #2a3f4f;
}

:root[data-theme="dark"] .model-tag {
  background: #444;
}

:root[data-theme="dark"] .tag-filter-all:hover {
  background: #333;
}

:root[data-theme="dark"] .tag-filter-all.active {
  background: #2a3f4f;
}
</style>
