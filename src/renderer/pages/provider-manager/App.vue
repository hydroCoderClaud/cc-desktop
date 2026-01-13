<template>
  <n-config-provider :theme-overrides="claudeTheme">
    <n-message-provider>
      <n-dialog-provider>
        <div class="provider-manager">
          <!-- Header -->
          <div class="header">
            <h1>服务商管理</h1>
            <n-space>
              <n-button type="primary" @click="handleAdd">
                添加服务商
              </n-button>
              <n-button @click="handleClose">关闭</n-button>
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

              <n-empty v-if="!loading && providers.length === 0" description="暂无服务商定义" />
            </div>
          </n-spin>

          <!-- Add/Edit Modal -->
          <n-modal
            v-model:show="showModal"
            preset="card"
            :title="isEdit ? '编辑服务商' : '添加服务商'"
            style="width: 600px; max-width: 95vw;"
            :mask-closable="false"
          >
            <n-form
              ref="formRef"
              :model="formData"
              :rules="rules"
              label-placement="top"
            >
              <n-form-item label="服务商 ID" path="id">
                <n-input
                  v-model:value="formData.id"
                  placeholder="例如: openai"
                  :disabled="isEdit"
                />
                <template #feedback>
                  仅支持小写字母、数字和下划线
                </template>
              </n-form-item>

              <n-form-item label="服务商名称" path="name">
                <n-input v-model:value="formData.name" placeholder="例如: OpenAI" />
              </n-form-item>

              <n-form-item label="API 地址">
                <n-input v-model:value="formData.baseUrl" placeholder="例如: https://api.openai.com" />
                <template #feedback>
                  留空表示需要用户手动输入
                </template>
              </n-form-item>

              <n-form-item label=" ">
                <n-space align="center">
                  <n-switch v-model:value="formData.needsMapping" />
                  <span>需要模型映射</span>
                </n-space>
              </n-form-item>

              <div v-if="formData.needsMapping" class="model-mapping-section">
                <n-divider>默认模型映射</n-divider>
                <n-grid :cols="1" :y-gap="12">
                  <n-grid-item>
                    <n-form-item label="🚀 Opus">
                      <n-input v-model:value="formData.defaultModelMapping.opus" placeholder="例如: gpt-4-turbo" />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item label="⚡ Sonnet">
                      <n-input v-model:value="formData.defaultModelMapping.sonnet" placeholder="例如: gpt-4" />
                    </n-form-item>
                  </n-grid-item>
                  <n-grid-item>
                    <n-form-item label="💨 Haiku">
                      <n-input v-model:value="formData.defaultModelMapping.haiku" placeholder="例如: gpt-3.5-turbo" />
                    </n-form-item>
                  </n-grid-item>
                </n-grid>
                <p class="help-text">这些默认值可在创建 API 配置时覆盖</p>
              </div>
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
import { ref, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { claudeTheme } from '@theme/claude-theme'
import { useProviders } from '@composables/useProviders'
import ProviderCard from '@components/ProviderCard.vue'

const message = useMessage()
const dialog = useDialog()

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

const rules = {
  id: [
    { required: true, message: '请输入服务商 ID', trigger: 'blur' },
    { pattern: /^[a-z0-9_]+$/, message: '仅支持小写字母、数字和下划线', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入服务商名称', trigger: 'blur' }
  ]
}

onMounted(async () => {
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
    message.warning('内置服务商无法编辑')
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
    message.warning('内置服务商无法删除')
    return
  }

  dialog.warning({
    title: '确认删除',
    content: `确定要删除服务商 "${provider?.name}" 吗？此操作无法撤销。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteProvider(providerId)
        message.success('服务商已删除')
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()

    // Prepare data
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
      message.success('服务商已更新')
    } else {
      await addProvider(data)
      message.success('服务商已添加')
    }

    showModal.value = false
  } catch (errors) {
    console.log('Validation failed:', errors)
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

.provider-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 200px;
}

.model-mapping-section {
  background: #f8f9fa;
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
