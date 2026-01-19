<template>
  <div class="tab-container">
    <div class="tab-header">
      <span class="tab-title">{{ t('rightPanel.tabs.prompts') }}</span>
      <div class="tab-actions">
        <button class="icon-btn" :title="t('rightPanel.prompts.add')" @click="handleAdd">
          ➕
        </button>
      </div>
    </div>

    <div class="tab-toolbar">
      <n-input
        v-model:value="searchText"
        :placeholder="t('rightPanel.prompts.search')"
        size="small"
        clearable
      >
        <template #prefix>
          <span style="opacity: 0.5;">🔍</span>
        </template>
      </n-input>
    </div>

    <div class="tab-content">
      <!-- Empty State -->
      <div v-if="filteredPrompts.length === 0" class="empty-state">
        <div class="empty-icon">💬</div>
        <div class="empty-text">{{ t('rightPanel.prompts.empty') }}</div>
        <div class="empty-hint">{{ t('rightPanel.prompts.emptyHint') }}</div>
        <button class="add-btn" @click="handleAdd">
          {{ t('rightPanel.prompts.addFirst') }}
        </button>
      </div>

      <!-- Prompts List -->
      <div v-else class="prompts-list">
        <div
          v-for="prompt in filteredPrompts"
          :key="prompt.id"
          class="prompt-item"
        >
          <div class="prompt-main" @click="handleInsert(prompt)">
            <div class="prompt-name">{{ prompt.name }}</div>
            <div class="prompt-preview">{{ prompt.content }}</div>
          </div>
          <div class="prompt-actions">
            <button
              class="icon-btn small"
              :title="t('rightPanel.prompts.insert')"
              @click="handleInsert(prompt)"
            >
              ▶
            </button>
            <button
              class="icon-btn small"
              :title="t('common.edit')"
              @click="handleEdit(prompt)"
            >
              ✏️
            </button>
            <button
              class="icon-btn small"
              :title="t('common.delete')"
              @click="handleDelete(prompt)"
            >
              🗑️
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Modal -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="editingPrompt ? t('rightPanel.prompts.edit') : t('rightPanel.prompts.add')"
      style="width: 400px;"
      :mask-closable="false"
    >
      <n-form>
        <n-form-item :label="t('rightPanel.prompts.name')">
          <n-input
            v-model:value="formData.name"
            :placeholder="t('rightPanel.prompts.namePlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.prompts.content')">
          <n-input
            v-model:value="formData.content"
            type="textarea"
            :rows="5"
            :placeholder="t('rightPanel.prompts.contentPlaceholder')"
          />
        </n-form-item>
        <n-form-item :label="t('rightPanel.prompts.category')">
          <n-input
            v-model:value="formData.category"
            :placeholder="t('rightPanel.prompts.categoryPlaceholder')"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-footer">
          <n-button @click="showModal = false">{{ t('common.cancel') }}</n-button>
          <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { NInput, NModal, NForm, NFormItem, NButton, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  currentProject: Object
})

const emit = defineEmits(['send-command', 'insert-to-input'])

// State
const searchText = ref('')
const prompts = ref([])
const showModal = ref(false)
const editingPrompt = ref(null)
const formData = ref({
  name: '',
  content: '',
  category: ''
})

// Computed
const filteredPrompts = computed(() => {
  if (!searchText.value) return prompts.value
  const keyword = searchText.value.toLowerCase()
  return prompts.value.filter(p =>
    p.name.toLowerCase().includes(keyword) ||
    p.content.toLowerCase().includes(keyword)
  )
})

// Methods
const handleAdd = () => {
  editingPrompt.value = null
  formData.value = { name: '', content: '', category: '' }
  showModal.value = true
}

const handleEdit = (prompt) => {
  editingPrompt.value = prompt
  formData.value = { ...prompt }
  showModal.value = true
}

const handleDelete = async (prompt) => {
  if (!window.confirm(t('rightPanel.prompts.deleteConfirm', { name: prompt.name }))) {
    return
  }
  prompts.value = prompts.value.filter(p => p.id !== prompt.id)
  await savePrompts()
  message.success(t('common.deleted'))
}

const handleInsert = (prompt) => {
  emit('insert-to-input', prompt.content)
}

const handleSave = async () => {
  if (!formData.value.name.trim()) {
    message.warning(t('rightPanel.prompts.nameRequired'))
    return
  }
  if (!formData.value.content.trim()) {
    message.warning(t('rightPanel.prompts.contentRequired'))
    return
  }

  if (editingPrompt.value) {
    // Update existing
    const index = prompts.value.findIndex(p => p.id === editingPrompt.value.id)
    if (index !== -1) {
      prompts.value[index] = {
        ...prompts.value[index],
        ...formData.value,
        updatedAt: Date.now()
      }
    }
  } else {
    // Add new
    prompts.value.push({
      id: Date.now().toString(),
      ...formData.value,
      createdAt: Date.now(),
      updatedAt: Date.now()
    })
  }

  await savePrompts()
  showModal.value = false
  message.success(t('common.saved'))
}

const loadPrompts = async () => {
  try {
    // TODO: Load from config
    // const result = await window.electronAPI?.invoke('prompts:list')
    // prompts.value = result || []
    prompts.value = []
  } catch (err) {
    console.error('Failed to load prompts:', err)
  }
}

const savePrompts = async () => {
  try {
    // TODO: Save to config
    // await window.electronAPI?.invoke('prompts:save', prompts.value)
  } catch (err) {
    console.error('Failed to save prompts:', err)
  }
}

onMounted(() => {
  loadPrompts()
})
</script>

<style scoped>
.tab-container {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.tab-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.tab-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.tab-actions {
  display: flex;
  gap: 4px;
}

.icon-btn {
  width: 28px;
  height: 28px;
  border-radius: 4px;
  background: transparent;
  border: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all 0.15s ease;
}

.icon-btn:hover {
  background: var(--hover-bg);
}

.icon-btn.small {
  width: 24px;
  height: 24px;
  font-size: 12px;
}

.tab-toolbar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
}

.tab-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

/* Empty State */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  text-align: center;
  color: var(--text-color-muted);
  padding: 24px;
}

.empty-icon {
  font-size: 48px;
  margin-bottom: 12px;
  opacity: 0.5;
}

.empty-text {
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 4px;
}

.empty-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-bottom: 16px;
}

.add-btn {
  padding: 8px 16px;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.add-btn:hover {
  opacity: 0.9;
}

/* Prompts List */
.prompts-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.prompt-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.prompt-main {
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.prompt-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-color);
  margin-bottom: 4px;
}

.prompt-preview {
  font-size: 11px;
  color: var(--text-color-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.prompt-actions {
  display: flex;
  gap: 2px;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.prompt-item:hover .prompt-actions {
  opacity: 1;
}

/* Modal */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
