<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('notebook.toolConfig.title', { id: editingTool?.id || '' })"
    style="width: 650px;"
    :mask-closable="false"
    @update:show="close"
  >
    <template #header-extra>
      <div class="header-extra-box">
        <div class="tool-icon-preview" :style="{ background: editingTool?.bgColor, color: editingTool?.color }">
          <Icon :name="editingTool?.icon || 'settings'" :size="18" />
        </div>
        <n-tag v-if="editingTool?.beta" size="small" type="warning" :bordered="false">BETA</n-tag>
      </div>
    </template>

    <div class="modal-scroll-content" v-if="editingTool">
      <n-form label-placement="left" label-width="100" label-align="right">
        <!-- 1. 基础定义 -->
        <n-divider title-placement="left">
          <div class="divider-title"><Icon name="settings" :size="14" /> {{ t('notebook.toolConfig.sectionVisual') }}</div>
        </n-divider>

        <n-form-item :label="t('notebook.toolConfig.displayName')">
          <n-input v-model:value="editingTool.name" :placeholder="t('notebook.toolConfig.displayNamePlaceholder')" />
        </n-form-item>

        <n-form-item :label="t('notebook.toolConfig.description')">
          <n-input v-model:value="editingTool.description" :placeholder="t('notebook.toolConfig.descriptionPlaceholder')" />
        </n-form-item>

        <div class="form-row">
          <n-form-item :label="t('notebook.toolConfig.bgColor')" class="flex-1">
            <n-color-picker v-model:value="editingTool.bgColor" :show-alpha="false" />
          </n-form-item>
          <n-form-item :label="t('notebook.toolConfig.iconColor')" class="flex-1">
            <n-color-picker v-model:value="editingTool.color" :show-alpha="false" />
          </n-form-item>
        </div>

        <div class="form-row">
          <n-form-item :label="t('notebook.toolConfig.outputType')" class="flex-1">
            <n-select
              v-model:value="editingTool.outputType"
              :options="outputTypeOptions"
              disabled
            />
          </n-form-item>
          <n-form-item :label="t('notebook.toolConfig.iconId')" class="flex-1">
            <n-input v-model:value="editingTool.icon" readonly placeholder="Icon name" />
          </n-form-item>
        </div>

        <!-- 2. 执行逻辑 -->
        <n-divider title-placement="left">
          <div class="divider-title"><Icon name="fileText" :size="14" /> {{ t('notebook.toolConfig.sectionPrompt') }}</div>
        </n-divider>

        <div class="prompt-link-row">
          <n-input v-model:value="editingTool.promptTemplateId" readonly placeholder="ID" />
          <n-button ghost type="primary" @click="openPromptEditor">
            <template #icon><Icon name="edit" :size="14" /></template>
            {{ t('notebook.toolConfig.editContent') }}
          </n-button>
        </div>

        <!-- 3. 安装依赖 -->
        <n-divider title-placement="left">
          <div class="divider-title">
            <Icon name="download" :size="14" /> {{ t('notebook.toolConfig.sectionDeps') }}
            <span class="sub-label">{{ t('notebook.toolConfig.marketDefined') }}</span>
          </div>
        </n-divider>

        <div class="dep-container">
          <div v-if="!editingTool.installDependencies?.length" class="empty-placeholder">{{ t('notebook.toolConfig.noDeps') }}</div>
          <div v-for="(dep, index) in editingTool.installDependencies" :key="'inst-'+index" class="dep-item-card">
            <div class="dep-main">
              <n-tag :bordered="false" size="small" type="info" class="type-badge">{{ dep.type.toUpperCase() }}:</n-tag>
              <span class="id-text">{{ dep.id }}</span>
              <div class="status-box">
                <n-tag v-if="statusMap[dep.id] === 'installed'" size="small" type="success" :bordered="false">{{ t('notebook.toolConfig.installed') }}</n-tag>
                <n-button v-else-if="dep.id" size="tiny" type="primary" secondary @click="goToMarket(dep)">{{ t('notebook.toolConfig.download') }}</n-button>
              </div>
            </div>
            <div v-if="dep.type === 'plugin' && dep.marketplaceSource" class="dep-sub">
              <span class="sub-label">{{ t('notebook.toolConfig.marketSource') }}:</span>
              <span class="sub-value">{{ dep.marketplaceSource }}</span>
            </div>
          </div>
        </div>

        <!-- 4. 运行映射 -->
        <n-divider title-placement="left">
          <div class="divider-title">
            <Icon name="play" :size="14" /> {{ t('notebook.toolConfig.sectionRuntime') }}
            <span class="sub-label">{{ t('notebook.toolConfig.marketDefined') }}</span>
          </div>
        </n-divider>

        <div class="mapping-container">
          <div v-if="!Object.keys(editingTool.runtimePlaceholders || {}).length" class="empty-placeholder">{{ t('notebook.toolConfig.noMappings') }}</div>
          <div v-for="(val, key) in editingTool.runtimePlaceholders" :key="'rt-'+key" class="mapping-item">
            <n-tag :bordered="false" size="small" class="key-tag">{{ key }}:</n-tag>
            <n-input size="small" :value="editingTool.runtimePlaceholders[key]" readonly class="flex-1" />
          </div>
        </div>
      </n-form>
    </div>

    <template #footer>
      <div class="modal-footer-box">
        <div class="footer-left-info">
          <Icon name="info" :size="12" />
          <span>{{ t('notebook.toolConfig.footerHint') }}</span>
        </div>
        <div class="btn-group">
          <n-button @click="close">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="saving" @click="save">{{ t('notebook.toolConfig.save') }}</n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { useMessage } from 'naive-ui'
import Icon from '@components/icons/Icon.vue'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()

const props = defineProps({
  show: { type: Boolean, default: false },
  tool: { type: Object, default: null }
})

const emit = defineEmits(['update:show', 'save', 'open-prompt-editor'])
const message = useMessage()

const editingTool = ref(null)
const saving = ref(false)
const statusMap = ref({})

const outputTypeOptions = [
  'markdown', 'pdf', 'document', 'image', 'video', 'code', 'text'
].map(v => ({ label: t(`notebook.toolConfig.outputTypes.${v}`), value: v }))

const checkStatuses = async () => {
  if (!editingTool.value?.installDependencies?.length) return
  if (!window.electronAPI?.checkComponentsBatchStatus) return
  try {
    const deps = editingTool.value.installDependencies
      .filter(d => d.id?.trim())
      .map(d => ({ type: d.type, id: d.id.trim() }))
    if (deps.length) {
      statusMap.value = await window.electronAPI.checkComponentsBatchStatus(deps) || {}
    }
  } catch (err) { console.error('Status check failed:', err) }
}

watch(() => props.show, async (val) => {
  if (val && props.tool) {
    editingTool.value = JSON.parse(JSON.stringify(props.tool))
    if (!editingTool.value.installDependencies) editingTool.value.installDependencies = []
    if (!editingTool.value.runtimePlaceholders) editingTool.value.runtimePlaceholders = {}
    await checkStatuses()
  } else {
    editingTool.value = null; statusMap.value = {}
  }
})

const close = () => { if (!saving.value) emit('update:show', false) }

const save = async () => {
  if (saving.value || !editingTool.value) return
  saving.value = true
  try {
    await emit('save', editingTool.value)
  } finally {
    setTimeout(() => { saving.value = false }, 300)
  }
}

const goToMarket = (dep) => { message.info(t('notebook.toolConfig.goToMarket', { id: dep.id })) }
const openPromptEditor = () => {
  emit('open-prompt-editor', {
    promptTemplateId: editingTool.value.promptTemplateId,
    runtimePlaceholders: editingTool.value.runtimePlaceholders
  })
}
</script>

<style scoped>
.header-extra-box { display: flex; align-items: center; gap: 12px; }
.tool-icon-preview { width: 28px; height: 28px; border-radius: 6px; display: flex; align-items: center; justify-content: center; }

.modal-scroll-content { max-height: 65vh; overflow-y: auto; padding-right: 12px; }

.divider-title { display: flex; align-items: center; gap: 8px; font-weight: 700; color: var(--text-color); font-size: 13px; }
.sub-label { font-size: 11px; font-weight: normal; color: var(--text-color-muted); margin-left: 8px; }

.form-row { display: flex; gap: 16px; }
.flex-1 { flex: 1; }

.prompt-link-row { display: flex; gap: 10px; width: 100%; }
.prompt-link-row :deep(.n-input) { flex: 1; }

.dep-container, .mapping-container { display: flex; flex-direction: column; gap: 8px; }
.empty-placeholder { padding: 12px; text-align: center; border: 1px dashed var(--border-color); border-radius: 8px; font-size: 12px; color: var(--text-color-muted); }

.dep-item-card { background: var(--bg-color-tertiary); padding: 10px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; flex-direction: column; gap: 6px; }
.dep-main { display: flex; align-items: center; gap: 10px; }
.type-badge { min-width: 55px; justify-content: center; }
.id-text { flex: 1; font-size: 13px; }
.status-box { width: 60px; display: flex; justify-content: center; }
.dep-sub { border-top: 1px dashed var(--border-color); padding-top: 6px; font-size: 11px; display: flex; gap: 8px; }
.dep-sub .sub-value { font-family: monospace; color: var(--primary-color); }

.mapping-item { background: var(--bg-color-tertiary); padding: 6px 10px; border-radius: 8px; border: 1px solid var(--border-color); display: flex; align-items: center; gap: 10px; }
.key-tag { color: var(--text-color); min-width: 80px; justify-content: center; }

/* 只读/禁用组件不响应 hover */
:deep(.n-input--readonly .n-input__border),
:deep(.n-input--readonly .n-input__state-border),
:deep(.n-input--disabled .n-input__border),
:deep(.n-input--disabled .n-input__state-border),
:deep(.n-base-selection--disabled .n-base-selection__border),
:deep(.n-base-selection--disabled .n-base-selection__state-border) {
  border-color: var(--border-color) !important;
  box-shadow: none !important;
}
:deep(.n-input--readonly),
:deep(.n-input--disabled),
:deep(.n-base-selection--disabled) {
  cursor: default;
}

.modal-footer-box { display: flex; justify-content: space-between; align-items: center; width: 100%; }
.btn-group { display: flex; gap: 12px; }
</style>
