<template>
  <n-modal
    :show="show"
    preset="card"
    :title="t('rightPanel.mcp.copyTo')"
    style="width: 400px;"
    :mask-closable="false"
    @update:show="$emit('update:show', $event)"
  >
    <div class="copy-content">
      <div class="mcp-info">
        <span class="mcp-name">{{ mcp?.name }}</span>
      </div>

      <div class="scope-select">
        <n-radio-group v-model:value="targetScope">
          <n-space>
            <n-radio value="user">{{ t('rightPanel.mcp.targetUser') }}</n-radio>
            <n-radio value="local" :disabled="!projectPath">{{ t('rightPanel.mcp.targetLocal') }}</n-radio>
            <n-radio value="project" :disabled="!projectPath">{{ t('rightPanel.mcp.targetProject') }}</n-radio>
          </n-space>
        </n-radio-group>
      </div>
    </div>

    <template #footer>
      <div class="modal-footer">
        <n-button @click="$emit('update:show', false)">{{ t('common.cancel') }}</n-button>
        <n-button type="primary" :loading="copying" @click="handleCopy">
          {{ t('common.copy') }}
        </n-button>
      </div>
    </template>
  </n-modal>
</template>

<script setup>
import { ref, watch } from 'vue'
import { NModal, NButton, NRadioGroup, NRadio, NSpace, useMessage } from 'naive-ui'
import { useLocale } from '@composables/useLocale'

const { t } = useLocale()
const message = useMessage()

const props = defineProps({
  show: Boolean,
  mcp: Object,           // { name, config, source }
  projectPath: String
})

const emit = defineEmits(['update:show', 'copied'])

const copying = ref(false)
const targetScope = ref('user')

// 监听 show，重置状态
watch(() => props.show, (show) => {
  if (show) {
    // 默认选择与源不同的 scope
    if (props.mcp?.source === 'user') {
      targetScope.value = props.projectPath ? 'project' : 'user'
    } else {
      targetScope.value = 'user'
    }
  }
})

const handleCopy = async () => {
  if (!props.mcp) return

  copying.value = true
  try {
    // 深拷贝 config 以避免 IPC 克隆错误（Vue Proxy 对象无法直接传输）
    const configCopy = JSON.parse(JSON.stringify(props.mcp.config))

    const result = await window.electronAPI.createMcp({
      scope: targetScope.value,
      projectPath: props.projectPath,
      name: props.mcp.name,
      config: configCopy
    })

    if (result.success) {
      message.success(t('rightPanel.mcp.copySuccess'))
      emit('copied')
      emit('update:show', false)
    } else {
      message.error(result.error || t('rightPanel.mcp.copyFailed'))
    }
  } catch (err) {
    console.error('Copy MCP failed:', err)
    message.error(err.message || t('rightPanel.mcp.copyFailed'))
  } finally {
    copying.value = false
  }
}
</script>

<style scoped>
.copy-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.mcp-info {
  padding: 12px;
  background: var(--bg-color-tertiary);
  border-radius: 6px;
}

.mcp-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-color);
}

.scope-select {
  padding: 8px 0;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
