<template>
  <div class="provider-manager">
    <div class="header">
      <h1>{{ t('providerManager.title') }}</h1>
      <n-space>
        <n-button type="primary" @click="handleAdd">
          {{ t('providerManager.addProvider') }}
        </n-button>
        <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
      </n-space>
    </div>

    <n-spin :show="loading">
      <div class="provider-layout">
        <div class="provider-list">
          <ProviderCard
            v-for="provider in providers"
            :key="provider.id"
            :provider="provider"
            :selected="selectedProviderId === provider.id"
            @select="handleSelectProvider"
            @edit="handleEdit"
            @delete="handleDelete"
          />

          <n-empty v-if="!loading && providers.length === 0" :description="t('providerManager.title')" />
        </div>

        <div v-if="selectedProvider" class="provider-detail-panel">
          <ProviderLinkedProfilesPanel
            :provider="selectedProvider"
            :providers="providers"
            :refresh-key="profilesRefreshKey"
          />
        </div>

        <n-empty
          v-else-if="!loading"
          class="provider-detail-empty"
          :description="t('providerManager.selectProviderHint')"
        />
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

        <n-form-item :label="t('providerManager.defaultModelIds')">
          <n-input
            v-model:value="formData.defaultModelsText"
            type="textarea"
            :autosize="{ minRows: 4, maxRows: 8 }"
            :placeholder="t('providerManager.defaultModelIdsPlaceholder')"
          />
        </n-form-item>

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
import { ref, computed, onMounted, onActivated } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useProviders } from '@composables/useProviders'
import { useProfiles } from '@composables/useProfiles'
import { useLocale } from '@composables/useLocale'
import ProviderCard from '@components/ProviderCard.vue'
import ProviderLinkedProfilesPanel from './ProviderLinkedProfilesPanel.vue'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})

const message = useMessage()
const dialog = useDialog()
const { t, initLocale } = useLocale()

const { providers, loading, loadProviders, addProvider, updateProvider, deleteProvider } = useProviders()
const { loadProfiles } = useProfiles()

const showModal = ref(false)
const isEdit = ref(false)
const formRef = ref(null)
const selectedProviderId = ref('')
const profilesRefreshKey = ref(0)

const defaultFormData = () => ({
  id: '',
  name: '',
  baseUrl: '',
  defaultModelsText: ''
})

const formData = ref(defaultFormData())

const selectedProvider = computed(() => (
  providers.value.find(provider => provider.id === selectedProviderId.value) || providers.value[0] || null
))

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
  await Promise.all([loadProviders(), loadProfiles()])
  profilesRefreshKey.value += 1
  if (providers.value.length > 0 && !selectedProviderId.value) {
    selectedProviderId.value = providers.value[0].id
  }
})

// KeepAlive 激活时刷新（嵌入在 model-settings 多 tab 页面）
onActivated(() => {
  Promise.all([loadProviders(), loadProfiles()]).then(() => {
    profilesRefreshKey.value += 1
    if (!selectedProviderId.value && providers.value.length > 0) {
      selectedProviderId.value = providers.value[0].id
    }
  })
})

const handleClose = () => {
  if (props.embedded) return
  window.close()
}

const handleAdd = () => {
  isEdit.value = false
  formData.value = defaultFormData()
  showModal.value = true
}

const handleSelectProvider = (provider) => {
  selectedProviderId.value = provider.id
}

const handleEdit = (provider) => {
  isEdit.value = true
  formData.value = {
    id: provider.id,
    name: provider.name,
    baseUrl: provider.baseUrl || '',
    defaultModelsText: Array.isArray(provider.defaultModels) ? provider.defaultModels.join('\n') : ''
  }
  showModal.value = true
}

const handleDelete = (providerId) => {
  dialog.warning({
    title: t('common.confirm'),
    content: t('providerManager.deleteConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deleteProvider(providerId)
        await loadProviders()
        profilesRefreshKey.value += 1
        if (selectedProviderId.value === providerId) {
          selectedProviderId.value = providers.value[0]?.id || ''
        }
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

    const defaultModels = Array.from(new Set(
      String(formData.value.defaultModelsText || '')
        .split(/\r?\n/)
        .map(item => item.trim())
        .filter(Boolean)
    ))

    const data = {
      id: formData.value.id,
      name: formData.value.name,
      baseUrl: formData.value.baseUrl || null,
      defaultModels
    }

    if (isEdit.value) {
      await updateProvider(formData.value.id, data)
      message.success(t('providerManager.saveSuccess'))
    } else {
      await addProvider(data)
      message.success(t('providerManager.saveSuccess'))
      selectedProviderId.value = data.id
    }

    await loadProviders()
    profilesRefreshKey.value += 1
    showModal.value = false
  } catch (errors) {
    console.warn('Validation failed:', errors)
  }
}

</script>

<style scoped>
.provider-manager {
  padding: 20px;
  max-width: 1320px;
  margin: 0 auto;
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 14px;
  border-bottom: 2px solid var(--border-color, #f0f0f0);
  background: var(--bg-color-secondary, white);
  margin: -20px -20px 16px -20px;
  padding: 18px 20px;
  border-radius: 12px 12px 0 0;
}

.header h1 {
  font-size: 20px;
  font-weight: 600;
}

.provider-layout {
  display: grid;
  grid-template-columns: minmax(240px, 320px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  margin: 0 -20px;
}

.provider-list {
  display: grid;
  grid-template-columns: 1fr;
  gap: 10px;
  min-height: 200px;
}

.provider-detail-panel {
  min-width: 0;
  min-height: 200px;
}

.provider-detail-empty {
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 700px) {
  .provider-manager {
    padding: 14px;
  }

  .header {
    margin: -14px -14px 14px -14px;
    padding: 14px;
  }

  .provider-layout {
    grid-template-columns: 1fr;
    margin: 0 -14px;
  }
}

</style>
