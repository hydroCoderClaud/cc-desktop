<template>
  <n-modal
    class="profile-form-modal"
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
        <n-button :loading="testing" @click="handleTest">{{ t('common.testConnection') }}</n-button>
      </n-space>
    </template>

    <n-form ref="formRef" :model="formData" :rules="rules" label-placement="top">
      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('profileManager.profileName')" path="name">
            <n-input v-model:value="formData.name" placeholder="e.g., Qwen production" />
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

      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item :label="t('profileManager.baseUrl')">
            <n-input v-model:value="formData.baseUrl" :placeholder="t('profileManager.baseUrlPlaceholder')" />
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item :label="t('profileManager.selectedModelId')">
            <div class="model-selector">
              <n-select
                v-model:value="formData.selectedModelId"
                :options="modelOptions"
                filterable
                clearable
                :placeholder="modelSelectPlaceholder"
              />
              <div v-if="modelOptions.length === 0" class="model-empty-state">
                {{ t('profileManager.noModelIds') }}
              </div>
            </div>
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-form-item>
        <template #label>
          <div class="model-list-label">
            <span>{{ t('profileManager.defaultModelIds') }}</span>
            <n-button
              class="model-list-refresh"
              text
              :loading="fetchingModels"
              :disabled="!canFetchModels"
              :title="t('profileManager.fetchModelsTooltip')"
              :aria-label="t('profileManager.fetchModelsTooltip')"
              @click="handleFetchModels"
            >
              <Icon name="refresh" :size="16" />
            </n-button>
            <span class="model-list-hint">{{ t('profileManager.fetchModelsHint') }}</span>
          </div>
        </template>
        <n-input
          v-model:value="formData.defaultModelsText"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 8 }"
          :placeholder="t('profileManager.defaultModelIdsPlaceholder')"
        />
      </n-form-item>

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

      <n-grid :cols="2" :x-gap="24">
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
        <n-grid-item>
          <n-form-item :label="t('globalSettings.requestTimeout')">
            <n-input-number v-model:value="formData.requestTimeout" :min="10" :max="3600" style="width: 150px" />
          </n-form-item>
        </n-grid-item>
      </n-grid>

      <n-grid :cols="2" :x-gap="24">
        <n-grid-item>
          <n-form-item label=" ">
            <n-space align="center" style="height: 40px;">
              <n-switch v-model:value="formData.disableNonessentialTraffic" />
              <span>{{ t('common.disabled') }} traffic</span>
            </n-space>
          </n-form-item>
        </n-grid-item>
        <n-grid-item>
          <n-form-item label=" ">
            <n-space align="center" style="height: 40px;">
              <n-switch v-model:value="formData.useProxy" />
              <span>{{ t('common.enabled') }} Proxy</span>
            </n-space>
          </n-form-item>
        </n-grid-item>
      </n-grid>

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

      <n-form-item :label="t('common.description')">
        <n-input v-model:value="formData.description" />
      </n-form-item>
    </n-form>
  </n-modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  profile: Object,
  isEdit: Boolean,
  testing: Boolean,
  fetchModels: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['update:show', 'save', 'test'])

const formRef = ref(null)
const showPassword = ref(false)
const fetchingModels = ref(false)
const availableIcons = ['\uD83E\uDD16', '\uD83D\uDCBC', '\uD83E\uDDE0', '\uD83C\uDF10', '\uD83D\uDD25', '\uD83D\uDCA1', '\u2B50', '\uD83D\uDE80']

const defaultFormData = () => ({
  name: '',
  icon: '\uD83E\uDD16',
  authType: 'auth_token',
  authToken: '',
  baseUrl: '',
  defaultModelsText: '',
  selectedModelId: '',
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
  authToken: [{ required: true, message: t('common.required'), trigger: 'blur' }]
}))

const normalizeModelIds = (modelIds) => {
  const normalized = []
  const seen = new Set()

  for (const modelId of Array.isArray(modelIds) ? modelIds : []) {
    const value = typeof modelId === 'string' ? modelId.trim() : ''
    if (!value || seen.has(value)) continue
    seen.add(value)
    normalized.push(value)
  }

  return normalized
}

const splitModelIds = (value) => normalizeModelIds(String(value || '').split(/\r?\n/))

const resolveSelectedModelId = (modelIds, value) => {
  const normalizedModelIds = normalizeModelIds(modelIds)
  const selectedModelId = typeof value === 'string' ? value.trim() : ''

  if (normalizedModelIds.length === 0) {
    return ''
  }

  if (!selectedModelId || normalizedModelIds.includes(selectedModelId)) {
    return selectedModelId
  }

  return normalizedModelIds[0]
}

const syncSelectedModelId = () => {
  const modelIds = splitModelIds(formData.value.defaultModelsText)
  const selectedModelId = resolveSelectedModelId(modelIds, formData.value.selectedModelId)

  if (formData.value.selectedModelId !== selectedModelId) {
    formData.value.selectedModelId = selectedModelId
  }
}

const modelOptions = computed(() => splitModelIds(formData.value.defaultModelsText)
  .map(modelId => ({ label: modelId, value: modelId })))

const modelSelectPlaceholder = computed(() => (
  modelOptions.value.length > 0
    ? t('profileManager.selectedModelIdPlaceholder')
    : t('profileManager.noModelIds')
))

const canFetchModels = computed(() => Boolean(
  props.fetchModels
  && String(formData.value.baseUrl || '').trim()
  && String(formData.value.authToken || '').trim()
))

watch(() => props.profile, (profile) => {
  if (!profile) {
    formData.value = defaultFormData()
    return
  }

  const profileFields = { ...profile }
  delete profileFields.serviceProvider
  delete profileFields.providerName
  formData.value = {
    ...defaultFormData(),
    ...profileFields,
    defaultModelsText: normalizeModelIds(profile.defaultModels).join('\n'),
    selectedModelId: typeof profile.selectedModelId === 'string' ? profile.selectedModelId.trim() : '',
    requestTimeout: (profile.requestTimeout || 120000) / 1000
  }
  syncSelectedModelId()
}, { immediate: true })

watch(() => formData.value.defaultModelsText, syncSelectedModelId)

watch(() => formData.value.useProxy, (useProxy) => {
  if (!useProxy) return
  if (!formData.value.httpsProxy) formData.value.httpsProxy = 'http://127.0.0.1:7890'
  if (!formData.value.httpProxy) formData.value.httpProxy = 'http://127.0.0.1:7890'
})

const copyApiKey = async () => {
  if (!formData.value.authToken) return
  try {
    await navigator.clipboard.writeText(formData.value.authToken)
    message.success(t('common.copied'))
  } catch (err) {
    message.error(t('common.copyFailed'))
  }
}

const buildProfileData = () => {
  const defaultModels = splitModelIds(formData.value.defaultModelsText)

  return {
    name: formData.value.name.trim(),
    icon: formData.value.icon,
    authType: formData.value.authType,
    authToken: formData.value.authToken,
    baseUrl: formData.value.baseUrl.trim(),
    defaultModels,
    selectedModelId: resolveSelectedModelId(defaultModels, formData.value.selectedModelId),
    requestTimeout: formData.value.requestTimeout * 1000,
    disableNonessentialTraffic: formData.value.disableNonessentialTraffic,
    useProxy: formData.value.useProxy,
    httpsProxy: formData.value.httpsProxy,
    httpProxy: formData.value.httpProxy,
    description: formData.value.description
  }
}

const handleSave = async () => {
  try {
    await formRef.value?.validate()
    emit('save', buildProfileData())
  } catch (errors) {
    console.warn('Validation failed:', errors)
  }
}

const handleTest = () => emit('test', buildProfileData())

const handleFetchModels = async () => {
  if (!canFetchModels.value || fetchingModels.value) {
    message.warning(t('profileManager.fetchModelsConfigRequired'))
    return
  }

  fetchingModels.value = true
  try {
    const result = await props.fetchModels(buildProfileData())
    if (!result?.success) {
      const detail = result?.message ? `: ${result.message}` : ''
      message.error(t('profileManager.fetchModelsFailed') + detail)
      return
    }

    const modelIds = normalizeModelIds(result.models)
    if (modelIds.length === 0) {
      message.warning(t('profileManager.fetchModelsEmpty'))
      return
    }

    formData.value.defaultModelsText = modelIds.join('\n')
    message.success(t('profileManager.fetchModelsSuccess', { count: modelIds.length }))
  } catch (err) {
    message.error(t('profileManager.fetchModelsFailed') + ': ' + (err.message || String(err)))
  } finally {
    fetchingModels.value = false
  }
}
</script>

<style scoped>
.icon-picker { display: flex; gap: 8px; flex-wrap: wrap; }
.icon-option { width: 36px; height: 36px; border: 2px solid var(--border-color, #e5e5e0); border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 18px; cursor: pointer; transition: all 0.2s; }
.icon-option:hover { border-color: var(--primary-color); background: var(--primary-ghost); }
.icon-option.selected { border-color: var(--primary-color); background: var(--primary-color); }
.proxy-fields { background: var(--bg-color-tertiary); padding: 16px; border-radius: 8px; margin-bottom: 16px; }
.model-selector { display: flex; flex-direction: column; gap: 10px; }
.model-empty-state { font-size: 12px; opacity: 0.7; }
.model-list-label { display: inline-flex; align-items: center; gap: 4px; flex-wrap: wrap; }
.model-list-refresh { min-width: 24px; }
.model-list-hint { font-size: 12px; font-weight: 400; opacity: 0.7; }

@media (max-width: 600px) {
  :global(.profile-form-modal .n-card-header) { flex-wrap: wrap; row-gap: 8px; }
  :global(.profile-form-modal > .n-card-header .n-card-header__main) { flex: 1 1 100%; min-width: 0; }
  :global(.profile-form-modal .n-card-header__extra) { margin-left: auto; }
}
</style>
