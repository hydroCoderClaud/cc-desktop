<template>
  <div class="provider-manager">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('providerManager.title') }}</h1>
      <n-space>
        <n-button type="primary" @click="handleAdd">
          {{ t('providerManager.addProvider') }}
        </n-button>
        <n-button @click="handleClose">{{ t('common.close') }}</n-button>
      </n-space>
    </div>

    <!-- Provider List -->
    <n-spin :show="loading">
      <div class="provider-list">
        <ProviderCard
          v-for="provider in providers"
          :key="provider.id"
          :provider="provider"
          @edit="handleEdit"
          @delete="handleDelete"
        />

        <n-empty v-if="!loading && providers.length === 0" :description="t('providerManager.title')" />
      </div>
    </n-spin>

    <!-- Add/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? t('providerManager.editProvider') : t('providerManager.addProvider')"
      style="width: 600px; max-width: 95vw;"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item :label="t('providerManager.providerId')" path="id">
          <n-input
            v-model:value="formData.id"
            placeholder="e.g., openai"
            :disabled="isEdit"
          />
          <template #feedback>
            {{ t('providerManager.providerIdHint') }}
          </template>
        </n-form-item>

        <n-form-item :label="t('providerManager.providerName')" path="name">
          <n-input v-model:value="formData.name" placeholder="e.g., OpenAI" />
        </n-form-item>

        <n-form-item :label="t('providerManager.defaultBaseUrl')">
          <n-input v-model:value="formData.baseUrl" placeholder="e.g., https://api.openai.com" />
        </n-form-item>

        <n-form-item label=" ">
          <n-space align="center">
            <n-switch v-model:value="formData.needsMapping" />
            <span>{{ t('providerManager.needsMapping') }}</span>
          </n-space>
        </n-form-item>

        <div v-if="formData.needsMapping" class="model-mapping-section">
          <n-divider>{{ t('providerManager.defaultModelMapping') }}</n-divider>
          <n-grid :cols="1" :y-gap="12">
            <n-grid-item>
              <n-form-item label="Opus">
                <n-input v-model:value="formData.defaultModelMapping.opus" placeholder="e.g., gpt-4-turbo" />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Sonnet">
                <n-input v-model:value="formData.defaultModelMapping.sonnet" placeholder="e.g., gpt-4" />
              </n-form-item>
            </n-grid-item>
            <n-grid-item>
              <n-form-item label="Haiku">
                <n-input v-model:value="formData.defaultModelMapping.haiku" placeholder="e.g., gpt-3.5-turbo" />
              </n-form-item>
            </n-grid-item>
          </n-grid>
          <p class="help-text">{{ t('providerManager.needsMappingHint') }}</p>
        </div>
      </n-form>

      <template #footer>
        <n-space justify="end">
          <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </n-space>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useProviders } from '@composables/useProviders'
import { useLocale } from '@composables/useLocale'
import ProviderCard from '@components/ProviderCard.vue'

const message = useMessage()
const dialog = useDialog()
const { t, initLocale } = useLocale()

const { providers, loading, loadProviders, addProvider, updateProvider, deleteProvider } = useProviders()

const showModal = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const defaultFormData = () => ({
  id: '',
  name: '',
  baseUrl: '',
  needsMapping: true,
  defaultModelMapping: {
    opus: '',
    sonnet: '',
    haiku: ''
  }
})

const formData = ref(defaultFormData())

const rules = computed(() => ({
  id: [
    { required: true, message: t('common.required'), trigger: 'blur' },
    { pattern: /^[a-z0-9_]+$/, message: t('providerManager.providerIdHint'), trigger: 'blur' }
  ],
  name: [
    { required: true, message: t('common.required'), trigger: 'blur' }
  ]
}))

onMounted(async () => {
  await initLocale()
  await loadProviders()
})

const handleClose = () => {
  window.close()
}

const handleAdd = () => {
  isEdit.value = false
  formData.value = defaultFormData()
  showModal.value = true
}

const handleEdit = (provider) => {
  if (provider.isBuiltIn) {
    message.warning(t('providerManager.cannotEditBuiltIn'))
    return
  }

  isEdit.value = true
  formData.value = {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl || '',
    needsMapping: provider.needsMapping !== false,
    defaultModelMapping: {
      opus: provider.defaultModelMapping?.opus || '',
      sonnet: provider.defaultModelMapping?.sonnet || '',
      haiku: provider.defaultModelMapping?.haiku || ''
    }
  }
  showModal.value = true
}

const handleDelete = (providerId) => {
  const provider = providers.value.find(p => p.id === providerId)
  if (provider?.isBuiltIn) {
    message.warning(t('providerManager.cannotDeleteBuiltIn'))
    return
  }

  dialog.warning({
    title: t('common.confirm'),
    content: t('providerManager.deleteConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deleteProvider(providerId)
        message.success(t('providerManager.deleteSuccess'))
      } catch (err) {
        message.error(t('messages.deleteFailed') + ': ' + err.message)
      }
    }
  })
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()

    const data = {
      id: formData.value.id,
      name: formData.value.name,
      baseUrl: formData.value.baseUrl || null,
      needsMapping: formData.value.needsMapping,
      defaultModelMapping: formData.value.needsMapping ? {
        opus: formData.value.defaultModelMapping.opus || null,
        sonnet: formData.value.defaultModelMapping.sonnet || null,
        haiku: formData.value.defaultModelMapping.haiku || null
      } : null
    }

    if (isEdit.value) {
      await updateProvider(formData.value.id, data)
      message.success(t('providerManager.saveSuccess'))
    } else {
      await addProvider(data)
      message.success(t('providerManager.saveSuccess'))
    }

    showModal.value = false
  } catch (errors) {
    console.warn('Validation failed:', errors)
  }
}
</script>

<style scoped>
.provider-manager {
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color, #f0f0f0);
  background: var(--bg-color-secondary, white);
  margin: -24px -24px 24px -24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.provider-list {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  min-height: 200px;
}

@media (max-width: 700px) {
  .provider-list {
    grid-template-columns: 1fr;
  }
}

.model-mapping-section {
  background: var(--bg-color-tertiary, #f8f9fa);
  padding: 16px;
  border-radius: 8px;
  margin-top: 8px;
}

.help-text {
  font-size: 12px;
  color: #999;
  margin-top: 8px;
}
</style>
