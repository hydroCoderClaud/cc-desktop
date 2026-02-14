<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="visible"
        class="file-tree-context-menu"
        :style="{ top: position.y + 'px', left: position.x + 'px' }"
        @click.stop
      >
        <!-- 文件夹菜单 -->
        <template v-if="target?.isDirectory">
          <div class="menu-item" @click="handleAction('newFile')">
            <Icon name="fileText" :size="14" />
            <span>{{ t('agent.files.newFile') }}</span>
          </div>
          <div class="menu-item" @click="handleAction('newFolder')">
            <Icon name="folder" :size="14" />
            <span>{{ t('agent.files.newFolder') }}</span>
          </div>
          <div class="menu-divider"></div>
          <div class="menu-item" @click="handleAction('rename')">
            <Icon name="edit" :size="14" />
            <span>{{ t('common.rename') }}</span>
          </div>
          <div class="menu-item danger" @click="handleAction('delete')">
            <Icon name="delete" :size="14" />
            <span>{{ t('common.delete') }}</span>
          </div>
        </template>

        <!-- 文件菜单 -->
        <template v-else-if="target && !target.isDirectory">
          <div class="menu-item" @click="handleAction('rename')">
            <Icon name="edit" :size="14" />
            <span>{{ t('common.rename') }}</span>
          </div>
          <div class="menu-item danger" @click="handleAction('delete')">
            <Icon name="delete" :size="14" />
            <span>{{ t('common.delete') }}</span>
          </div>
        </template>

        <!-- 空白区域菜单 -->
        <template v-else>
          <div class="menu-item" @click="handleAction('newFile')">
            <Icon name="fileText" :size="14" />
            <span>{{ t('agent.files.newFile') }}</span>
          </div>
          <div class="menu-item" @click="handleAction('newFolder')">
            <Icon name="folder" :size="14" />
            <span>{{ t('agent.files.newFolder') }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'

const { t } = useLocale()

const visible = ref(false)
const position = ref({ x: 0, y: 0 })
const target = ref(null)

const emit = defineEmits(['action'])

const show = (x, y, entry) => {
  position.value = { x, y }
  target.value = entry
  visible.value = true
}

const hide = () => {
  visible.value = false
  target.value = null
}

const handleAction = (action) => {
  emit('action', { action, target: target.value })
  hide()
}

defineExpose({ show, hide })
</script>

<style scoped>
.file-tree-context-menu {
  position: fixed;
  background: var(--bg-color);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  padding: 4px;
  min-width: 160px;
  z-index: 10000;
  user-select: none;
}

.menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-color);
  transition: background 0.15s;
}

.menu-item:hover {
  background: var(--hover-bg);
}

.menu-item.danger {
  color: var(--error-color, #e53e3e);
}

.menu-item.danger:hover {
  background: rgba(229, 62, 62, 0.1);
}

.menu-divider {
  height: 1px;
  background: var(--border-color);
  margin: 4px 0;
}

.context-menu-enter-active,
.context-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.context-menu-enter-from,
.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
