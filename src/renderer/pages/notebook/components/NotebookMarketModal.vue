<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('notebook.market.title')"
    style="width: 1000px;"
    :mask-closable="false"
    @update:show="$emit('update:show', $event)"
  >
    <div class="market-v2-container">
      <!-- 顶部搜索 -->
      <div class="market-header">
        <n-input v-model:value="searchQuery" :placeholder="t('notebook.market.searchPlaceholder')" class="search-bar">
          <template #prefix><Icon name="search" :size="16" /></template>
        </n-input>
        <div class="market-stats">{{ t('notebook.market.found', { count: filteredTools.length }) }}</div>
      </div>

      <!-- 工具网格 -->
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
            <n-empty :description="t('notebook.market.empty')" />
          </div>
        </div>
      </n-spin>
    </div>

    <!-- 详情子弹窗 -->
    <n-modal
      v-model:show="showDetail"
      preset="card"
      :title="selectedTool?.name"
      style="width: 500px;"
      :z-index="12000"
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
const selectedTool = ref(null)
const showDetail = ref(false)
const installingId = ref(null)

const filteredTools = computed(() => {
  if (!searchQuery.value) return remoteTools.value
  const q = searchQuery.value.toLowerCase()
  return remoteTools.value.filter(t =>
    t.name.toLowerCase().includes(q) ||
    t.description.toLowerCase().includes(q) ||
    t.id.toLowerCase().includes(q)
  )
})

const loadRemoteTools = async () => {
  loading.value = true
  try {
    const res = await window.electronAPI.notebookFetchRemoteTools()
    if (res.success && res.data?.tools) {
      remoteTools.value = res.data.tools
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

watch(() => props.show, (val) => {
  if (val) loadRemoteTools()
})

// 父组件 loadTools 刷新后 localTools 变化，清除安装 loading
watch(() => props.localTools, () => {
  installingId.value = null
})

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
  // loading 由父组件安装完成后 loadTools 刷新 prop 时自动清除
  // 添加兜底超时，防止父组件异常时 loading 卡死
  setTimeout(() => { installingId.value = null }, 30000)
}

const handleUninstall = (tool) => {
  emit('uninstall', tool.id)
  showDetail.value = false
}
</script>

<style scoped>
.market-v2-container { display: flex; flex-direction: column; gap: 20px; height: 65vh; }
.market-header { display: flex; justify-content: space-between; align-items: center; gap: 20px; }
.search-bar { flex: 1; max-width: 400px; }
.market-stats { font-size: 12px; color: var(--text-color-muted); }

.market-scroll-area { flex: 1; overflow-y: auto; padding: 4px; }

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

.dep-list, .mapping-list { display: flex; flex-direction: column; gap: 6px; }
.dep-row, .mapping-row { background: var(--bg-color-tertiary); padding: 6px 10px; border-radius: 6px; display: flex; align-items: center; gap: 10px; font-size: 12px; }
.dep-market { margin-left: auto; font-size: 11px; color: var(--primary-color); }
.mapping-row .key { font-weight: 600; color: var(--text-color); min-width: 70px; }
.mapping-row .val { font-family: monospace; opacity: 0.8; }
</style>
