<template>
  <n-card hoverable class="provider-card">
    <div class="provider-header">
      <div class="provider-title">
        <h3>{{ provider.name }}</h3>
        <n-space :size="8">
          <n-tag v-if="provider.isBuiltIn" type="info" size="small">
            内置
          </n-tag>
          <n-tag v-else type="success" size="small">
            自定义
          </n-tag>
          <n-tag v-if="provider.needsMapping" type="warning" size="small">
            需要映射
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
          {{ provider.baseUrl || '默认' }}
        </span>
      </div>
      <div class="info-row" v-if="provider.defaultModelMapping">
        <span class="label">默认映射:</span>
        <span class="value code">{{ provider.defaultModelMapping }}</span>
      </div>
    </div>

    <template #action>
      <n-space justify="end">
        <n-button
          size="small"
          :disabled="provider.isBuiltIn"
          @click="$emit('edit', provider)"
        >
          编辑
        </n-button>
        <n-button
          size="small"
          type="error"
          :disabled="provider.isBuiltIn"
          @click="$emit('delete', provider.id)"
        >
          删除
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup>
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
}

.provider-card:hover {
  transform: translateY(-2px);
}

.provider-header {
  margin-bottom: 16px;
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
  color: #2d2d2d;
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
  color: #2d2d2d;
  text-align: right;
}

.value.code {
  font-family: 'Consolas', 'Monaco', monospace;
  font-size: 13px;
  background: #f5f5f0;
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
