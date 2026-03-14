<template>
  <div v-if="showLeftPanel" class="left-panel" :style="{ width: leftWidth + 'px' }">
    <div class="panel-header">
      <span class="panel-title">{{ t('industry.source.title') }}</span>
      <button v-if="expandedSource" class="header-btn" :title="t('common.back')" @click="closeDetail">
        <Icon name="chevronLeft" :size="18" :strokeWidth="1.8" />
      </button>
      <button v-else class="header-btn" :title="t('common.collapse')" @click="showLeftPanel = false">
        <Icon name="panelLeft" :size="18" :strokeWidth="1.8" />
      </button>
    </div>

    <div class="panel-content">
      <!-- 列表视图 -->
      <template v-if="!expandedSource">
        <button class="add-source-btn" @click="$emit('add-source')">
          <Icon name="plus" :size="16" />
          <span>{{ t('industry.source.add') }}</span>
        </button>

        <div class="search-section">
          <div class="search-box">
            <Icon name="search" :size="18" class="search-icon" />
            <input type="text" :placeholder="t('industry.source.searchPlaceholder')" class="search-input" />
          </div>
          <div class="search-options">
            <button class="option-btn">
              <Icon name="globe" :size="14" />
              <span>{{ t('industry.source.web') }}</span>
              <Icon name="chevronDown" :size="14" />
            </button>
            <button class="option-btn">
              <Icon name="lightning" :size="14" />
              <span>{{ t('industry.source.fastResearch') }}</span>
              <Icon name="chevronDown" :size="14" />
            </button>
            <button class="search-submit">
              <Icon name="arrowRight" :size="16" />
            </button>
          </div>
        </div>

        <div class="select-all">
          <span>{{ t('industry.source.selectAll') }}</span>
          <label class="checkbox-label">
            <input type="checkbox" :checked="allSelected" @change="$emit('toggle-select-all')" />
            <span class="checkmark"></span>
          </label>
        </div>

        <div class="source-list">
          <div
            v-for="source in sources"
            :key="source.id"
            class="source-item"
            @click="openDetail(source)"
          >
            <div class="source-left">
              <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
              <span class="source-name">{{ source.name }}</span>
            </div>
            <label class="checkbox-label" @click.stop>
              <input type="checkbox" v-model="source.selected" />
              <span class="checkmark"></span>
            </label>
          </div>
        </div>
      </template>

      <!-- 详情视图 -->
      <template v-else>
        <div class="detail-header">
          <button class="detail-back-btn" @click="closeDetail" :title="t('common.back')">
            <Icon name="chevronLeft" :size="16" />
          </button>
          <span class="detail-title">{{ expandedSource.name }}</span>
          <button class="detail-external-btn" @click="$emit('open-external', expandedSource)" :title="t('industry.source.openExternal')">
            <Icon name="externalLink" :size="16" />
          </button>
        </div>

        <div class="detail-summary-section">
          <div class="detail-summary-header" @click="summaryCollapsed = !summaryCollapsed">
            <Icon name="lightning" :size="14" color="#5c6bc0" />
            <span class="detail-summary-title">{{ t('industry.source.guide') }}</span>
            <Icon :name="summaryCollapsed ? 'chevronDown' : 'chevronUp'" :size="14" class="summary-toggle-icon" />
          </div>
          <template v-if="!summaryCollapsed">
            <p class="detail-summary-text">{{ expandedSource.summary }}</p>
            <div class="detail-tags">
              <span v-for="tag in expandedSource.tags" :key="tag" class="detail-tag">{{ tag }}</span>
            </div>
          </template>
        </div>

        <div class="detail-content-section">
          <template v-if="expandedSource.type === 'web'">
            <a v-if="expandedSource.url" :href="expandedSource.url" class="detail-source-url" target="_blank">{{ expandedSource.url }}</a>
            <pre class="detail-raw-text">{{ expandedSource.content }}</pre>
          </template>
          <template v-else-if="expandedSource.type === 'markdown'">
            <pre class="detail-raw-text detail-markdown">{{ expandedSource.content }}</pre>
          </template>
          <template v-else>
            <pre class="detail-raw-text">{{ expandedSource.content }}</pre>
          </template>
        </div>
      </template>
    </div>
  </div>

  <!-- 折叠条 -->
  <div v-else class="panel-collapsed-strip">
    <div class="strip-header">
      <button class="header-btn" @click="showLeftPanel = true" title="展开">
        <Icon name="panelLeft" :size="18" :strokeWidth="1.8" />
      </button>
    </div>
    <div class="strip-body">
      <div class="strip-content">
        <div v-for="source in sources" :key="source.id" class="strip-icon-item" :title="source.name">
          <Icon :name="getSourceIcon(source.type)" :size="20" :color="getSourceColor(source.type)" />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'
import { useIndustryLayout } from '../composables/useIndustryLayout'

defineProps({ sources: { type: Array, default: () => [] }, allSelected: Boolean })
defineEmits(['add-source', 'toggle-select-all', 'open-external'])

const { t } = useLocale()
const { leftWidth, showLeftPanel, expandPanel, collapsePanel } = useIndustryLayout()

const expandedSource = ref(null)
const summaryCollapsed = ref(false)

const openDetail = (source) => {
  expandedSource.value = source
  summaryCollapsed.value = false
  expandPanel('left')
}

const closeDetail = () => {
  expandedSource.value = null
  collapsePanel('left')
}

const getSourceIcon = (type) => {
  const map = { web: 'globe', markdown: 'fileText', pdf: 'file', text: 'file', code: 'file', image: 'image', video: 'video', audio: 'audio' }
  return map[type] || 'file'
}

const getSourceColor = (type) => {
  const map = { web: 'var(--text-color-muted)', markdown: '#2da44e', pdf: '#dc3545', text: 'var(--text-color-muted)', code: '#0366d6', image: '#e85d2a', video: '#388E3C', audio: '#7B1FA2' }
  return map[type] || 'var(--text-color-muted)'
}
</script>

<style>
@import '../industry-shared.css';
</style>

<style scoped>
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

.add-source-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px 20px;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 24px;
  color: var(--text-color-muted);
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 16px;
  transition: all 0.15s;
}

.add-source-btn:hover { background: var(--hover-bg); }

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
</style>
