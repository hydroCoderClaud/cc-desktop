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
        <n-color-picker v-model:value="newTagColor" :swatches="tagColors" style="width: 80px" />
        <n-button type="primary" @click="handleCreate">{{ t('common.add') }}</n-button>
      </div>
      <div class="tag-list">
        <div v-for="tag in allTags" :key="tag.id" class="tag-item">
          <n-tag :color="{ color: tag.color, textColor: '#fff' }">{{ tag.name }}</n-tag>
          <span class="tag-count">{{ (tag.session_count || 0) + (tag.message_count || 0) }}</span>
          <n-button size="tiny" quaternary @click="handleDelete(tag.id)">🗑️</n-button>
        </div>
      </div>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useLocale } from '@composables/useLocale'

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
const newTagColor = ref('#1890ff')
const tagColors = ['#1890ff', '#52c41a', '#faad14', '#f5222d', '#722ed1', '#13c2c2', '#eb2f96']

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
