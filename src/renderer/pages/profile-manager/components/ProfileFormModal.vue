<template>
  <n-modal
    :show="show"
    @update:show="$emit('update:show', $event)"
    preset="card"
    :title="isEdit ? t('profileManager.editProfile') : t('profileManager.addProfile')"
    style="width: 800px; max-width: 95vw;"
    :mask-closable="false"
  >
    <template #header-extra>
      <n-space>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        <n-button @click="handleTest">{{ t('common.testConnection') }}</n-button>
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
          <n-form-item :label="t('profileManager.profileName')" path="name">
            <n-input v-model:value="formData.name" placeholder="e.g., Anthropic Official" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('profileManager.profileIcon')">
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
          <n-form-item :label="t('profileManager.serviceProvider')" path="serviceProvider">
            <n-select
              v-model:value="formData.serviceProvider"
              :options="providerOptions"
              @update:value="onServiceProviderChange"
            />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label=" ">
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
      <n-form-item :label="t('profileManager.apiKey')" path="authToken">
        <n-input
          v-model:value="formData.authToken"
          :type="showPassword ? 'text' : 'password'"
          :placeholder="t('profileManager.apiKeyPlaceholder')"
        >
          <template #suffix>
            <n-space :size="4">
              <n-button text @click="copyApiKey" :title="t('common.copy')">
                <Icon name="copy" :size="14" />
              </n-button>
              <n-button text @click="showPassword = !showPassword">
                <Icon :name="showPassword ? 'eyeOff' : 'eye'" :size="14" />
              </n-button>
            </n-space>
          </template>
        </n-input>
      </n-form-item>

      <!-- Row 4: Base URL & Model Tier -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('profileManager.baseUrl')">
            <n-input v-model:value="formData.baseUrl" :placeholder="t('profileManager.baseUrlPlaceholder')" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label=" ">
            <n-radio-group v-model:value="formData.selectedModelTier">
              <n-space>
                <n-radio value="opus"><Icon name="rocket" :size="14" class="model-tier-icon" /> Opus</n-radio>
                <n-radio value="sonnet"><Icon name="zap" :size="14" class="model-tier-icon" /> Sonnet</n-radio>
                <n-radio value="haiku"><Icon name="wind" :size="14" class="model-tier-icon" /> Haiku</n-radio>
              </n-space>
            </n-radio-group>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Model Mapping Section (for third-party services) -->
      <div v-if="needsModelMapping" class="model-mapping-section">
        <n-divider>{{ t('profileManager.modelMapping') }}</n-divider>
        <p class="mapping-hint">{{ t('profileManager.modelMappingHint') }}</p>
        <n-grid :cols="3" :x-gap="16">
          <n-grid-item>
            <n-form-item>
              <template #label>
                <span class="model-mapping-label"><Icon name="rocket" :size="14" /> {{ t('profileManager.opusModel') }}</span>
              </template>
              <n-input v-model:value="formData.modelMapping.opus" placeholder="e.g., claude-3-opus" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item>
              <template #label>
                <span class="model-mapping-label"><Icon name="zap" :size="14" /> {{ t('profileManager.sonnetModel') }}</span>
              </template>
              <n-input v-model:value="formData.modelMapping.sonnet" placeholder="e.g., claude-3-sonnet" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item>
              <template #label>
                <span class="model-mapping-label"><Icon name="wind" :size="14" /> {{ t('profileManager.haikuModel') }}</span>
              </template>
              <n-input v-model:value="formData.modelMapping.haiku" placeholder="e.g., claude-3-haiku" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- Row 5: Timeout & Disable Traffic -->
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('globalSettings.requestTimeout')">
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
              <span>{{ t('common.disabled') }} traffic</span>
            </n-space>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <!-- Proxy Settings -->
      <n-form-item label=" ">
        <n-space align="center">
          <n-switch v-model:value="formData.useProxy" />
          <span>{{ t('common.enabled') }} Proxy</span>
        </n-space>
      </n-form-item>

      <div v-if="formData.useProxy" class="proxy-fields">
        <n-grid :cols="2" :x-gap="24">
          <n-grid-item>
            <n-form-item label="HTTPS Proxy">
              <n-input v-model:value="formData.httpsProxy" placeholder="http://127.0.0.1:7890" />
            </n-form-item>
          </n-grid-item>
          <n-grid-item>
            <n-form-item label="HTTP Proxy">
              <n-input v-model:value="formData.httpProxy" placeholder="http://127.0.0.1:7890" />
            </n-form-item>
          </n-grid-item>
        </n-grid>
      </div>

      <!-- Description -->
      <n-form-item :label="t('common.description')">
        <n-input v-model:value="formData.description" placeholder="" />
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  profile: Object,
  isEdit: Boolean,
  providers: Array
})

const emit = defineEmits(['update:show', 'save', 'test'])

const formRef = ref(null)
const showPassword = ref(false)

const copyApiKey = async () => {
  if (!formData.value.authToken) return
  try {
    await navigator.clipboard.writeText(formData.value.authToken)
    message.success(t('common.copied'))
  } catch (err) {
    message.error(t('common.copyFailed'))
  }
}

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

const rules = computed(() => ({
  name: [{ required: true, message: t('common.required'), trigger: 'blur' }],
  serviceProvider: [{ required: true, message: t('common.required'), trigger: 'change' }],
  authToken: [{ required: true, message: t('common.required'), trigger: 'blur' }]
}))

const providerOptions = computed(() => {
  if (!props.providers || props.providers.length === 0) {
    return [
      { label: 'Official API', value: 'official' },
      { label: 'Proxy Service', value: 'proxy' },
      { label: 'Other', value: 'other' }
    ]
  }
  return props.providers.map(p => ({
    label: p.name || p.label,
    value: p.id
  }))
})

const needsModelMapping = computed(() => {
  const sp = formData.value.serviceProvider
  // 从服务商定义中读取 needsMapping 属性
  const provider = props.providers?.find(p => p.id === sp)
  if (provider) {
    return provider.needsMapping === true
  }
  // 兜底：官方和代理不需要映射
  return sp !== 'official' && sp !== 'proxy'
})

// Watch for profile changes to populate form
watch(() => props.profile, (newProfile) => {
  if (newProfile) {
    // 获取服务商的默认模型映射
    const provider = props.providers?.find(p => p.id === newProfile.serviceProvider)
    const defaultMapping = provider?.defaultModelMapping || {}

    // 优先使用配置中的映射，否则使用服务商默认映射
    const modelMapping = {
      opus: newProfile.modelMapping?.opus || defaultMapping.opus || '',
      sonnet: newProfile.modelMapping?.sonnet || defaultMapping.sonnet || '',
      haiku: newProfile.modelMapping?.haiku || defaultMapping.haiku || ''
    }

    formData.value = {
      ...defaultFormData(),
      ...newProfile,
      modelMapping,
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
  const provider = props.providers?.find(p => p.id === value)
  if (provider) {
    if (provider.baseUrl) {
      formData.value.baseUrl = provider.baseUrl
    }
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

    const data = {
      name: formData.value.name,
      icon: formData.value.icon,
      serviceProvider: formData.value.serviceProvider,
      authType: formData.value.authType,
      authToken: formData.value.authToken,
      baseUrl: formData.value.baseUrl,
      selectedModelTier: formData.value.selectedModelTier,
      requestTimeout: formData.value.requestTimeout * 1000,
      disableNonessentialTraffic: formData.value.disableNonessentialTraffic,
      useProxy: formData.value.useProxy,
      httpsProxy: formData.value.httpsProxy,
      httpProxy: formData.value.httpProxy,
      description: formData.value.description,
      modelMapping: needsModelMapping.value ? {
        opus: formData.value.modelMapping.opus || '',
        sonnet: formData.value.modelMapping.sonnet || '',
        haiku: formData.value.modelMapping.haiku || ''
      } : null
    }

    if (data.modelMapping) {
      const hasMapping = Object.values(data.modelMapping).some(v => v)
      if (!hasMapping) {
        data.modelMapping = null
      }
    }

    emit('save', data)
  } catch (errors) {
    console.warn('Validation failed:', errors)
  }
}

const handleTest = () => {
  const config = {
    baseUrl: formData.value.baseUrl,
    authToken: formData.value.authToken,
    authType: formData.value.authType,
    serviceProvider: formData.value.serviceProvider,
    selectedModelTier: formData.value.selectedModelTier,
    modelMapping: formData.value.modelMapping ? {
      opus: formData.value.modelMapping.opus || '',
      sonnet: formData.value.modelMapping.sonnet || '',
      haiku: formData.value.modelMapping.haiku || ''
    } : null,
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
  border: 2px solid var(--border-color, #e5e5e0);
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  cursor: pointer;
  transition: all 0.2s;
}

.icon-option:hover {
  border-color: var(--primary-color);
  background: var(--primary-ghost);
}

.icon-option.selected {
  border-color: var(--primary-color);
  background: var(--primary-color);
}

.model-mapping-section {
  background: var(--bg-color-tertiary, #f8f9fa);
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
  background: var(--bg-color-tertiary, #f8f9fa);
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.model-tier-icon {
  vertical-align: middle;
  margin-right: 2px;
}

.model-mapping-label {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
</style>
