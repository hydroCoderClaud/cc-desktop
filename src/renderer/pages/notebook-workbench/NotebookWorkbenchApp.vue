<template>
  <n-config-provider :theme="naiveTheme" :theme-overrides="themeOverrides" :locale="naiveLocale" :date-locale="naiveDateLocale">
    <n-message-provider>
      <n-dialog-provider>
        <div class="notebook-workbench-app" :style="cssVars">
          <NotebookWorkspace ref="notebookWorkspaceRef" />
        </div>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { nextTick, onMounted, onUnmounted, ref } from 'vue'
import { useNaiveLocale } from '@composables/useNaiveLocale'
import { useTheme } from '@composables/useTheme'
import NotebookWorkspace from '@/pages/notebook/components/NotebookWorkspace.vue'

const notebookWorkspaceRef = ref(null)
const { naiveTheme, themeOverrides, initLocale, naiveLocale, naiveDateLocale } = useNaiveLocale()
const { cssVars, initTheme } = useTheme()
let cleanupRestore = null

const restoreTarget = async (target = {}) => {
  const sessionId = typeof target?.sessionId === 'string' ? target.sessionId.trim() : ''
  if (!sessionId) return false

  await nextTick()
  return Boolean(await notebookWorkspaceRef.value?.restoreSessionById?.(sessionId))
}

onMounted(async () => {
  initLocale()
  initTheme()

  cleanupRestore = window.electronAPI?.onNotebookWorkbenchRestore?.((target) => {
    void restoreTarget(target)
  }) || null

  const initialTarget = await window.electronAPI?.notebookWorkbenchReady?.()
  await restoreTarget(initialTarget)
})

onUnmounted(() => {
  cleanupRestore?.()
  cleanupRestore = null
})
</script>

<style>
.notebook-workbench-app {
  min-height: 100vh;
  background-color: var(--bg-color);
  color: var(--text-color);
}
</style>
