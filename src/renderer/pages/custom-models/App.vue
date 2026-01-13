<template>
  <n-config-provider :theme-overrides="claudeTheme">
    <n-message-provider>
      <n-dialog-provider>
        <div class="custom-models">
          <!-- Header -->
          <div class="header">
            <h1>自定义模型管理</h1>
            <n-space>
              <n-select
                v-model:value="selectedProfileId"
                :options="profileOptions"
                placeholder="选择 Profile"
                style="width: 200px"
                @update:value="handleProfileChange"
              />
              <n-button type="primary" @click="handleAdd" :disabled="!selectedProfileId">
                添加模型
              </n-button>
              <n-button @click="handleClose">关闭</n-button>
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
                    <n-button size="small" @click="handleEdit(model)">编辑</n-button>
                    <n-button size="small" type="error" @click="handleDelete(model.id)">删除</n-button>
                  </n-space>
                </template>
              </n-card>

              <n-empty
                v-if="!loading && models.length === 0"
                :description="selectedProfileId ? '暂无自定义模型' : '请先选择一个 Profile'"
              />
            </div>
          </n-spin>

          <!-- Add/Edit Modal -->
          <n-modal
            v-model:show="showModal"
            preset="card"
            :title="isEdit ? '编辑模型' : '添加模型'"
            style="width: 500px; max-width: 95vw;"
            :mask-closable="false"
          >
            <n-form
              ref="formRef"
              :model="formData"
              :rules="rules"
              label-placement="top"
            >
              <n-form-item label="模型 ID" path="id">
                <n-input
                  v-model:value="formData.id"
                  placeholder="例如: claude-3-opus-20240229"
                  :disabled="isEdit"
                />
              </n-form-item>

              <n-form-item label="显示名称" path="name">
                <n-input v-model:value="formData.name" placeholder="例如: Claude 3 Opus" />
              </n-form-item>

              <n-form-item label="模型等级" path="tier">
                <n-select
                  v-model:value="formData.tier"
                  :options="tierOptions"
                  placeholder="选择模型等级"
                />
              </n-form-item>

              <n-form-item label="描述">
                <n-input
                  v-model:value="formData.description"
                  type="textarea"
                  placeholder="模型描述（可选）"
                  :rows="2"
                />
              </n-form-item>
            </n-form>

            <template #footer>
              <n-space justify="end">
                <n-button @click="showModal = false">取消</n-button>
                <n-button type="primary" @click="handleSave">保存</n-button>
              </n-space>
            </template>
          </n-modal>
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { claudeTheme } from '@theme/claude-theme'
import { useProfiles } from '@composables/useProfiles'
import { useCustomModels } from '@composables/useCustomModels'

const message = useMessage()
const dialog = useDialog()

const { profiles, loadProfiles } = useProfiles()
const { models, loading, loadModels, addModel, updateModel, deleteModel } = useCustomModels()

const selectedProfileId = ref(null)
const showModal = ref(false)
const isEdit = ref(false)
const formRef = ref(null)

const tierOptions = [
  { label: '高级 (Opus)', value: 'opus' },
  { label: '标准 (Sonnet)', value: 'sonnet' },
  { label: '快速 (Haiku)', value: 'haiku' }
]

const defaultFormData = () => ({
  id: '',
  name: '',
  tier: 'sonnet',
  description: ''
})

const formData = ref(defaultFormData())

const rules = {
  id: [{ required: true, message: '请输入模型 ID', trigger: 'blur' }],
  name: [{ required: true, message: '请输入显示名称', trigger: 'blur' }],
  tier: [{ required: true, message: '请选择模型等级', trigger: 'change' }]
}

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
    opus: '🚀 Opus',
    sonnet: '⚡ Sonnet',
    haiku: '💨 Haiku'
  }
  return labels[tier] || tier
}

onMounted(async () => {
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
    title: '确认删除',
    content: '确定要删除此模型吗？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteModel(selectedProfileId.value, modelId)
        message.success('模型已删除')
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()

    if (isEdit.value) {
      await updateModel(selectedProfileId.value, formData.value.id, formData.value)
      message.success('模型已更新')
    } else {
      await addModel(selectedProfileId.value, formData.value)
      message.success('模型已添加')
    }

    showModal.value = false
  } catch (errors) {
    console.log('Validation failed:', errors)
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
  border-bottom: 2px solid #f0f0f0;
  background: white;
  margin: -24px -24px 24px -24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #2c2825;
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
  color: #2c2825;
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
