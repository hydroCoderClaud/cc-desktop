<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    preset="card"
    :title="isEdit ? '编辑 API 配置' : '添加 API 配置'"
    style="width: 800px; max-width: 95vw;"
    :mask-closable="false"
  >
    <template #header-extra>
      <n-space>
        <n-button type="primary" @click="handleSave">保存</n-button>
        <n-button @click="handleTest">测试连接</n-button>
      </n-space>
    </template>

    <n-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-placement="top"
    >
      <!-- Row 1: Name & Icon -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item label="配置名称" path="name">
            <n-input v-model:value="formData.name" placeholder="例如：Anthropic 官方" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="图标">
            <div class="icon-picker">
              <div
                v-for="icon in availableIcons"
                :key="icon"
                class="icon-option"
                :class="{ selected: formData.icon === icon }"
                @click="formData.icon = icon"
              >
                {{ icon }}
              </div>
            </div>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Row 2: Service Provider & Auth Type -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item label="服务商" path="serviceProvider">
            <n-select
              v-model:value="formData.serviceProvider"
              :options="providerOptions"
              @update:value="onServiceProviderChange"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="认证方式">
            <n-radio-group v-model:value="formData.authType">
              <n-space>
                <n-radio value="api_key">API Key</n-radio>
                <n-radio value="auth_token">Auth Token</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Row 3: Auth Token -->
      <n-form-item label="认证令牌" path="authToken">
        <n-input
          v-model:value="formData.authToken"
          :type="showPassword ? 'text' : 'password'"
          placeholder="sk-ant-api03-..."
        >
          <template #suffix>
            <n-button text @click="showPassword = !showPassword">
              {{ showPassword ? '🙈' : '👁️' }}
            </n-button>
          </template>
        </n-input>
      </n-form-item>

      <!-- Row 4: Base URL & Model Tier -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item label="API 基础 URL">
            <n-input v-model:value="formData.baseUrl" placeholder="https://api.anthropic.com" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label="默认模型">
            <n-radio-group v-model:value="formData.selectedModelTier">
              <n-space>
                <n-radio value="opus">🚀 Opus</n-radio>
                <n-radio value="sonnet">⚡ Sonnet</n-radio>
                <n-radio value="haiku">💨 Haiku</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Model Mapping Section (for third-party services) -->
      <div v-if="needsModelMapping" class="model-mapping-section">
        <n-divider>模型映射配置</n-divider>
        <p class="mapping-hint">
          配置各等级模型对应的实际模型名称<br/>
          💡 留空时使用第三方服务内置映射（自动更新）
        </p>
        <n-grid :cols="3" :x-gap="16">
          <n-grid-item>
            <n-form-item label="🚀 Opus">
              <n-input v-model:value="formData.modelMapping.opus" placeholder="如: claude-3-opus" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="⚡ Sonnet">
              <n-input v-model:value="formData.modelMapping.sonnet" placeholder="如: claude-3-sonnet" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="💨 Haiku">
              <n-input v-model:value="formData.modelMapping.haiku" placeholder="如: claude-3-haiku" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- Row 5: Timeout & Disable Traffic -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item label="请求超时（秒）">
            <n-input-number
              v-model:value="formData.requestTimeout"
              :min="10"
              :max="3600"
              style="width: 150px"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label=" ">
            <n-space align="center" style="height: 40px;">
              <n-switch v-model:value="formData.disableNonessentialTraffic" />
              <span>禁用非必要流量</span>
            </n-space>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Proxy Settings -->
      <n-form-item label=" ">
        <n-space align="center">
          <n-switch v-model:value="formData.useProxy" />
          <span>启用代理</span>
        </n-space>
      </n-form-item>

      <div v-if="formData.useProxy" class="proxy-fields">
        <n-grid :cols="2" :x-gap="24">
          <n-grid-item>
            <n-form-item label="HTTPS 代理">
              <n-input v-model:value="formData.httpsProxy" placeholder="http://127.0.0.1:7890" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="HTTP 代理">
              <n-input v-model:value="formData.httpProxy" placeholder="http://127.0.0.1:7890" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- Description -->
      <n-form-item label="配置描述">
        <n-input v-model:value="formData.description" placeholder="例如：公司项目专用配置" />
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'

const props = defineProps({
  show: Boolean,
  profile: Object,
  isEdit: Boolean,
  providers: Array
})

const emit = defineEmits(['update:show', 'save', 'test'])

const formRef = ref(null)
const showPassword = ref(false)

const availableIcons = ['🟣', '🔵', '🟢', '🟠', '🟡', '🔴', '⚪', '⚫']

const defaultFormData = () => ({
  name: '',
  icon: '🟣',
  serviceProvider: 'official',
  authType: 'api_key',
  authToken: '',
  baseUrl: 'https://api.anthropic.com',
  selectedModelTier: 'sonnet',
  modelMapping: { opus: '', sonnet: '', haiku: '' },
  requestTimeout: 120,
  disableNonessentialTraffic: true,
  useProxy: false,
  httpsProxy: '',
  httpProxy: '',
  description: ''
})

const formData = ref(defaultFormData())

const rules = {
  name: [{ required: true, message: '请输入配置名称', trigger: 'blur' }],
  serviceProvider: [{ required: true, message: '请选择服务商', trigger: 'change' }],
  authToken: [{ required: true, message: '请输入认证令牌', trigger: 'blur' }]
}

const providerOptions = computed(() => {
  if (!props.providers || props.providers.length === 0) {
    return [
      { label: '官方 API', value: 'official' },
      { label: '中转服务', value: 'proxy' },
      { label: '其他第三方', value: 'other' }
    ]
  }
  return props.providers.map(p => ({
    label: p.name || p.label,
    value: p.id
  }))
})

const needsModelMapping = computed(() => {
  const sp = formData.value.serviceProvider
  return sp !== 'official' && sp !== 'proxy'
})

// Watch for profile changes to populate form
watch(() => props.profile, (newProfile) => {
  if (newProfile) {
    formData.value = {
      ...defaultFormData(),
      ...newProfile,
      modelMapping: {
        opus: newProfile.modelMapping?.opus || '',
        sonnet: newProfile.modelMapping?.sonnet || '',
        haiku: newProfile.modelMapping?.haiku || ''
      },
      requestTimeout: (newProfile.requestTimeout || 120000) / 1000
    }
  } else {
    formData.value = defaultFormData()
  }
}, { immediate: true })

// Watch for proxy toggle to auto-fill defaults
watch(() => formData.value.useProxy, (useProxy) => {
  if (useProxy) {
    if (!formData.value.httpsProxy) {
      formData.value.httpsProxy = 'http://127.0.0.1:7890'
    }
    if (!formData.value.httpProxy) {
      formData.value.httpProxy = 'http://127.0.0.1:7890'
    }
  }
})

const onServiceProviderChange = (value) => {
  // Find provider details
  const provider = props.providers?.find(p => p.id === value)
  if (provider) {
    // Auto-fill base URL if provider has one
    if (provider.baseUrl) {
      formData.value.baseUrl = provider.baseUrl
    }
    // Auto-fill model mapping if provider has default mapping
    if (provider.defaultModelMapping) {
      formData.value.modelMapping = {
        opus: provider.defaultModelMapping.opus || '',
        sonnet: provider.defaultModelMapping.sonnet || '',
        haiku: provider.defaultModelMapping.haiku || ''
      }
    }
  }
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()

    // Prepare data for saving
    const data = {
      ...formData.value,
      requestTimeout: formData.value.requestTimeout * 1000,
      modelMapping: needsModelMapping.value ? formData.value.modelMapping : null
    }

    // Clean up empty model mapping
    if (data.modelMapping) {
      const hasMapping = Object.values(data.modelMapping).some(v => v)
      if (!hasMapping) {
        data.modelMapping = null
      }
    }

    emit('save', data)
  } catch (errors) {
    console.log('Validation failed:', errors)
  }
}

const handleTest = () => {
  // Prepare config for testing
  const config = {
    baseUrl: formData.value.baseUrl,
    authToken: formData.value.authToken,
    authType: formData.value.authType,
    serviceProvider: formData.value.serviceProvider,
    selectedModelTier: formData.value.selectedModelTier,
    modelMapping: formData.value.modelMapping,
    useProxy: formData.value.useProxy,
    httpsProxy: formData.value.httpsProxy,
    httpProxy: formData.value.httpProxy
  }
  emit('test', config)
}
</script>

<style scoped>
.icon-picker {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.icon-option {
  width: 36px;
  height: 36px;
  border: 2px solid #e5e5e0;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-option:hover {
  border-color: #FF6B35;
  background: #fff8f7;
}

.icon-option.selected {
  border-color: #FF6B35;
  background: #FF6B35;
}

.model-mapping-section {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.mapping-hint {
  font-size: 12px;
  color: #888;
  margin-bottom: 12px;
  line-height: 1.5;
}

.proxy-fields {
  background: #f8f9fa;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}
</style>
