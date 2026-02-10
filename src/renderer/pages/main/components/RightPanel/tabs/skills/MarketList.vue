<template>
  <div class="market-list-wrapper">
    <!-- 搜索 + 刷新 -->
    <div v-if="items.length > 0 || searchText" class="search-row">
      <n-input
        :value="searchText"
        @update:value="$emit('update:search-text', $event)"
        :placeholder="t('market.search')"
        size="small"
        clearable
        style="flex: 1;"
      >
        <template #prefix><Icon name="search" :size="14" /></template>
      </n-input>
      <n-button
        size="small"
        quaternary
        :loading="fetchLoading"
        @click="$emit('fetch')"
        :title="t('common.refresh')"
      >
        <Icon name="refresh" :size="14" />
      </n-button>
    </div>

    <!-- 列表区域 -->
    <div class="list-area">
      <!-- 加载中 -->
      <div v-if="fetchLoading" class="loading-state">
        <Icon name="clock" :size="16" class="loading-icon" />
        <span>{{ t('market.fetching') }}</span>
      </div>

      <!-- 空状态 -->
      <div v-else-if="fetched && items.length === 0" class="empty-state">
        <Icon name="zap" :size="32" style="opacity: 0.4" />
        <span>{{ t('market.empty') }}</span>
      </div>

      <!-- 组件列表 -->
      <div v-else-if="items.length > 0" class="items-list">
        <div v-for="item in items" :key="item.id" class="market-item">
          <div class="item-main">
            <div class="item-header">
              <span class="item-name">{{ item.name || item.id }}</span>
              <span class="item-version">v{{ item.version || '0.0.0' }}</span>
            </div>
            <div v-if="item.description" class="item-desc">{{ item.description }}</div>
            <div class="item-meta">
              <span v-if="item.author" class="item-author">
                <Icon name="user" :size="12" /> {{ item.author }}
              </span>
              <span v-if="item.tags && item.tags.length" class="item-tags">
                <span v-for="tag in item.tags" :key="tag" class="item-tag">{{ tag }}</span>
              </span>
            </div>
          </div>
          <div class="item-action">
            <!-- 安装中 -->
            <n-button
              v-if="installingSet.has(item.id)"
              size="tiny"
              :loading="true"
              disabled
            >
              {{ t('market.installing') }}
            </n-button>
            <!-- 可更新 -->
            <n-button
              v-else-if="getItemStatus(item) === 'updatable'"
              size="tiny"
              type="info"
              @click="$emit('update-item', item)"
            >
              {{ t('market.update') }}
            </n-button>
            <!-- 已安装 -->
            <n-button
              v-else-if="getItemStatus(item) === 'installed'"
              size="tiny"
              quaternary
              @click="$emit('install', item)"
            >
              {{ t('market.installed') }} ✓
            </n-button>
            <!-- 未安装 -->
            <n-button
              v-else
              size="tiny"
              type="primary"
              @click="$emit('install', item)"
            >
              {{ t('market.install') }}
            </n-button>
          </div>
        </div>
      </div>

      <!-- 初始状态 -->
      <div v-else class="init-state">
        <Icon name="download" :size="32" style="opacity: 0.3" />
        <span>{{ t('market.noRegistry') }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { NInput, NButton } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  items: { type: Array, default: () => [] },
  installedMap: { type: Map, default: () => new Map() },
  installingSet: { type: Set, default: () => new Set() },
  fetchLoading: { type: Boolean, default: false },
  fetched: { type: Boolean, default: false },
  searchText: { type: String, default: '' }
})

defineEmits(['update:search-text', 'fetch', 'install', 'update-item'])

// 简单 semver 比较：remote > local
const isNewer = (remote, local) => {
  if (!remote || !local) return false
  const r = remote.split('.').map(Number)
  const l = local.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const rv = r[i] || 0
    const lv = l[i] || 0
    if (rv > lv) return true
    if (rv < lv) return false
  }
  return false
}

const getItemStatus = (item) => {
  const meta = props.installedMap.get(item.id)
  if (!meta) return 'not_installed'
  const installedVersion = meta.version || meta.marketVersion
  if (isNewer(item.version, installedVersion)) return 'updatable'
  return 'installed'
}
</script>

<style scoped>
.market-list-wrapper {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.search-row {
  display: flex;
  gap: 6px;
  align-items: center;
}

.list-area {
  min-height: 200px;
  max-height: 400px;
  overflow-y: auto;
}

.loading-state,
.empty-state,
.init-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 200px;
  color: var(--text-color-muted);
  font-size: 13px;
}

.loading-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.market-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.market-item:hover {
  background: var(--hover-bg);
}

.item-main {
  flex: 1;
  min-width: 0;
}

.item-header {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-color);
}

.item-version {
  font-size: 11px;
  color: var(--primary-color);
  font-weight: 500;
}

.item-desc {
  font-size: 12px;
  color: var(--text-color-muted);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}

.item-author {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-color-muted);
  opacity: 0.8;
}

.item-tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.item-tag {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--hover-bg);
  color: var(--text-color-muted);
}

.item-action {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding-top: 2px;
}
</style>
