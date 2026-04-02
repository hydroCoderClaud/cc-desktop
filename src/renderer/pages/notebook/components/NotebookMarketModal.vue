<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('notebook.market.title')"
    style="width: 1000px;"
    :body-style="{ maxHeight: '75vh', overflowY: 'auto', overflowX: 'hidden' }"
    :mask-closable="false"
    @update:show="handleMarketVisibilityChange"
  >
    <div class="market-v2-container">
      <!-- 顶部搜索 -->
      <div class="market-header">
        <div class="market-controls">
          <n-input v-model:value="searchQuery" :placeholder="t('notebook.market.searchPlaceholder')" class="search-bar">
            <template #prefix><Icon name="search" :size="16" /></template>
          </n-input>
          <n-popover trigger="click" placement="bottom-end">
            <template #trigger>
              <button class="filter-trigger-btn" :class="{ active: selectedTags.length > 0 }" :title="t('notebook.market.filterTags')">
                <Icon name="filter" :size="16" />
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
        </div>
        <div class="market-stats">{{ t('notebook.market.found', { count: filteredTools.length }) }}</div>
      </div>

      <div v-if="selectedTags.length > 0" class="active-tags-row">
        <n-tag
          v-for="tag in selectedTags"
          :key="tag"
          size="small"
          round
          closable
          type="info"
          @close="removeTag(tag)"
        >
          {{ tag }}
        </n-tag>
      </div>

      <!-- 工具网格 -->
      <div class="market-content">
        <n-spin :show="loading" :description="t('market.fetching')">
          <div class="market-scroll-area">
            <div v-if="!loading && filteredTools.length > 0" class="tool-grid">
              <div
                v-for="tool in filteredTools"
                :key="tool.id"
                class="market-tool-card"
                @click="openDetail(tool)"
              >
                <div class="card-header">
                  <div class="tool-icon-box" :style="{ background: tool.bgColor, color: tool.color }">
                    <Icon :name="tool.icon" :size="24" />
                  </div>
                  <div class="title-group">
                    <div class="tool-name">{{ tool.name }}</div>
                    <div class="tool-id">ID: {{ tool.id }}</div>
                    <div class="tool-version">v{{ tool.version || '1.0.0' }}</div>
                  </div>
                </div>

                <div class="card-body">
                  <p class="tool-desc">{{ tool.description }}</p>
                  <div v-if="tool.tags?.length" class="tool-tags">
                    <span
                      v-for="tag in tool.tags"
                      :key="`${tool.id}-${tag}`"
                      class="tool-tag-chip"
                    >
                      {{ tag }}
                    </span>
                  </div>
                </div>

                <div class="card-actions">
                  <n-button
                    type="primary"
                    size="small"
                    class="flex-1"
                    :loading="installingId === tool.id"
                    @click.stop="handleInstall(tool)"
                  >
                    {{ getInstallButtonText(tool) }}
                  </n-button>
                  <n-button
                    v-if="isInstalled(tool.id)"
                    type="error"
                    size="small"
                    quaternary
                    @click.stop="handleUninstall(tool)"
                  >
                    {{ t('notebook.market.uninstall') }}
                  </n-button>
                </div>
              </div>
            </div>
            <div v-else-if="!loading" class="empty-state">
              <n-empty :description="emptyDescription" />
            </div>
          </div>
        </n-spin>
      </div>
    </div>

    <!-- 详情子弹窗 -->
    <n-modal
      :show="show && showDetail"
      preset="card"
      :title="selectedTool?.name"
      style="width: 500px;"
      :z-index="12000"
      @update:show="handleDetailVisibilityChange"
    >
      <div v-if="selectedTool" class="tool-detail-v2">
        <div class="detail-header-v2">
          <div class="tool-icon-large" :style="{ background: selectedTool.bgColor, color: selectedTool.color }">
            <Icon :name="selectedTool.icon" :size="32" />
          </div>
          <div class="title-meta">
            <div class="name">ID: {{ selectedTool.id }}</div>
            <div class="ver">v{{ selectedTool.version || '1.0.0' }}</div>
          </div>
        </div>
        <n-divider style="margin: 10px 0" />
        <div class="detail-section">
          <div class="label">{{ t('notebook.market.detailTitle') }}</div>
          <p class="content">{{ selectedTool.description }}</p>
        </div>
        <div class="detail-section" v-if="selectedTool.tags?.length">
          <div class="label">{{ t('notebook.market.tags') }}</div>
          <div class="detail-tags">
            <span
              v-for="tag in selectedTool.tags"
              :key="tag"
              class="tool-tag-chip"
            >
              {{ tag }}
            </span>
          </div>
        </div>
        <div class="detail-section" v-if="selectedTool.installDependencies?.length">
          <div class="label">{{ t('notebook.market.detailDeps') }}</div>
          <div class="dep-list">
            <div v-for="dep in selectedTool.installDependencies" :key="dep.id" class="dep-row">
              <n-tag size="small" :bordered="false" type="info">{{ dep.type.toUpperCase() }}</n-tag>
              <span>{{ dep.id }}</span>
              <span v-if="dep.marketplaceSource" class="dep-market">{{ dep.marketplaceSource }}</span>
            </div>
          </div>
        </div>
        <div class="detail-section" v-if="selectedTool.runtimePlaceholders && Object.keys(selectedTool.runtimePlaceholders).length">
          <div class="label">{{ t('notebook.market.detailRuntime') }}</div>
          <div class="mapping-list">
            <div v-for="(v, k) in selectedTool.runtimePlaceholders" :key="k" class="mapping-row">
              <span class="key">{{ k }}:</span>
              <span class="val">{{ v }}</span>
            </div>
          </div>
        </div>
      </div>
    </n-modal>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NPopover } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import { isNewerVersion } from '../utils/version'

const props = defineProps({
  show: Boolean,
  localTools: { type: Array, default: () => [] }
})

const emit = defineEmits(['update:show', 'install', 'uninstall'])
const { t } = useLocale()

const loading = ref(false)
const searchQuery = ref('')
const remoteTools = ref([])
const selectedTags = ref([])
const selectedTool = ref(null)
const showDetail = ref(false)
const installingId = ref(null)

const normalizeToolTags = (tool) => ({
  ...tool,
  id: String(tool?.id || '').trim(),
  name: String(tool?.name || tool?.id || '').trim(),
  description: String(tool?.description || '').trim(),
  tags: Array.isArray(tool?.tags)
    ? [...new Set(tool.tags.map(tag => String(tag).trim()).filter(Boolean))]
    : []
})

const availableTags = computed(() => {
  const tags = remoteTools.value.flatMap(tool => tool.tags || [])
  return [...new Set(tags)].sort((a, b) => a.localeCompare(b, 'zh-CN'))
})

const filteredTools = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()

  return remoteTools.value.filter((tool) => {
    const matchesSearch = !q ||
      tool.name.toLowerCase().includes(q) ||
      tool.description.toLowerCase().includes(q) ||
      tool.id.toLowerCase().includes(q) ||
      (tool.tags || []).some(tag => tag.toLowerCase().includes(q))

    const matchesTags = selectedTags.value.length === 0 ||
      selectedTags.value.some(tag => (tool.tags || []).includes(tag))

    return matchesSearch && matchesTags
  })
})

const emptyDescription = computed(() => {
  if (selectedTags.value.length > 0 || searchQuery.value.trim()) return t('notebook.market.noTagMatches')
  return t('notebook.market.empty')
})

const filterTriggerLabel = computed(() => {
  if (selectedTags.value.length === 0) return t('notebook.market.allTags')
  return t('notebook.market.filterTags')
})

const loadRemoteTools = async () => {
  loading.value = true
  try {
    const res = await window.electronAPI.notebookFetchRemoteTools()
    if (res.success && res.data?.tools) {
      remoteTools.value = res.data.tools.map(normalizeToolTags)
    } else {
      remoteTools.value = []
    }
  } catch (err) {
    console.error('Failed to load remote tools:', err)
    remoteTools.value = []
  } finally {
    loading.value = false
  }
}

const resetMarketState = () => {
  searchQuery.value = ''
  selectedTags.value = []
  selectedTool.value = null
  showDetail.value = false
  loading.value = false
}

const handleMarketVisibilityChange = (value) => {
  if (!value) resetMarketState()
  emit('update:show', value)
}

const handleDetailVisibilityChange = (value) => {
  showDetail.value = value
  if (!value) selectedTool.value = null
}

watch(() => props.show, (val) => {
  if (val) {
    resetMarketState()
    loadRemoteTools()
  } else {
    resetMarketState()
  }
})

watch(() => props.localTools, () => {
  installingId.value = null
})

const clearTagFilters = () => {
  selectedTags.value = []
}

const toggleTag = (tag) => {
  if (selectedTags.value.includes(tag)) {
    selectedTags.value = selectedTags.value.filter(item => item !== tag)
  } else {
    selectedTags.value = [...selectedTags.value, tag]
  }
}

const removeTag = (tag) => {
  selectedTags.value = selectedTags.value.filter(item => item !== tag)
}

const isInstalled = (id) => {
  if (!id || !props.localTools) return false
  return props.localTools.some(lt =>
    lt.id.trim() === id.trim() && lt.installed === true
  )
}

const isUpdatable = (rt) => {
  if (!rt || !rt.id) return false
  const lt = props.localTools.find(lt => lt.id.trim() === rt.id.trim() && lt.installed === true)
  if (!lt) return false
  return isNewerVersion(rt.version, lt.version)
}

const getInstallButtonText = (tool) => {
  const installed = isInstalled(tool.id)
  if (!installed) return t('notebook.market.install')
  if (isUpdatable(tool)) return t('notebook.market.update')
  return t('notebook.market.reinstall')
}

const openDetail = (tool) => {
  selectedTool.value = tool
  showDetail.value = true
}

const handleInstall = (tool) => {
  installingId.value = tool.id
  emit('install', tool)
  setTimeout(() => { installingId.value = null }, 30000)
}

const handleUninstall = (tool) => {
  emit('uninstall', tool.id)
  showDetail.value = false
  selectedTool.value = null
}
</script>

<style scoped>
.market-v2-container { display: flex; flex-direction: column; gap: 16px; height: auto; min-height: 0; }
.market-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.market-controls { display: flex; align-items: center; gap: 12px; flex: 1; max-width: 520px; }
.search-bar { flex: 1; }
.market-stats { font-size: 12px; color: var(--text-color-muted); }
.market-content { min-height: 0; overflow: hidden; }
.market-content :deep(.n-spin-container) { min-height: 0; }
.market-content :deep(.n-spin-body) { min-height: 0; }
.filter-trigger-btn {
  position: relative;
  min-width: 38px;
  height: 38px;
  border: 1px solid var(--border-color);
  background: var(--bg-color-secondary);
  color: var(--text-color-muted);
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: all 0.2s;
  padding: 0 10px;
}
.filter-trigger-label { font-size: 12px; }
.filter-trigger-btn:hover { background: var(--hover-bg); color: var(--text-color); }
.filter-trigger-btn.active {
  color: var(--primary-color);
  border-color: var(--primary-color);
  background: var(--primary-ghost, rgba(74, 144, 217, 0.08));
}
.filter-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  min-width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--primary-color);
  color: #fff;
  font-size: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 4px;
}
.tag-filter-panel { width: 280px; display: flex; flex-direction: column; gap: 12px; }
.tag-filter-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.tag-filter-title { font-size: 13px; font-weight: 600; color: var(--text-color); }
.clear-filters-btn {
  border: none;
  background: transparent;
  color: var(--primary-color);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
}
.tag-filter-list { display: flex; flex-wrap: wrap; gap: 8px; }
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
.tag-chip:hover { background: var(--hover-bg); color: var(--text-color); }
.tag-chip.active {
  border-color: var(--primary-color);
  background: var(--primary-ghost, rgba(74, 144, 217, 0.08));
  color: var(--primary-color);
}
.tag-filter-empty { font-size: 12px; color: var(--text-color-muted); }
.active-tags-row { display: flex; flex-wrap: wrap; gap: 8px; }

.market-scroll-area {
  max-height: calc(75vh - 150px);
  overflow-y: auto;
  overflow-x: hidden;
  padding: 4px;
}

.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 20px;
}

.market-tool-card {
  background: var(--bg-color-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  aspect-ratio: 3 / 2;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.market-tool-card:hover {
  transform: translateY(-4px);
  border-color: var(--primary-color);
  box-shadow: 0 8px 24px rgba(0,0,0,0.1);
}

.card-header { display: flex; align-items: center; gap: 12px; height: 44px; }
.tool-icon-box { width: 44px; height: 44px; border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }

.title-group { flex: 1; display: flex; flex-direction: column; justify-content: center; overflow: hidden; }
.tool-name { font-size: 15px; font-weight: 700; color: var(--text-color); line-height: 1.2; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-id { font-size: 11px; color: var(--text-color-muted); line-height: 1.2; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tool-version { font-size: 12px; color: var(--primary-color); font-weight: 600; line-height: 1.2; margin-top: 2px; }

.card-body { flex: 1; overflow: hidden; margin-top: 8px; }
.tool-desc { font-size: 12px; color: var(--text-color-muted); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.tool-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  margin-top: 12px;
}
.tool-tag-chip {
  display: inline-flex;
  align-items: center;
  height: 22px;
  padding: 0 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1;
  color: var(--primary-color);
  background: var(--primary-ghost, rgba(74, 144, 217, 0.08));
  white-space: nowrap;
}

.card-actions { display: flex; align-items: center; gap: 10px; margin-top: auto; padding-top: 12px; }
.flex-1 { flex: 1; }

/* 详情样式 */
.tool-detail-v2 { display: flex; flex-direction: column; gap: 10px; }
.detail-header-v2 { display: flex; align-items: center; gap: 16px; }
.tool-icon-large { width: 56px; height: 56px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.title-meta .name { font-size: 12px; color: var(--text-color-muted); }
.title-meta .ver { font-size: 13px; font-weight: 600; color: var(--primary-color); }

.detail-section .label { font-size: 12px; font-weight: 700; color: var(--text-color-muted); text-transform: uppercase; margin-bottom: 6px; }
.detail-section .content { font-size: 14px; line-height: 1.6; margin: 0; }
.detail-tags { display: flex; flex-wrap: wrap; gap: 8px; }

.dep-list, .mapping-list { display: flex; flex-direction: column; gap: 6px; }
.dep-row, .mapping-row { background: var(--bg-color-tertiary); padding: 6px 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.dep-market { margin-left: auto; font-size: 11px; color: var(--primary-color); }
.mapping-row .key { font-weight: 600; color: var(--text-color); min-width: 70px; }
.mapping-row .val { font-family: monospace; opacity: 0.8; }
</style>
