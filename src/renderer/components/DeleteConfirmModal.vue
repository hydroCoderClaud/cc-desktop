<template>
  <n-modal
    :show="show"
    preset="dialog"
    type="warning"
    :title="title"
    :positive-text="confirmText"
    :negative-text="cancelText"
    @positive-click="handleConfirm"
    @negative-click="handleCancel"
    @close="handleCancel"
  >
    <template #icon>
      <n-icon size="24" color="#F57C00">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
        </svg>
      </n-icon>
    </template>
    <p>{{ message }}</p>
    <p v-if="subMessage" class="sub-message">{{ subMessage }}</p>
  </n-modal>
</template>

<script setup>
const props = defineProps({
  show: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    default: '确认删除'
  },
  message: {
    type: String,
    default: '确定要删除吗？此操作无法撤销。'
  },
  subMessage: {
    type: String,
    default: ''
  },
  confirmText: {
    type: String,
    default: '删除'
  },
  cancelText: {
    type: String,
    default: '取消'
  }
})

const emit = defineEmits(['update:show', 'confirm', 'cancel'])

const handleConfirm = () => {
  emit('confirm')
  emit('update:show', false)
}

const handleCancel = () => {
  emit('cancel')
  emit('update:show', false)
}
</script>

<style scoped>
.sub-message {
  margin-top: 8px;
  font-size: 13px;
  color: #8c8c8c;
}
</style>
