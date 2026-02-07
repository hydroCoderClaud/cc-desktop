<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('rightPanel.settings.rawJsonEditor.title')"
    style="width: 600px; max-height: 80vh;"
    @update:show="$emit('update:show', $event)"
  >
    <!-- Scope 切换 -->
    <div class="scope-tabs">
      <button
        class="scope-tab"
        :class="{ active: activeScope === 'global' }"
        @click="switchScope('global')"
      >
        {{ t('rightPanel.settings.rawJsonEditor.global') }}
      </button>
      <button
        v-if="projectPath"
        class="scope-tab"
        :class="{ active: activeScope === 'project' }"
        @click="switchScope('project')"
      >
        {{ t('rightPanel.settings.rawJsonEditor.project') }}
      </button>
    </div>

    <!-- 警告 -->
    <div class="warning-bar">
      <Icon name="warning" :size="14" />
      <span>{{ t('rightPanel.settings.rawJsonEditor.warning') }}</span>
    </div>

    <!-- 文件路径 -->
    <div v-if="currentFilePath" class="file-path">{{ currentFilePath }}</div>

    <!-- JSON 编辑器 -->
    <div class="editor-wrapper">
      <textarea
        v-model="jsonContent"
        class="json-editor"
        spellcheck="false"
      />
    </div>

    <!-- 错误提示 -->
    <div v-if="jsonError" class="json-error">
      {{ jsonError }}
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="handleFormat">
          {{ t('rightPanel.settings.rawJsonEditor.format') }}
        </n-button>
        <div class="footer-right">
          <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" :loading="saving" :disabled="!!jsonError" @click="handleSave">
            {{ t('rightPanel.settings.rawJsonEditor.save') }}
          </n-button>
        </div>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NModal, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  scope: { type: String, default: 'global' },
  projectPath: String
})

const emit = defineEmits(['update:show', 'saved'])

const activeScope = ref('global')
const jsonContent = ref('')
const currentFilePath = ref('')
const saving = ref(false)

const jsonError = computed(() => {
  if (!jsonContent.value.trim()) return null
  try {
    JSON.parse(jsonContent.value)
    return null
  } catch (e) {
    return t('rightPanel.settings.rawJsonEditor.invalidJson') + ': ' + e.message
  }
})

watch(() => props.show, (val) => {
  if (val) {
    activeScope.value = props.scope
    loadContent()
  }
})

const loadContent = async () => {
  try {
    const result = await window.electronAPI.getClaudeSettingsRaw({
      scope: activeScope.value,
      projectPath: props.projectPath
    })
    if (result.success) {
      jsonContent.value = JSON.stringify(result.data, null, 2)
      currentFilePath.value = result.filePath || ''
    } else {
      jsonContent.value = '{}'
      currentFilePath.value = ''
    }
  } catch (err) {
    console.error('Failed to load raw settings:', err)
    jsonContent.value = '{}'
  }
}

const switchScope = (scope) => {
  if (scope === 'project' && !props.projectPath) {
    message.warning(t('rightPanel.settings.rawJsonEditor.noProject'))
    return
  }
  activeScope.value = scope
  loadContent()
}

const handleFormat = () => {
  try {
    const parsed = JSON.parse(jsonContent.value)
    jsonContent.value = JSON.stringify(parsed, null, 2)
  } catch (e) {
    // 格式无效时不操作
  }
}

const handleSave = async () => {
  if (jsonError.value) return

  saving.value = true
  try {
    const data = JSON.parse(jsonContent.value)
    const result = await window.electronAPI.saveClaudeSettingsRaw({
      scope: activeScope.value,
      projectPath: props.projectPath,
      data
    })

    if (result.success) {
      message.success(t('rightPanel.settings.rawJsonEditor.saveSuccess'))
      emit('update:show', false)
      emit('saved')
    } else {
      message.error(result.error || t('rightPanel.settings.rawJsonEditor.saveFailed'))
    }
  } catch (err) {
    console.error('Failed to save raw settings:', err)
    message.error(t('rightPanel.settings.rawJsonEditor.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.scope-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}

.scope-tab {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background: transparent;
  color: var(--text-color);
  cursor: pointer;
  font-size: 12px;
  transition: all 0.15s ease;
}

.scope-tab:hover {
  border-color: var(--primary-color);
}

.scope-tab.active {
  background: var(--primary-color);
  color: white;
  border-color: var(--primary-color);
}

.warning-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(250, 173, 20, 0.1);
  border: 1px solid rgba(250, 173, 20, 0.3);
  border-radius: 4px;
  font-size: 12px;
  color: #faad14;
  margin-bottom: 8px;
}

.file-path {
  font-size: 11px;
  color: var(--text-color-muted);
  font-family: var(--font-mono);
  margin-bottom: 8px;
  word-break: break-all;
}

.editor-wrapper {
  border: 1px solid var(--border-color);
  border-radius: 6px;
  overflow: hidden;
}

.json-editor {
  width: 100%;
  min-height: 300px;
  max-height: 400px;
  padding: 12px;
  border: none;
  outline: none;
  resize: vertical;
  font-family: var(--font-mono);
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-color);
  background: var(--bg-color-tertiary);
  tab-size: 2;
}

.json-error {
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(255, 77, 79, 0.1);
  border: 1px solid rgba(255, 77, 79, 0.3);
  border-radius: 4px;
  font-size: 11px;
  color: #ff4d4f;
  word-break: break-all;
}

.modal-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.footer-right {
  display: flex;
  gap: 12px;
}
</style>
