<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu"
        :style="{ top: position.y + 'px', left: position.x + 'px' }"
        @click.stop
      >
        <template v-for="item in items" :key="item.key">
          <div class="menu-divider" v-if="item.divider" />
          <div
            v-else
            class="menu-item"
            :class="{ disabled: item.disabled }"
            @click="handleSelect(item)"
          >
            <span class="menu-item-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="menu-item-shortcut">{{ item.shortcut }}</span>
          </div>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  items: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['select'])

const visible = ref(false)
const position = ref({ x: 0, y: 0 })
const menuRef = ref(null)

const show = (x, y) => {
  position.value = { x, y }
  visible.value = true
  nextTick(() => {
    const el = menuRef.value
    if (!el) return
    const { width, height } = el.getBoundingClientRect()
    if (x + width > window.innerWidth - 8) position.value = { ...position.value, x: window.innerWidth - width - 8 }
    if (y + height > window.innerHeight - 8) position.value = { ...position.value, y: window.innerHeight - height - 8 }
  })
}

const hide = () => {
  visible.value = false
}

const handleSelect = (item) => {
  if (item.disabled) return
  emit('select', item.key)
  hide()
}

const onKeydown = (e) => {
  if (e.key === 'Escape') hide()
}

const onClickOutside = () => {
  hide()
}

onMounted(() => {
  document.addEventListener('click', onClickOutside)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
})

defineExpose({ show, hide })
</script>

<style scoped>
.context-menu {
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
  justify-content: space-between;
  gap: 16px;
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

.menu-item.disabled {
  opacity: 0.4;
  cursor: default;
  pointer-events: none;
}

.menu-item-label {
  flex: 1;
}

.menu-item-shortcut {
  font-size: 11px;
  color: var(--text-color-muted);
  white-space: nowrap;
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
