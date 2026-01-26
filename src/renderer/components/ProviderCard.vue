<template>
  <n-card hoverable class="provider-card">
    <div class="provider-header">
      <div class="provider-title">
        <h3>{{ provider.name }}</h3>
        <n-space :size="8">
          <n-tag v-if="provider.isBuiltIn" type="info" size="small">
            {{ t('common.builtIn') }}
          </n-tag>
          <n-tag v-else type="success" size="small">
            {{ t('common.custom') }}
          </n-tag>
          <n-tag v-if="provider.needsMapping" type="warning" size="small">
            {{ t('providerManager.needsMapping') }}
          </n-tag>
        </n-space>
      </div>
    </div>

    <div class="provider-info">
      <div class="info-row">
        <span class="label">ID:</span>
        <span class="value code">{{ provider.id }}</span>
      </div>
      <div class="info-row">
        <span class="label">Base URL:</span>
        <span class="value url-value" :title="provider.baseUrl">
          {{ provider.baseUrl || t('common.default') }}
        </span>
      </div>
      <div class="info-row" v-if="provider.defaultModelMapping">
        <span class="label">{{ t('providerManager.defaultModelMapping') }}:</span>
        <span class="value code">{{ provider.defaultModelMapping }}</span>
      </div>
    </div>

    <template #action>
      <n-space justify="end">
        <n-button
          size="small"
          @click="$emit('edit', provider)"
        >
          {{ t('common.edit') }}
        </n-button>
        <n-button
          size="small"
          type="error"
          :disabled="provider.isBuiltIn"
          @click="$emit('delete', provider.id)"
        >
          {{ t('common.delete') }}
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup>
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

defineProps({
  provider: {
    type: Object,
    required: true
  }
})

defineEmits(['edit', 'delete'])
</script>

<style scoped>
.provider-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  height: 100%;
}

.provider-card:hover {
  transform: translateY(-2px);
}

.provider-header {
  margin-bottom: 12px;
}

.provider-title {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.provider-title h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.provider-info {
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
  text-align: right;
}

.value.code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  background: var(--bg-color-tertiary, #f5f5f0);
  padding: 2px 8px;
  border-radius: 4px;
}

.url-value {
  font-size: 12px;
  max-width: 250px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
