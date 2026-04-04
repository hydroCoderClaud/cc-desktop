<template>
  <div v-if="props.showLeftPanel" class="left-panel" :style="{ width: props.leftWidth + 'px' }">
    <div class="panel-header">
      <span class="panel-title">{{ t('notebook.source.title') }}</span>
      <div class="header-actions">
        <button v-if="expandedSource" class="header-btn" :title="t('common.back')" @click="closeDetail">
          <Icon name="chevronLeft" :size="18" :strokeWidth="1.8" />
        </button>
        <button v-else class="header-btn" :title="t('common.collapse')" @click="$emit('update:showLeftPanel', false)">
          <Icon name="panelLeft" :size="18" :strokeWidth="1.8" />
        </button>
      </div>
    </div>

    <div class="panel-content">
      <!-- 列表视图 -->
      <template v-if="!expandedSource">
        <div class="add-source-row">
          <button class="add-source-btn" @click="$emit('add-source')">
            <Icon name="plus" :size="16" />
            <span>{{ t('notebook.source.add') }}</span>
          </button>
          <button
            class="copy-toggle-btn"
            :class="{ active: copySourceFiles }"
            :title="copySourceFiles ? t('notebook.source.copyModeOn') : t('notebook.source.copyModeOff')"
            @click="$emit('toggle-copy-source-files')"
          >
            <Icon name="copy" :size="14" />
          </button>
        </div>

        <div class="select-all">
          <div class="select-all-left">
            <span class="select-all-label">{{ t('notebook.source.selectAll') }}</span>
          </div>
          <div class="select-all-right">
            <!-- 批量删除按钮 -->
            <button 
              v-if="selectedIds.length > 0"
              class="row-delete-btn" 
              @click="$emit('delete-sources', selectedIds)"
              :title="t('common.delete')"
            >
              <Icon name="delete" :size="16" />
              <span class="btn-badge">{{ selectedIds.length }}</span>
            </button>
            <!-- 反选按钮：放在删除图标后面 -->
            <button class="invert-select-btn" @click="$emit('invert-selection')" :title="t('notebook.source.invertSelection')">
              <Icon name="invert" :size="14" />
            </button>
            <label class="checkbox-label">
              <input type="checkbox" :checked="allSelected" @change="$emit('toggle-select-all')" />
              <span class="checkmark"></span>
            </label>
          </div>
        </div>

        <div class="source-list">
          <div
            v-for="source in sources"
            :key="source.id"
            class="source-item"
            :title="getSourceAbsPath(source)"
            @click="openDetail(source)"
          >
            <div class="source-left">
              <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
              <span class="source-name">{{ source.name }}</span>
            </div>
            <div class="source-right">
              <n-dropdown :options="getSourceMenuOptions(source)" trigger="click" @select="(key) => handleSourceMenuSelect(key, source)">
                <button class="action-icon-btn" @click.stop>
                  <Icon name="moreHorizontal" :size="16" />
                </button>
              </n-dropdown>
              <label class="checkbox-label" @click.stop>
                <input
                  type="checkbox"
                  :checked="source.selected"
                  @change="$emit('update-source', source.id, { selected: $event.target.checked })"
                />
                <span class="checkmark"></span>
              </label>
            </div>
          </div>
        </div>
      </template>

      <!-- 详情视图 -->
      <template v-else>
        <NotebookFilePreview
          :item="expandedSource"
          :notebook-id="props.notebookId"
          type="source"
          @back="closeDetail"
          @open-external="$emit('open-external', $event)"
        />
      </template>
    </div>
  </div>

  <!-- 折叠条 -->
  <div v-else class="panel-collapsed-strip">
    <div class="strip-header">
      <button class="header-btn" @click="$emit('update:showLeftPanel', true)" :title="t('notebook.source.expand')">
        <Icon name="panelLeft" :size="18" :strokeWidth="1.8" />
      </button>
    </div>
    <div class="strip-body">
      <div class="strip-content">
        <div v-for="source in sources" :key="source.id" class="strip-icon-item" :title="source.name">
          <div @click="openDetail(source)" class="strip-icon-wrapper">
            <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { NDropdown } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { getSourceIcon, getSourceColor, isAbsolutePath, joinNotebookPath } from '../utils/helpers.js'
import NotebookFilePreview from './NotebookFilePreview.vue'

const props = defineProps({
  sources: { type: Array, default: () => [] },
  allSelected: Boolean,
  copySourceFiles: { type: Boolean, default: false },
  notebookPath: { type: String, default: '' },
  notebookId: { type: String, default: null },
  leftWidth: { type: Number, required: true },
  showLeftPanel: { type: Boolean, default: true },
  expandPanel: { type: Function, required: true },
  collapsePanel: { type: Function, required: true }
})

const emit = defineEmits([
  'add-source',
  'toggle-select-all',
  'invert-selection',
  'open-external',
  'delete-sources',
  'update-source',
  'toggle-copy-source-files',
  'rename-source',
  'export-source',
  'add-to-achievement',
  'insert-path-to-input',
  'open-folder',
  'delete-source',
  'update:showLeftPanel'
])

const { t } = useLocale()
const expandedSource = ref(null)

const selectedIds = computed(() => props.sources.filter(s => s.selected).map(s => s.id))

const getSourceMenuOptions = (source) => ([
  { label: t('common.rename'), key: 'rename' },
  { label: t('notebook.source.insertPath'), key: 'insert-path', disabled: !source.path },
  { label: t('notebook.source.addToAchievement'), key: 'add-to-achievement', disabled: !source.path },
  { label: t('project.openFolder'), key: 'open-folder', disabled: !source.path },
  { label: t('notebook.source.export'), key: 'export', disabled: !source.path },
  { label: t('common.delete'), key: 'delete' }
])

const handleSourceMenuSelect = (key, source) => {
  if (key === 'rename') emit('rename-source', source)
  if (key === 'insert-path') emit('insert-path-to-input', source)
  if (key === 'add-to-achievement') emit('add-to-achievement', source)
  if (key === 'open-folder') emit('open-folder', source)
  if (key === 'export') emit('export-source', source)
  if (key === 'delete') emit('delete-source', source)
}

const openDetail = (source) => {
  expandedSource.value = source
  emit('update:showLeftPanel', true)
  props.expandPanel('left')
}

const closeDetail = () => {
  expandedSource.value = null
  props.collapsePanel('left')
}

// 计算来源的绝对路径用于 tooltip
const getSourceAbsPath = (source) => {
  if (!source.path) return source.url || ''
  if (isAbsolutePath(source.path)) return source.path
  if (props.notebookPath) return joinNotebookPath(props.notebookPath, source.path)
  return source.path
}
</script>

<style scoped>
@import '../notebook-shared.css';

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

.header-actions { display: flex; align-items: center; gap: 8px; }

.header-btn.danger:hover { background: rgba(255, 77, 79, 0.1); color: #ff4d4f; }

.btn-badge {
  background: var(--primary-color);
  color: #fff;
  font-size: 10px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: -4px;
  margin-top: -10px;
  padding: 0 4px;
  font-weight: bold;
}

.left-panel {
  flex-shrink: 0;
  background: var(--bg-color-secondary);
  border: none;
  border-radius: 16px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
}

.left-panel-collapsed {
  flex-shrink: 0;
  width: 32px;
  background: var(--bg-color-secondary);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 0 16px;
  gap: 10px;
  cursor: pointer;
  transition: background 0.15s;
}

.left-panel-collapsed:hover { background: var(--hover-bg); }

.add-source-btn {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 16px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 24px;
  color: var(--text-color-muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.15s;
}

.add-source-btn:hover { background: var(--hover-bg); }

.add-source-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.copy-toggle-btn {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.copy-toggle-btn:hover { background: var(--hover-bg); }

.copy-toggle-btn.active {
  background: var(--primary-color);
  border-color: var(--primary-color);
  color: #fff;
}

.search-section {
  background: var(--bg-color-tertiary);
  border: 1px solid var(--border-color);
  border-radius: 24px;
  padding: 12px 16px;
  margin-bottom: 16px;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.search-icon { color: var(--text-color-muted); flex-shrink: 0; }

.search-input {
  flex: 1;
  border: none;
  background: transparent;
  font-size: 14px;
  color: var(--text-color);
  outline: none;
}

.search-input::placeholder { color: var(--text-color-muted); }

.search-options { display: flex; gap: 8px; align-items: center; }

.option-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 16px;
  color: var(--text-color);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.option-btn:hover { background: var(--hover-bg); }

.search-submit {
  width: 32px;
  height: 32px;
  min-width: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--border-color);
  border: none;
  border-radius: 50%;
  color: var(--text-color-muted);
  cursor: pointer;
  transition: all 0.15s;
  margin-left: auto;
  flex-shrink: 0;
}

.search-submit:hover { background: var(--primary-color); color: #fff; }

.source-list { display: flex; flex-direction: column; gap: 4px; }

.source-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 2px 8px 4px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
  overflow: hidden;
}

.source-item:hover { background: var(--hover-bg); }

.source-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.source-right {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-icon-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-color-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.action-icon-btn:hover {
  background: var(--hover-bg);
  color: var(--primary-color);
}

.source-name {
  font-size: 13px;
  color: var(--text-color);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

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
  position: relative;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color-secondary);
}

.checkbox-label input:checked + .checkmark::after {
  content: '';
  position: absolute;
  width: 5px;
  height: 9px;
  border-right: 2px solid var(--text-color);
  border-bottom: 2px solid var(--text-color);
  transform: rotate(45deg) translate(-1px, -1px);
}

/* select-all row */
.select-all {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 4px 2px;
  margin-bottom: 8px;
  font-size: 12px;
  color: var(--text-color-muted);
}

.select-all-left {
  display: flex;
  align-items: center;
  gap: 8px;
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

.select-all-right {
  display: flex;
  align-items: center;
  gap: 12px;
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

.row-delete-btn .btn-badge {
  background: #ff4d4f;
  margin-top: -12px;
  margin-left: -6px;
}
</style>
