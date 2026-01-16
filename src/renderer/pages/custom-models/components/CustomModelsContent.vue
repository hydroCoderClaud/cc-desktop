<template>
  <div class="custom-models">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('customModels.title') }}</h1>
      <n-space>
        <n-select
          v-model:value="selectedProfileId"
          :options="profileOptions"
          :placeholder="t('customModels.selectProfile')"
          style="width: 200px"
          @update:value="handleProfileChange"
        />
        <n-button type="primary" @click="handleAdd" :disabled="!selectedProfileId">
          {{ t('customModels.addModel') }}
        </n-button>
        <n-button @click="handleClose">{{ t('common.close') }}</n-button>
      </n-space>
    </div>

    <!-- Models List -->
    <n-spin :show="loading">
      <div class="models-list">
        <n-card
          v-for="model in models"
          :key="model.id"
          hoverable
          class="model-card"
        >
          <div class="model-info">
            <div class="model-header">
              <span class="model-name">{{ model.name }}</span>
              <n-tag :type="getTierType(model.tier)" size="small">
                {{ getTierLabel(model.tier) }}
              </n-tag>
            </div>
            <div class="model-id">ID: {{ model.id }}</div>
            <div class="model-desc" v-if="model.description">{{ model.description }}</div>
          </div>
          <template #action>
            <n-space>
              <n-button size="small" @click="handleEdit(model)">{{ t('common.edit') }}</n-button>
              <n-button size="small" type="error" @click="handleDelete(model.id)">{{ t('common.delete') }}</n-button>
            </n-space>
          </template>
        </n-card>

        <n-empty
          v-if="!loading && models.length === 0"
          :description="selectedProfileId ? t('customModels.noModels') : t('customModels.selectProfileFirst')"
        />
      </div>
    </n-spin>

    <!-- Add/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? t('customModels.editModel') : t('customModels.addModel')"
      style="width: 500px; max-width: 95vw;"
      :mask-closable="false"
    >
      <n-form
        ref="formRef"
        :model="formData"
        :rules="rules"
        label-placement="top"
      >
        <n-form-item :label="t('customModels.modelId')" path="id">
          <n-input
            v-model:value="formData.id"
            :placeholder="t('customModels.modelIdPlaceholder')"
            :disabled="isEdit"
          />
        </n-form-item>

        <n-form-item :label="t('customModels.modelName')" path="name">
          <n-input v-model:value="formData.name" :placeholder="t('customModels.modelNamePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('customModels.modelTier')" path="tier">
          <n-select
            v-model:value="formData.tier"
            :options="tierOptions"
            :placeholder="t('customModels.selectTier')"
          />
        </n-form-item>

        <n-form-item :label="t('common.description')">
          <n-input
            v-model:value="formData.description"
            type="textarea"
            :placeholder="t('customModels.descriptionPlaceholder')"
            :rows="2"
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
import { ref, computed, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useProfiles } from '@composables/useProfiles'
import { useCustomModels } from '@composables/useCustomModels'
import { useLocale } from '@composables/useLocale'

const message = useMessage()
const dialog = useDialog()
const { t, initLocale } = useLocale()

const { profiles, loadProfiles } = useProfiles()
const { models, loading, loadModels, addModel, updateModel, deleteModel } = useCustomModels()

const selectedProfileId = ref(null)
const showModal = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const tierOptions = computed(() => [
  { label: t('customModels.tierOpus'), value: 'opus' },
  { label: t('customModels.tierSonnet'), value: 'sonnet' },
  { label: t('customModels.tierHaiku'), value: 'haiku' }
])

const defaultFormData = () => ({
  id: '',
  name: '',
  tier: 'sonnet',
  description: ''
})

const formData = ref(defaultFormData())

const rules = computed(() => ({
  id: [{ required: true, message: t('common.required'), trigger: 'blur' }],
  name: [{ required: true, message: t('common.required'), trigger: 'blur' }],
  tier: [{ required: true, message: t('common.required'), trigger: 'change' }]
}))

const profileOptions = computed(() => {
  return profiles.value.map(p => ({
    label: p.name,
    value: p.id
  }))
})

const getTierType = (tier) => {
  const types = {
    opus: 'error',
    sonnet: 'warning',
    haiku: 'success'
  }
  return types[tier] || 'default'
}

const getTierLabel = (tier) => {
  const labels = {
    opus: 'Opus',
    sonnet: 'Sonnet',
    haiku: 'Haiku'
  }
  return labels[tier] || tier
}

onMounted(async () => {
  await initLocale()
  await loadProfiles()
  if (profiles.value.length > 0) {
    selectedProfileId.value = profiles.value[0].id
    await loadModels(selectedProfileId.value)
  }
})

const handleClose = () => {
  window.close()
}

const handleProfileChange = async (profileId) => {
  if (profileId) {
    await loadModels(profileId)
  }
}

const handleAdd = () => {
  isEdit.value = false
  formData.value = defaultFormData()
  showModal.value = true
}

const handleEdit = (model) => {
  isEdit.value = true
  formData.value = { ...model }
  showModal.value = true
}

const handleDelete = (modelId) => {
  dialog.warning({
    title: t('common.confirm'),
    content: t('customModels.deleteConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deleteModel(selectedProfileId.value, modelId)
        message.success(t('customModels.deleteSuccess'))
      } catch (err) {
        message.error(t('messages.deleteFailed') + ': ' + err.message)
      }
    }
  })
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()

    if (isEdit.value) {
      await updateModel(selectedProfileId.value, formData.value.id, formData.value)
      message.success(t('customModels.updateSuccess'))
    } else {
      await addModel(selectedProfileId.value, formData.value)
      message.success(t('customModels.addSuccess'))
    }

    showModal.value = false
  } catch (errors) {
    console.warn('Validation failed:', errors)
  }
}
</script>

<style scoped>
.custom-models {
  padding: 24px;
  max-width: 800px;
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

.models-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

.model-card {
  transition: transform 0.2s ease;
}

.model-card:hover {
  transform: translateY(-2px);
}

.model-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.model-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.model-name {
  font-size: 16px;
  font-weight: 600;
}

.model-id {
  font-size: 12px;
  font-family: 'Consolas', monospace;
  color: #666;
}

.model-desc {
  font-size: 13px;
  color: #888;
  margin-top: 4px;
}
</style>
