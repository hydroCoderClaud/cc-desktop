<template>
  <div v-if="showRightPanel" class="right-panel" :style="{ width: rightWidth + 'px' }">
    <div class="panel-header">
      <template v-if="expandedAchievement">
        <span class="panel-title">{{ t('notebook.studio.title') }}</span>
        <Icon name="chevronRight" :size="14" class="breadcrumb-icon" />
        <span class="panel-title">{{ getTypeName(expandedAchievement.type) }}</span>
        <button class="header-btn" style="margin-left:auto" :title="t('common.back')" @click="closeDetail">
          <Icon name="chevronRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
      <template v-else>
        <span class="panel-title">{{ t('notebook.studio.title') }}</span>
        <button class="header-btn" style="margin-left:auto" :title="t('common.collapse')" @click="showRightPanel = false">
          <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
        </button>
      </template>
    </div>

    <div class="panel-content">
      <!-- 列表视图 -->
      <template v-if="!expandedAchievement">
        <div class="type-grid">
          <div
            v-for="type in availableTypes"
            :key="type.id"
            class="type-card"
            :style="{ background: type.bgColor }"
            :title="type.tip"
            @click="$emit('generate', type.id)"
          >
            <div class="type-card-top">
              <div class="type-icon-content" :style="{ color: type.color }">
                <Icon :name="type.icon" :size="16" />
              </div>
              <span v-if="type.beta" class="beta-badge">{{ t('notebook.studio.betaBadge') }}</span>
            </div>
            <span class="type-name">{{ t('notebook.tools.' + type.id) || t('notebook.types.' + type.id) }}</span>
            <button class="type-edit-btn" @click.stop="$emit('edit-tool', type)">
              <Icon name="edit" :size="14" />
            </button>
          </div>
        </div>

        <div class="panel-divider"></div>

        <div class="achievements-section">
          <div class="section-header">
            <div class="section-title">{{ t('notebook.studio.generated') }}</div>
            <!-- 批量操作区 -->
            <div class="batch-actions" v-if="achievements.length > 0">
              <button 
                v-if="selectedIds.length > 0"
                class="batch-delete-btn" 
                @click="$emit('delete-achievements', selectedIds)"
                :title="t('common.delete')"
              >
                <Icon name="delete" :size="14" />
                <span class="badge">{{ selectedIds.length }}</span>
              </button>
              <button class="batch-icon-btn" @click="$emit('invert-selection')" :title="t('notebook.source.invertSelection')">
                <Icon name="refresh" :size="14" />
              </button>
              <label class="checkbox-label mini">
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
              @click="achievement.status !== 'generating' && openDetail(achievement)"
            >
              <div v-if="achievement.status === 'generating'" class="generating-spinner"></div>
              <Icon v-else :name="getAchievementIcon(achievement.type)" :size="20" :color="achievement.color" />
              
              <div class="achievement-info">
                <div class="achievement-name">{{ achievement.name }}</div>
                <div class="achievement-meta">
                  <span v-if="achievement.status === 'generating'" class="status-text generating-text">生成中...</span>
                  <template v-else>
                    <span>{{ t('notebook.studio.sources', { count: achievement.sourceCount || 0 }) }}</span>
                    <span class="dot">•</span>
                    <span>{{ achievement.time }}</span>
                  </template>
                </div>
              </div>
              <div class="achievement-right" v-if="achievement.status !== 'generating'">
                <div class="achievement-actions">
                  <button v-if="achievement.type === 'video' || achievement.type === 'audio'" class="action-icon-btn" @click.stop>
                    <Icon name="play" :size="16" />
                  </button>
                </div>
                <label class="checkbox-label mini" @click.stop>
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
          :item="expandedAchievement"
          type="achievement"
          @back="closeDetail"
          @export="$emit('export', $event)"
          @copy="$emit('copy', $event)"
          @delete="$emit('delete', $event)"
        />
      </template>
    </div>
  </div>

  <!-- 折叠条 -->
  <div v-else class="panel-collapsed-strip panel-collapsed-right">
    <div class="strip-header">
      <button class="header-btn" @click="showRightPanel = true" :title="t('notebook.studio.expand')">
        <Icon name="panelRight" :size="18" :strokeWidth="1.8" />
      </button>
    </div>
    <div class="strip-body">
      <div class="strip-content strip-content-top">
        <div
          v-for="type in availableTypes"
          :key="type.id"
          class="strip-icon-item type-icon-item"
          :style="{ background: type.bgColor }"
          :title="t('notebook.tools.' + type.id) || t('notebook.types.' + type.id)"
        >
          <div class="type-icon-small" :style="{ color: type.color }">
            <Icon :name="type.icon" :size="18" />
          </div>
          <span class="type-plus">+</span>
        </div>
      </div>
      <div class="strip-divider"></div>
      <div class="strip-content strip-content-bottom">
        <div v-for="achievement in achievements" :key="achievement.id" class="strip-icon-item" :title="achievement.name">
          <Icon :name="getAchievementIcon(achievement.type)" :size="20" :color="achievement.color" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useNotebookLayout } from '../composables/useNotebookLayout'
import NotebookFilePreview from './NotebookFilePreview.vue'

const props = defineProps({
  achievements: { type: Array, default: () => [] },
  availableTypes: { type: Array, default: () => [] }
})

defineEmits([
  'generate', 'export', 'copy', 'delete', 
  'toggle-select-all', 'invert-selection', 'update-achievement', 'delete-achievements',
  'edit-tool'
])

const { t } = useLocale()
const { rightWidth, showRightPanel, expandPanel, collapsePanel } = useNotebookLayout()

const expandedAchievement = ref(null)

const selectedIds = computed(() => props.achievements.filter(a => a.selected).map(a => a.id))
const allSelected = computed(() => props.achievements.length > 0 && props.achievements.every(a => a.selected))

const openDetail = (achievement) => {
  expandedAchievement.value = achievement
  expandPanel('right')
}

const closeDetail = () => {
  expandedAchievement.value = null
  collapsePanel('right')
}

const getTypeName = (typeId) => t('notebook.tools.' + typeId) || t('notebook.types.' + typeId)

const getAchievementIcon = (type) => {
  const map = { 
    image: 'image', 
    video: 'video', 
    markdown: 'fileText', 
    pdf: 'file', 
    document: 'fileText', 
    code: 'globe', 
    web: 'globe', 
    text: 'fileText', 
    csv: 'table',
    // 兼容老数据
    audio: 'audio', presentation: 'presentation', mindmap: 'mindmap', flashcard: 'heart', quiz: 'clipboard', infographic: 'image', table: 'table' 
  }
  return map[type] || 'fileText'
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
.type-name { font-size: 12px; font-weight: 500; color: var(--text-color); text-align: left; line-height: 1.3; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.beta-badge { font-size: 9px; background: var(--text-color); color: var(--bg-color-secondary); padding: 2px 5px; border-radius: 3px; font-weight: 600; white-space: nowrap; }

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
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 50%;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  color: var(--text-color-muted);
}
.type-card:hover .type-edit-btn { opacity: 1; }

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

.batch-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.batch-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  transition: all 0.2s;
}
.batch-icon-btn:hover { color: var(--primary-color); background: var(--hover-bg); }

.batch-delete-btn {
  display: flex;
  align-items: center;
  background: transparent;
  border: none;
  color: var(--text-color-muted);
  cursor: pointer;
  padding: 2px;
  border-radius: 4px;
  position: relative;
}
.batch-delete-btn:hover { color: #ff4d4f; background: rgba(255, 77, 79, 0.1); }
.batch-delete-btn .badge {
  background: #ff4d4f;
  color: #fff;
  font-size: 9px;
  min-width: 14px;
  height: 14px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: -6px;
  right: -6px;
  padding: 0 3px;
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
.achievement-item.selected { border-color: var(--primary-color-alpha, rgba(var(--primary-color-rgb), 0.2)); background: var(--hover-bg); }

.achievement-info { flex: 1; min-width: 0; }
.achievement-name { font-size: 13px; font-weight: 500; color: var(--text-color); margin-bottom: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.achievement-meta { font-size: 11px; color: var(--text-color-muted); display: flex; align-items: center; gap: 6px; }
.dot { font-size: 8px; }

.achievement-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.achievement-actions {
  display: flex;
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

/* Checkbox Styles (Mini version) */
.checkbox-label.mini { width: 16px; height: 16px; cursor: pointer; position: relative; }
.checkbox-label.mini input { display: none; }
.checkbox-label.mini .checkmark {
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 4px;
  background: var(--bg-color-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s;
}
.checkbox-label.mini input:checked + .checkmark { background: var(--primary-color); border-color: var(--primary-color); }
.checkbox-label.mini input:checked + .checkmark::after {
  content: '';
  width: 4px;
  height: 7px;
  border-right: 1.5px solid #fff;
  border-bottom: 1.5px solid #fff;
  transform: rotate(45deg) translate(-1px, -1px);
}

.panel-collapsed-right { border-left: none; border-right: none; }

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
