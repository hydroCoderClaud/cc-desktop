<template>
  <n-card hoverable class="profile-card">
    <div class="card-header">
      <div class="profile-name">
        <span class="icon">{{ profile.icon || '🟣' }}</span>
        <span class="name">{{ profile.name }}</span>
      </div>
      <div class="default-switch">
        <n-tag v-if="profile.isDefault" type="success" size="small">{{ t('profileManager.isDefault') }}</n-tag>
        <n-switch
          v-else
          :value="false"
          size="small"
          @update:value="$emit('set-default', profile.id)"
        />
      </div>
    </div>

    <div class="profile-info">
      <div class="info-row">
        <span class="label">{{ t('profileManager.selectedModelId') }}:</span>
        <span class="value">{{ profile.selectedModelId || '-' }}</span>
      </div>
      <div class="info-row">
        <span class="label">{{ t('profileManager.apiKey') }}:</span>
        <span class="value">{{ maskedApiKey }}</span>
      </div>
      <div class="info-row">
        <span class="label">{{ t('profileManager.baseUrl') }}:</span>
        <span class="value url-value" :title="profile.baseUrl">{{ profile.baseUrl || t('common.default') }}</span>
      </div>
    </div>

    <template #action>
      <n-space justify="end" :size="8">
        <n-button size="tiny" :loading="testing" @click="$emit('test', profile)">{{ t('common.test') }}</n-button>
        <n-button size="tiny" @click="$emit('edit', profile)">{{ t('common.edit') }}</n-button>
        <n-button
          size="tiny"
          type="error"
          :disabled="profile.isDefault"
          @click="$emit('delete', profile.id)"
        >
          {{ t('common.delete') }}
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup>
import { computed } from 'vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  profile: {
    type: Object,
    required: true
  },
  testing: {
    type: Boolean,
    default: false
  }
})

defineEmits(['edit', 'delete', 'set-default', 'test'])

const maskedApiKey = computed(() => {
  const key = props.profile.authToken || props.profile.apiKey || ''
  if (key.length <= 8) return '********'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
})
</script>

<style scoped>
.profile-card {
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.profile-card:deep(.n-card__content) {
  padding: 20px 24px 16px;
}

.profile-card:deep(.n-card__action) {
  padding: 14px 24px 16px;
}

.profile-card:hover {
  transform: translateY(-1px);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
  gap: 12px;
}

.profile-name {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-name .icon {
  font-size: 18px;
}

.profile-name .name {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
}

.default-switch {
  display: flex;
  align-items: center;
  gap: 8px;
}

.profile-info {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
  font-size: 12px;
}

.label {
  color: #8c8c8c;
  font-weight: 500;
  flex-shrink: 0;
  line-height: 1.5;
}

.value {
  text-align: right;
  min-width: 0;
  line-height: 1.5;
}

.url-value {
  font-size: 12px;
  max-width: 190px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
