<template>
  <n-modal v-model:show="showModal" preset="dialog" :title="t('sessionManager.manageTags')">
    <div class="tag-manager">
      <div class="tag-input-row">
        <n-input
          v-model:value="newTagName"
          :placeholder="t('sessionManager.tagName')"
          style="flex: 1"
          @keyup.enter="handleCreate"
        />
        <n-color-picker v-model:value="newTagColor" :swatches="tagColors" :show-alpha="false" style="width: 50px" />
        <n-button type="primary" @click="handleCreate">{{ t('common.add') }}</n-button>
      </div>
      <div class="tag-list">
        <div v-for="tag in allTags" :key="tag.id" class="tag-item">
          <n-tag :color="{ color: tag.color, textColor: '#fff' }">{{ tag.name }}</n-tag>
          <span class="tag-count">{{ (tag.session_count || 0) + (tag.message_count || 0) }}</span>
          <n-button size="tiny" quaternary @click="handleDelete(tag.id)"><Icon name="delete" :size="14" /></n-button>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useLocale } from '@composables/useLocale'
import { TAG_COLORS, DEFAULT_TAG_COLOR } from '@composables/constants'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const props = defineProps({
  show: {
    type: Boolean,
    required: true
  },
  allTags: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:show', 'create', 'delete'])

const showModal = computed({
  get: () => props.show,
  set: (val) => emit('update:show', val)
})

const newTagName = ref('')
const newTagColor = ref(DEFAULT_TAG_COLOR)
const tagColors = TAG_COLORS

const handleCreate = () => {
  if (!newTagName.value.trim()) return
  emit('create', newTagName.value.trim(), newTagColor.value)
  newTagName.value = ''
}

const handleDelete = (tagId) => {
  emit('delete', tagId)
}
</script>

<style scoped>
.tag-manager {
  padding: 8px 0;
}

.tag-input-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
  align-items: stretch;
}

.tag-input-row :deep(.n-input) {
  height: 34px;
}

.tag-input-row :deep(.n-color-picker) {
  height: 34px;
}

.tag-input-row :deep(.n-color-picker-trigger) {
  height: 100%;
  border-radius: 4px;
}

.tag-input-row :deep(.n-color-picker-trigger__fill) {
  border-radius: 3px;
}

.tag-input-row :deep(.n-color-picker-trigger__value) {
  display: none;
}

.tag-input-row :deep(.n-button) {
  height: 34px;
}

.tag-list {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  max-height: 300px;
  overflow-y: auto;
  padding: 4px 0;
}

.tag-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.tag-count {
  font-size: 11px;
  color: #888;
}
</style>
