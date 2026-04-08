<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('notebook.createTitle')"
    style="width: 480px;"
    @update:show="$emit('update:show', $event)"
  >
    <!-- 笔记本名称 -->
    <div class="form-section">
      <div class="section-label">{{ t('notebook.name') }}</div>
      <n-input
        v-model:value="notebookName"
        :placeholder="t('notebook.namePlaceholder')"
        autofocus
        @keyup.enter="handleCreate"
      />
    </div>

    <!-- 存储目录 -->
    <div class="form-section">
      <div class="section-label">{{ t('notebook.storageDir') }}</div>
      <div class="dir-input-row">
        <n-input
          :value="displayDir"
          :placeholder="defaultBaseDir"
          readonly
          @click="browseBaseDir"
        />
        <n-button quaternary @click="browseBaseDir" :title="t('agent.browseFolder')">
          <Icon name="folder" :size="16" />
        </n-button>
        <n-button
          v-if="customBaseDir"
          quaternary
          @click="customBaseDir = null"
          :title="t('common.clear')"
        >
          <Icon name="close" :size="14" />
        </n-button>
      </div>
      <div class="dir-hint">
        {{ t('notebook.storageDirHint') }}：{{ finalDir }}
      </div>
    </div>

    <!-- API 配置选择 -->
    <div class="form-section" v-if="apiProfiles.length > 0">
      <div class="section-label">{{ t('agent.apiProfile') }}</div>
      <n-select
        v-model:value="selectedProfileId"
        :options="profileOptions"
        size="small"
      />
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :disabled="!notebookName.trim()" @click="handleCreate">{{ t('agent.create') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NInput, NButton, NSelect, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['update:show', 'created'])

const notebookName = ref('')
const customBaseDir = ref(null)
const defaultBaseDir = ref('')
const apiProfiles = ref([])
const selectedProfileId = ref(null)

// 每次打开时重置
watch(() => props.show, async (newVal) => {
  if (!newVal) return
  notebookName.value = ''
  customBaseDir.value = null
  selectedProfileId.value = null

  // 加载配置
  if (window.electronAPI?.getConfig) {
    try {
      const config = await window.electronAPI.getConfig()
      // 取 notebook.baseDir（可能为空）
      defaultBaseDir.value = config.settings?.notebook?.baseDir || ''
      // 加载 API profiles
      apiProfiles.value = config.apiProfiles || []
      const defaultProfile = apiProfiles.value.find(p => p.isDefault) || apiProfiles.value[0]
      selectedProfileId.value = defaultProfile?.id || null
    } catch {
      apiProfiles.value = []
    }
  }
})

const displayDir = computed(() => customBaseDir.value || defaultBaseDir.value || '')

const safeName = computed(() =>
  notebookName.value.replace(/[\\/:*?"<>|]/g, '-').trim() || '...'
)

const finalDir = computed(() => {
  const base = displayDir.value || '~/cc-desktop-notebooks'
  return `${base}/${safeName.value}`
})

const profileOptions = computed(() =>
  apiProfiles.value.map(p => ({
    label: `${p.icon || '🔵'} ${p.name}`,
    value: p.id,
    description: p.baseUrl
  }))
)

const browseBaseDir = async () => {
  if (!window.electronAPI) return
  const folderPath = await window.electronAPI.selectFolder()
  if (folderPath) customBaseDir.value = folderPath
}

const handleCreate = async () => {
  const name = notebookName.value.trim()
  if (!name) { message.warning(t('notebook.nameRequired')); return }

  try {
    const nb = await window.electronAPI.notebookCreate({
      name,
      basePath: customBaseDir.value || null,
      apiProfileId: selectedProfileId.value || null
    })
    emit('created', nb)
    emit('update:show', false)
  } catch (err) {
    message.error(t('notebook.createFailed') + '：' + err.message)
  }
}
</script>

<style scoped>
.form-section {
  margin-bottom: 16px;
}

.section-label {
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 8px;
  color: var(--text-color);
}

.dir-input-row {
  display: flex;
  gap: 4px;
  align-items: center;
}

.dir-input-row .n-input {
  flex: 1;
  cursor: pointer;
}

.dir-hint {
  margin-top: 6px;
  font-size: 11px;
  color: var(--text-color-muted);
  word-break: break-all;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
