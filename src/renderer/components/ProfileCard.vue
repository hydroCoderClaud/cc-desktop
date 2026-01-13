<template>
  <n-card :title="profile.name" hoverable class="profile-card">
    <template #header-extra>
      <n-space :size="8">
        <n-tag v-if="profile.isDefault" type="success" size="small">
          默认
        </n-tag>
        <n-tag :type="providerTagType" size="small">
          {{ profile.providerType }}
        </n-tag>
      </n-space>
    </template>

    <div class="profile-info">
      <div class="info-row">
        <span class="label">API Key:</span>
        <span class="value">{{ maskedApiKey }}</span>
      </div>
      <div class="info-row" v-if="profile.baseUrl">
        <span class="label">Base URL:</span>
        <span class="value url-value">{{ profile.baseUrl }}</span>
      </div>
      <div class="info-row" v-if="profile.modelMapping">
        <span class="label">模型映射:</span>
        <span class="value">{{ profile.modelMapping }}</span>
      </div>
      <div class="info-row" v-if="profile.proxyUrl">
        <span class="label">代理:</span>
        <span class="value url-value">{{ profile.proxyUrl }}</span>
      </div>
      <div class="info-row">
        <span class="label">创建时间:</span>
        <span class="value">{{ formatDate(profile.createdAt) }}</span>
      </div>
    </div>

    <template #action>
      <n-space justify="end">
        <n-button
          v-if="!profile.isDefault"
          size="small"
          @click="$emit('set-default', profile.id)"
        >
          设为默认
        </n-button>
        <n-button
          size="small"
          @click="$emit('test', profile)"
        >
          测试
        </n-button>
        <n-button
          size="small"
          @click="$emit('edit', profile)"
        >
          编辑
        </n-button>
        <n-button
          size="small"
          type="error"
          :disabled="profile.isDefault"
          @click="$emit('delete', profile.id)"
        >
          删除
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  profile: {
    type: Object,
    required: true
  }
})

defineEmits(['edit', 'delete', 'set-default', 'test'])

const maskedApiKey = computed(() => {
  const key = props.profile.apiKey || ''
  if (key.length <= 8) return '********'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
})

const providerTagType = computed(() => {
  const type = props.profile.providerType?.toLowerCase() || ''
  if (type === 'official' || type === '官方') return 'info'
  if (type === 'openrouter') return 'warning'
  return 'default'
})

const formatDate = (dateStr) => {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  return date.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  })
}
</script>

<style scoped>
.profile-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.profile-card:hover {
  transform: translateY(-2px);
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.label {
  color: #8c8c8c;
  font-weight: 500;
  flex-shrink: 0;
}

.value {
  color: #2d2d2d;
  text-align: right;
  word-break: break-all;
}

.url-value {
  font-size: 12px;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
