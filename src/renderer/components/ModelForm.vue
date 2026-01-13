<template>
  <n-form
    ref="formRef"
    :model="formData"
    :rules="rules"
    label-placement="top"
    require-mark-placement="right-hanging"
  >
    <n-form-item label="模型 ID" path="id">
      <n-input
        v-model:value="formData.id"
        placeholder="例如: claude-3-opus-20240229"
        :disabled="isEdit"
      />
    </n-form-item>

    <n-form-item label="显示名称" path="name">
      <n-input
        v-model:value="formData.name"
        placeholder="例如: Claude 3 Opus"
      />
    </n-form-item>

    <n-form-item label="模型等级" path="tier">
      <n-select
        v-model:value="formData.tier"
        :options="tierOptions"
        placeholder="选择模型等级"
      />
    </n-form-item>

    <n-form-item label="描述" path="description">
      <n-input
        v-model:value="formData.description"
        type="textarea"
        placeholder="模型描述（可选）"
        :rows="2"
      />
    </n-form-item>
  </n-form>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  model: {
    type: Object,
    default: null
  },
  isEdit: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['update:model'])

const formRef = ref(null)

const formData = ref({
  id: '',
  name: '',
  tier: 'standard',
  description: ''
})

const tierOptions = [
  { label: '高级 (Premium)', value: 'premium' },
  { label: '标准 (Standard)', value: 'standard' },
  { label: '基础 (Basic)', value: 'basic' },
  { label: '快速 (Fast)', value: 'fast' }
]

const rules = {
  id: [
    { required: true, message: '请输入模型 ID', trigger: 'blur' }
  ],
  name: [
    { required: true, message: '请输入显示名称', trigger: 'blur' }
  ],
  tier: [
    { required: true, message: '请选择模型等级', trigger: 'change' }
  ]
}

// 监听外部 model 变化
watch(() => props.model, (newModel) => {
  if (newModel) {
    formData.value = { ...newModel }
  } else {
    formData.value = {
      id: '',
      name: '',
      tier: 'standard',
      description: ''
    }
  }
}, { immediate: true })

// 监听内部数据变化并同步到外部
watch(formData, (newData) => {
  emit('update:model', { ...newData })
}, { deep: true })

// 暴露验证方法
const validate = async () => {
  try {
    await formRef.value?.validate()
    return true
  } catch (errors) {
    return false
  }
}

const getData = () => {
  return { ...formData.value }
}

const reset = () => {
  formData.value = {
    id: '',
    name: '',
    tier: 'standard',
    description: ''
  }
}

defineExpose({
  validate,
  getData,
  reset
})
</script>
