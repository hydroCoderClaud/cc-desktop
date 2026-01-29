<template>
  <n-modal
    :show="show"
    preset="card"
    :title="isEdit ? t('project.editTitle') : t('project.createTitle')"
    style="width: 500px;"
    @update:show="$emit('update:show', $event)"
  >
    <n-form :model="formData" label-placement="left" label-width="80">
      <n-form-item :label="t('project.name')">
        <n-input v-model:value="formData.name" :placeholder="t('project.namePlaceholder')" />
        <template #feedback>
          <span class="form-hint">{{ t('project.nameHint') }}</span>
        </template>
      </n-form-item>
      <n-form-item :label="t('project.path')">
        <n-input v-model:value="formData.path" disabled />
        <template #feedback>
          <span class="form-hint">{{ t('project.pathHint') }}</span>
        </template>
      </n-form-item>
      <n-form-item :label="t('project.description')">
        <n-input v-model:value="formData.description" type="textarea" :placeholder="t('project.descriptionPlaceholder')" />
      </n-form-item>
      <n-form-item :label="t('project.icon')">
        <div class="emoji-picker-container">
          <div class="selected-emoji" @click="showEmojiPicker = !showEmojiPicker">
            {{ formData.icon || '📁' }}
          </div>
          <div v-if="showEmojiPicker" class="emoji-picker" @click.stop>
            <div
              v-for="emoji in commonEmojis"
              :key="emoji"
              class="emoji-option"
              :class="{ selected: formData.icon === emoji }"
              @click="selectEmoji(emoji)"
            >
              {{ emoji }}
            </div>
          </div>
        </div>
      </n-form-item>
      <n-form-item :label="t('project.borderColor')">
        <div class="color-picker-row">
          <n-color-picker
            v-model:value="formData.color"
            :modes="['hex']"
            :show-alpha="false"
            :swatches="['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#eb2f96', '#13c2c2', '#2f54eb']"
            style="width: 120px;"
          />
          <n-button size="small" @click="formData.color = '#1890ff'">{{ t('project.resetColor') }}</n-button>
        </div>
        <template #feedback>
          <span class="form-hint">{{ t('project.borderColorHint') }}</span>
        </template>
      </n-form-item>
      <n-form-item :label="t('project.apiProfile')">
        <div class="api-profile-row">
          <n-select
            v-model:value="formData.api_profile_id"
            :options="apiProfileOptions"
            :placeholder="t('project.apiProfilePlaceholder')"
            clearable
            style="flex: 1;"
          />
          <n-tooltip trigger="hover">
            <template #trigger>
              <n-button
                size="small"
                quaternary
                :disabled="!formData.api_profile_id"
                @click="$emit('open-profile-manager')"
              >
                <Icon name="settings" :size="14" />
              </n-button>
            </template>
            {{ t('project.editApiProfile') }}
          </n-tooltip>
        </div>
        <template #feedback>
          <span class="form-hint">{{ t('project.apiProfileHint') }}</span>
        </template>
      </n-form-item>
    </n-form>
    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" @click="handleSave">{{ t('common.save') }}</n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch, computed } from 'vue'
import { NModal, NForm, NFormItem, NInput, NButton, NColorPicker, NSelect, NTooltip } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  show: Boolean,
  project: Object,
  apiProfiles: Array
})

const emit = defineEmits(['update:show', 'save', 'open-profile-manager'])

const showEmojiPicker = ref(false)

const commonEmojis = [
  '📁', '📂', '📦', '🗂️', '💼',
  '🚀', '⚡', '🔥', '✨', '💡',
  '🎯', '🎨', '🎮', '🎵', '🎬',
  '🌐', '🔧', '⚙️', '🛠️', '🔨',
  '📱', '💻', '🖥️', '⌨️', '🖱️',
  '📊', '📈', '📉', '📋', '📝',
  '🔒', '🔑', '🔐', '🛡️', '⚔️',
  '🌟', '⭐', '🏆', '🎖️', '🏅',
  '❤️', '💚', '💙', '💜', '🧡'
]

const defaultFormData = () => ({
  name: '',
  path: '',
  description: '',
  icon: '📁',
  color: '#1890ff',
  api_profile_id: null
})

const formData = ref(defaultFormData())

const isEdit = computed(() => !!props.project)

const apiProfileOptions = computed(() => {
  if (!props.apiProfiles) return []
  return props.apiProfiles.map(profile => ({
    label: `${profile.icon || '🔑'} ${profile.name}${profile.isDefault ? ' (' + t('common.default') + ')' : ''}`,
    value: profile.id
  }))
})

// Watch for project changes to populate form
watch(() => props.project, (newProject) => {
  if (newProject) {
    formData.value = {
      name: newProject.name || '',
      path: newProject.path || '',
      description: newProject.description || '',
      icon: newProject.icon || '📁',
      color: newProject.color || '#1890ff',
      api_profile_id: newProject.api_profile_id || null
    }
  } else {
    formData.value = defaultFormData()
  }
  showEmojiPicker.value = false
}, { immediate: true })

const selectEmoji = (emoji) => {
  formData.value.icon = emoji
  showEmojiPicker.value = false
}

const handleSave = () => {
  emit('save', {
    name: formData.value.name,
    description: formData.value.description,
    icon: formData.value.icon,
    color: formData.value.color,
    api_profile_id: formData.value.api_profile_id
  })
}
</script>

<style scoped>
/* Modal Footer */
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

/* Form Hint */
.form-hint {
  font-size: 12px;
  color: var(--text-color-muted);
}

/* Emoji Picker */
.emoji-picker-container {
  position: relative;
}

.selected-emoji {
  width: 48px;
  height: 48px;
  font-size: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: var(--bg-color-tertiary);
}

.selected-emoji:hover {
  border-color: var(--primary-color);
  background: var(--bg-color-secondary);
}

.emoji-picker {
  position: absolute;
  top: 100%;
  left: 0;
  margin-top: 4px;
  padding: 8px;
  background: var(--n-color, var(--bg-color-secondary, #ffffff));
  border: 1px solid var(--border-color, #e0e0e0);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 4px;
  z-index: 100;
  width: 220px;
}

.emoji-option {
  width: 36px;
  height: 36px;
  font-size: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s;
}

.emoji-option:hover {
  background: var(--hover-bg);
  transform: scale(1.1);
}

.emoji-option.selected {
  background: var(--primary-color);
  color: white;
}

/* Color Picker Row */
.color-picker-row {
  display: flex;
  align-items: center;
  gap: 12px;
}

/* API Profile Row */
.api-profile-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
}
</style>
