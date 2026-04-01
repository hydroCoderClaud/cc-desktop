<template>
  <div v-if="props.showRightPanel" class="right-panel" :style="{ width: props.rightWidth + 'px' }">
    <div class="panel-header">
      <template v-if="expandedAchievement">
        <span class="panel-title">{{ t('notebook.studio.title') }}</span>
        <Icon name="chevronRight" :size="14" class="breadcrumb-icon" />
        <span class="panel-title">{{ getAchievementHeaderName(currentExpandedAchievement) }}</span>
        <button class="header-btn" style="margin-left:auto" :title="t('common.back')" @click="closeDetail">
          <Icon name="chevronRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
      <template v-else>
        <span class="panel-title">{{ t('notebook.studio.title') }}</span>
        <n-popover trigger="click" placement="bottom-end">
          <template #trigger>
            <button class="header-btn filter-trigger-btn" :class="{ active: selectedTags.length > 0 }" :title="t('notebook.market.filterTags')">
              <Icon name="filter" :size="16" :strokeWidth="1.8" />
              <span class="filter-trigger-label">{{ filterTriggerLabel }}</span>
              <span v-if="selectedTags.length > 0" class="filter-badge">{{ selectedTags.length }}</span>
            </button>
          </template>
          <div class="tag-filter-panel">
            <div class="tag-filter-header">
              <span class="tag-filter-title">{{ t('notebook.market.filterTags') }}</span>
              <button v-if="selectedTags.length > 0" class="clear-filters-btn" @click="clearTagFilters">
                {{ t('notebook.market.clearFilters') }}
              </button>
            </div>
            <div v-if="availableTags.length" class="tag-filter-list">
              <button
                v-for="tag in availableTags"
                :key="tag"
                class="tag-chip"
                :class="{ active: selectedTags.includes(tag) }"
                @click="toggleTag(tag)"
              >
                {{ tag }}
              </button>
            </div>
            <div v-else class="tag-filter-empty">{{ t('notebook.market.tagsEmpty') }}</div>
          </div>
        </n-popover>
        <button class="header-btn market-btn" @click="$emit('open-market')" :title="t('notebook.market.title')">
          <Icon name="store" :size="16" :strokeWidth="1.8" />
          <span v-if="hasNewTools" class="market-dot"></span>
        </button>
        <button class="header-btn" style="margin-left:auto" :title="t('common.collapse')" @click="$emit('update:showRightPanel', false)">
          <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
    </div>

    <div class="panel-content">
      <!-- 列表视图 -->
      <template v-if="!expandedAchievement">
        <div class="type-grid">
          <div
            v-for="type in filteredTypes"
            :key="type.id"
            class="type-card"
            :class="{ 'not-installed': type.installed === false }"
            :style="{ background: type.bgColor }"
            :title="type.tip || type.description"
            @click="type.installed !== false ? $emit('generate', type.id) : $emit('download-tool', type)"
          >
            <div class="type-card-top">
              <div class="type-icon-content" :style="{ color: type.color }">
                <Icon :name="type.icon" :size="16" />
              </div>
              <div v-if="type.installed === false" class="download-badge" :title="t('market.install')">
                <Icon name="download" :size="10" />
              </div>
              <span v-else-if="type.beta" class="beta-badge">{{ t('notebook.studio.betaBadge') }}</span>
            </div>
            <span class="type-name" :style="{ color: type.color }">{{ type.name || t('notebook.tools.' + type.id) || t('notebook.types.' + type.id) }}</span>
            <button
              v-if="type.installed !== false"
              class="type-edit-btn"
              :style="{
                color: type.color,
                background: `${type.color}22`,
                borderColor: `${type.color}55`
              }"
              @click.stop="$emit('edit-tool', type)"
            >
              <Icon name="edit" :size="14" />
            </button>
          </div>
        </div>

        <div class="panel-divider"></div>

        <div class="achievements-section">
          <div class="section-header">
            <div class="section-title">{{ t('notebook.studio.generated') }}</div>
            <div class="select-all-right" v-if="achievements.length > 0">
              <button
                v-if="selectedIds.length > 0"
                class="row-delete-btn"
                @click="$emit('delete-achievements', selectedIds)"
                :title="t('common.delete')"
              >
                <Icon name="delete" :size="16" />
                <span class="btn-badge">{{ selectedIds.length }}</span>
              </button>
              <button class="invert-select-btn" @click="$emit('invert-selection')" :title="t('notebook.source.invertSelection')">
                <Icon name="invert" :size="14" />
              </button>
              <label class="checkbox-label" @click.stop>
                <input type="checkbox" :checked="allSelected" @change="$emit('toggle-select-all')" />
                <span class="checkmark"></span>
              </label>
            </div>
          </div>

          <div v-if="achievements.length === 0" class="empty-achievements">
            <p>{{ t('notebook.studio.empty') }}</p>
            <p class="hint">{{ t('notebook.studio.emptyHint') }}</p>
          </div>
          <div v-else class="achievements-list">
            <div
              v-for="achievement in achievements"
              :key="achievement.id"
              class="achievement-item"
              :class="{ selected: achievement.selected, generating: achievement.status === 'generating' }"
              :title="achievement.path || ''"
              @click="achievement.status !== 'generating' && openDetail(achievement)"
            >
              <div v-if="achievement.status === 'generating'" class="generating-spinner"></div>
              <Icon v-else :name="getAchievementIcon(achievement.type)" :size="20" :color="achievement.color" />

              <div class="achievement-info">
                <div class="achievement-name">{{ achievement.name }}</div>
                <div class="achievement-meta">
                  <span v-if="achievement.status === 'generating'" class="status-text generating-text">{{ t('notebook.studio.generating') }}</span>
                  <template v-else>
                    <span>{{ t('notebook.studio.sources', { count: achievement.sourceCount || 0 }) }}</span>
                    <span class="dot">•</span>
                    <span>{{ achievement.time }}</span>
                  </template>
                </div>
              </div>
              <div class="achievement-right" v-if="achievement.status !== 'generating'">
                <div class="achievement-actions">
                  <button v-if="['video', 'audio', 'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac'].includes((achievement.type || '').toLowerCase())" class="action-icon-btn" @click.stop>
                    <Icon name="play" :size="16" />
                  </button>
                  <n-dropdown :options="getAchievementMenuOptions(achievement)" trigger="click" @select="(key) => handleAchievementMenuSelect(key, achievement)">
                    <button class="action-icon-btn" @click.stop>
                      <Icon name="moreHorizontal" :size="16" />
                    </button>
                  </n-dropdown>
                </div>
                <label class="checkbox-label" @click.stop>
                  <input
                    type="checkbox"
                    :checked="achievement.selected"
                    @change="$emit('update-achievement', achievement.id, { selected: $event.target.checked })"
                  />
                  <span class="checkmark"></span>
                </label>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 详情视图 -->
      <template v-else>
        <NotebookFilePreview
          :item="currentExpandedAchievement"
          :notebook-id="props.notebookId"
          type="achievement"
          @back="closeDetail"
          @open-external="$emit('open-external', $event)"
          @export="$emit('export', $event)"
        />
      </template>
    </div>
  </div>

  <!-- 折叠条 -->
  <div v-else class="panel-collapsed-strip panel-collapsed-right">
    <div class="strip-header">
      <button class="header-btn" @click="$emit('update:showRightPanel', true)" :title="t('notebook.studio.expand')">
        <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
      </button>
    </div>
    <div class="strip-body">
      <div class="strip-content strip-content-top">
        <div
          v-for="type in filteredTypes"
          :key="type.id"
          class="strip-icon-item type-icon-item"
          :style="{ background: type.bgColor }"
          :title="type.tip || type.description || type.name || getTypeName(type.id)"
        >
          <div class="strip-icon-wrapper" @click="handleCollapsedTypeClick(type)">
            <div class="type-icon-small" :style="{ color: type.color }">
              <Icon :name="type.icon" :size="18" />
            </div>
            <span class="type-plus">+</span>
          </div>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="strip-content strip-content-bottom">
        <div v-for="achievement in achievements" :key="achievement.id" class="strip-icon-item" :title="achievement.name">
          <div
            class="strip-icon-wrapper"
            :class="{ disabled: achievement.status === 'generating' }"
            @click="achievement.status !== 'generating' && openDetail(achievement)"
          >
            <Icon :name="getAchievementIcon(achievement.type)" :size="20" :color="achievement.color" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NDropdown, NPopover } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { getAchievementIcon } from '../utils/helpers.js'
import NotebookFilePreview from './NotebookFilePreview.vue'

const props = defineProps({
  achievements: { type: Array, default: () => [] },
  availableTypes: { type: Array, default: () => [] },
  filteredAvailableTypes: { type: Array, default: () => [] },
  availableTags: { type: Array, default: () => [] },
  selectedTags: { type: Array, default: () => [] },
  hasNewTools: { type: Boolean, default: false },
  notebookId: { type: String, default: null },
  rightWidth: { type: Number, required: true },
  showRightPanel: { type: Boolean, default: true },
  expandPanel: { type: Function, required: true },
  collapsePanel: { type: Function, required: true }
})

const { t } = useLocale()
const expandedAchievement = ref(null)

const currentExpandedAchievement = computed(() => {
  if (!expandedAchievement.value) return null
  return props.achievements.find(a => a.id === expandedAchievement.value.id) || expandedAchievement.value
})

const availableTags = computed(() => props.availableTags)
const selectedTags = computed(() => props.selectedTags)
const filteredTypes = computed(() => props.filteredAvailableTypes)

const getToolNameById = (toolId) => {
  if (!toolId) return ''
  const tool = props.availableTypes.find(t => t.id === toolId)
  return tool?.name || ''
}

const filterTriggerLabel = computed(() => {
  if (selectedTags.value.length === 0) return t('notebook.market.allTags')
  return t('notebook.market.filterTags')
})

const selectedIds = computed(() => props.achievements.filter(a => a.selected).map(a => a.id))
const allSelected = computed(() => props.achievements.length > 0 && props.achievements.every(a => a.selected))
const emit = defineEmits([
  'generate', 'export', 'delete', 'download-tool', 'open-market', 'open-external',
  'toggle-select-all', 'invert-selection', 'update-achievement', 'delete-achievements',
  'edit-tool', 'add-to-source', 'rename', 'toggle-tag', 'clear-tag-filters',
  'update:showRightPanel'
])


const getAchievementMenuOptions = () => ([
  { label: t('common.rename'), key: 'rename' },
  { label: t('notebook.studio.addToSource'), key: 'add-to-source' },
  { label: t('project.openFolder'), key: 'open-folder' },
  { label: t('notebook.studio.export'), key: 'export' },
  { label: t('notebook.studio.delete'), key: 'delete' }
])

const toggleTag = (tag) => {
  emit('toggle-tag', tag)
}

const clearTagFilters = () => {
  emit('clear-tag-filters')
}

const handleAchievementMenuSelect = (key, achievement) => {
  if (key === 'rename') emit('rename', achievement)
  if (key === 'add-to-source') emit('add-to-source', achievement)
  if (key === 'open-folder') emit('open-external', { ...achievement, openFolderOnly: true })
  if (key === 'export') emit('export', achievement)
  if (key === 'delete') emit('delete', achievement)
}

const handleCollapsedTypeClick = (type) => {
  emit('update:showRightPanel', true)
  props.expandPanel('right')
  emit('generate', type.id)
}

const openDetail = (achievement) => {
  expandedAchievement.value = achievement
  emit('update:showRightPanel', true)
  props.expandPanel('right')
}

const closeDetail = () => {
  expandedAchievement.value = null
  props.collapsePanel('right')
}

const translateIfExists = (key) => {
  const value = t(key)
  return value === key ? '' : value
}

const getTypeName = (typeId) => {
  if (!typeId) return ''
  return translateIfExists('notebook.tools.' + typeId) || translateIfExists('notebook.types.' + typeId) || typeId
}

const getAchievementHeaderName = (achievement) => {
  if (!achievement) return ''
  return achievement.toolName || getToolNameById(achievement.toolId) || getTypeName(achievement.toolId) || getTypeName(achievement.type) || achievement.name || ''
}
</script>

<style>
@import '../notebook-shared.css';
</style>

<style scoped>
.right-panel {
  flex-shrink: 0;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.filter-trigger-btn {
  position: relative;
  width: auto;
  min-width: 32px;
  padding: 0 10px;
  gap: 6px;
  border-radius: 999px;
}

.filter-trigger-label {
  font-size: 12px;
  line-height: 1;
}

.filter-trigger-btn.active {
  color: var(--primary-color);
  background: var(--primary-ghost, rgba(74, 144, 217, 0.08));
}

.filter-badge {
  position: absolute;
  top: -3px;
  right: -3px;
  min-width: 14px;
  height: 14px;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}

.tag-filter-panel {
  width: 280px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.tag-filter-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.tag-filter-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.clear-filters-btn {
  border: none;
  background: transparent;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}

.strip-icon-wrapper {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-radius: 8px;
  transition: background 0.15s;
  padding: 4px;
}

.strip-icon-wrapper:hover {
  background: var(--hover-bg);
}

.strip-icon-wrapper.disabled {
  cursor: default;
  opacity: 0.5;
}

.strip-icon-wrapper.disabled:hover {
  background: transparent;
}

.tag-filter-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.tag-chip {
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  color: var(--text-color-muted);
  border-radius: 999px;
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.tag-chip:hover {
  background: var(--hover-bg);
  color: var(--text-color);
}

.tag-chip.active {
  border-color: var(--primary-color);
  background: var(--primary-ghost, rgba(74, 144, 217, 0.08));
  color: var(--primary-color);
}

.tag-filter-empty {
  font-size: 12px;
  color: var(--text-color-muted);
}

.type-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
  gap: 6px;
  margin-bottom: 20px;
}

.type-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 10px 10px 8px;
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s;
  overflow: hidden;
  min-width: 0;
}

.type-card:hover { transform: translateY(-1px); box-shadow: 0 3px 10px var(--shadow-color); }
.type-card-top { display: flex; align-items: center; gap: 6px; }
.type-icon-content { width: 20px; height: 20px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.type-name { font-size: 12px; font-weight: 500; text-align: left; line-height: 1.3; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.beta-badge { font-size: 9px; background: rgba(255, 255, 255, 0.92); color: #1f2937; padding: 2px 5px; border-radius: 3px; font-weight: 600; white-space: nowrap; }

.type-edit-btn {
  position: absolute;
  top: 50%;
  right: 8px;
  transform: translateY(-50%);
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid transparent;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: rgba(255, 255, 255, 0.96);
}
.type-card:hover .type-edit-btn { opacity: 1; }

/* Not Installed State */
.type-card.not-installed {
  opacity: 0.65;
  filter: grayscale(0.2);
}
.type-card.not-installed:hover {
  opacity: 0.9;
  filter: none;
}

.download-badge {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 16px;
  height: 16px;
  background: var(--primary-color);
  color: #fff;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  animation: pulse-download 2s infinite;
}

@keyframes pulse-download {
  0% { transform: scale(1); }
  50% { transform: scale(1.15); }
  100% { transform: scale(1); }
}

.panel-divider { height: 1px; background: var(--border-color); margin: 0 0 20px; }

.achievements-section { margin-bottom: 20px; }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-color-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.select-all-right {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-right: 2px;
}

.invert-select-btn {
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}

.invert-select-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.row-delete-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: all 0.2s;
  position: relative;
}

.row-delete-btn:hover {
  background: rgba(255, 77, 79, 0.1);
  color: #ff4d4f;
}

.btn-badge {
  background: #ff4d4f;
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -6px;
  margin-top: -12px;
  padding: 0 4px;
  font-weight: bold;
}

.empty-achievements { padding: 30px 20px; text-align: center; color: var(--text-color-muted); }
.empty-achievements p { margin: 0 0 4px; font-size: 13px; }
.empty-achievements .hint { font-size: 12px; }

.achievements-list { display: flex; flex-direction: column; gap: 8px; }

.achievement-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px;
  background: var(--bg-color-tertiary);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s;
  border: 1.5px solid transparent;
}
.achievement-item:hover { background: var(--hover-bg); }
.achievement-item.selected {
  background: var(--hover-bg);
}

.achievement-info { flex: 1; min-width: 0; }
.achievement-name { font-size: 13px; font-weight: 500; color: var(--text-color); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.achievement-meta { font-size: 11px; color: var(--text-color-muted); display: flex; align-items: center; gap: 6px; }
.dot { font-size: 8px; }

.achievement-right {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.achievement-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

.action-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--hover-bg);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  color: var(--text-color-muted);
  transition: background 0.15s;
}
.action-icon-btn:hover { background: var(--border-color); color: var(--text-color); }

.checkbox-label {
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  width: 20px;
  height: 20px;
  flex-shrink: 0;
}

.checkbox-label input { display: none; }

.checkbox-label .checkmark {
  width: 18px;
  height: 18px;
  border: 1.5px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
  position: relative;
}

.checkbox-label input:checked + .checkmark {
  background: var(--primary-color);
  border-color: var(--primary-color);
}

.checkbox-label input:checked + .checkmark::after {
  content: '';
  width: 5px;
  height: 9px;
  border-right: 2px solid #fff;
  border-bottom: 2px solid #fff;
  transform: rotate(45deg) translate(-1px, -1px);
}

.panel-collapsed-right { border-left: none; border-right: none; }

.market-btn { position: relative; }
.market-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  background: #ff4d4f;
  border-radius: 50%;
  border: 1.5px solid var(--bg-color-secondary);
}

/* Generating State Styles */
.achievement-item.generating {
  opacity: 0.8;
  cursor: wait;
}
.achievement-item.generating:hover {
  background: var(--bg-color-tertiary); /* 禁用 hover 效果 */
}

.generating-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--border-color);
  border-top: 2px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  flex-shrink: 0;
}

.status-text.generating-text {
  color: var(--primary-color);
  font-weight: 500;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes pulse {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
</style>
