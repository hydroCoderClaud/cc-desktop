<template>
  <div class="session-list-panel">
    <div class="panel-header">
      <div class="panel-header-left">
        <span>{{ t('sessionManager.sessionList') }}</span>
        <n-tag v-if="selectedProject" size="small" type="info">
          {{ filteredSessions.length }}
        </n-tag>
        <!-- Favorite filter -->
        <span
          class="filter-icon"
          :class="{ active: showFavoritesOnly }"
          :title="showFavoritesOnly ? t('sessionManager.showAll') : t('sessionManager.showFavorites')"
          @click="$emit('toggle-favorites-filter')"
        ><Icon :name="showFavoritesOnly ? 'starFilled' : 'star'" :size="14" /></span>
        <!-- Session tag filter (click) -->
        <div v-if="sessionFilterTagList.length > 0" class="tag-filter-wrapper" v-click-outside="() => showTagFilter = false">
          <span class="filter-icon" :class="{ active: sessionTagFilter }" @click="showTagFilter = !showTagFilter"><Icon name="tag" :size="14" /></span>
          <div v-show="showTagFilter" class="tag-filter-dropdown">
            <div
              class="tag-filter-all"
              :class="{ active: !sessionTagFilter }"
              @click="handleFilterSelect('all')"
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
                @click="handleFilterSelect(tag.id)"
              >
                {{ tag.name }} ({{ count }})
              </n-tag>
            </div>
          </div>
        </div>
      </div>
      <!-- Add tag to session -->
      <div v-if="selectedSession" class="tag-filter-wrapper" v-click-outside="() => showAddTag = false">
        <span class="filter-icon" @click="showAddTag = !showAddTag" :title="t('sessionManager.addTag')"><Icon name="tag" :size="14" /><span class="add-tag-plus">+</span></span>
        <div v-show="showAddTag" class="tag-filter-dropdown" style="right: 0; left: auto;">
          <div class="tag-filter-list">
            <n-tag
              v-for="tag in allTags"
              :key="tag.id"
              size="small"
              :color="{ color: 'transparent', textColor: 'inherit', borderColor: tag.color }"
              class="tag-filter-item"
              @click="handleAddTagSelect(tag.id)"
            >
              {{ tag.name }}
            </n-tag>
          </div>
          <div class="tag-filter-divider"></div>
          <div class="quick-add-row">
            <input
              v-model="quickTagName"
              class="quick-add-input"
              :placeholder="t('sessionManager.quickAddTag')"
              @keyup.enter="handleQuickAddTag"
            />
            <span class="quick-add-btn" @click="handleQuickAddTag">+</span>
          </div>
          <div class="tag-filter-action" @click="handleAddTagSelect('manage')">
            <Icon name="settings" :size="14" /> {{ t('sessionManager.manageTags') }}
          </div>
        </div>
      </div>
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
                <Icon :name="session.is_favorite ? 'starFilled' : 'star'" :size="14" />
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
import { ref } from 'vue'
import { useLocale } from '@composables/useLocale'
import { vClickOutside } from '@composables/useClickOutside'
import { formatDate } from '@composables/useFormatters'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const showTagFilter = ref(false)
const showAddTag = ref(false)
const quickTagName = ref('')

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
  loadingSessions: Boolean,
  showFavoritesOnly: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['select', 'filter', 'add-tag', 'remove-tag', 'toggle-favorite', 'manage-tags', 'quick-add-tag', 'toggle-favorites-filter'])

// Handle tag filter selection
const handleFilterSelect = (key) => {
  showTagFilter.value = false
  emit('filter', key)
}

// Handle add tag selection
const handleAddTagSelect = (key) => {
  showAddTag.value = false
  if (key === 'manage') {
    emit('manage-tags')
  } else {
    emit('add-tag', props.selectedSession.id, key)
  }
}

// Handle quick add tag
const handleQuickAddTag = () => {
  const name = quickTagName.value.trim()
  if (!name) return
  emit('quick-add-tag', { sessionId: props.selectedSession.id, name })
  quickTagName.value = ''
}
</script>

<style scoped>
@import '../styles/tag-dropdown.css';

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

.add-tag-plus {
  font-size: 10px;
  font-weight: bold;
  margin-left: -2px;
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
</style>
