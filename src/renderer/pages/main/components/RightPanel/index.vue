<template>
  <div class="right-panel">
    <!-- Tab Bar -->
    <TabBar
      :tabs="tabs"
      :active-tab="activeTab"
      @select="activeTab = $event"
      @collapse="$emit('collapse')"
    />

    <!-- Tab Content -->
    <div class="panel-content">
      <KeepAlive>
        <component
          :is="currentTabComponent"
          :current-project="currentProject"
          :terminal-busy="terminalBusy"
          @send-command="handleSendCommand"
          @insert-to-input="handleInsertToInput"
        />
      </KeepAlive>
    </div>

    <!-- Quick Input -->
    <QuickInput
      ref="quickInputRef"
      :terminal-busy="terminalBusy"
      @add-to-queue="handleAddToQueue"
      @send-direct="handleSendDirect"
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, markRaw } from 'vue'
import { useLocale } from '@composables/useLocale'
import TabBar from './TabBar.vue'
import QuickInput from './QuickInput.vue'

// Tab Components (lazy loaded)
import QueueTab from './tabs/QueueTab.vue'
import PluginsTab from './tabs/PluginsTab.vue'
import SkillsTab from './tabs/SkillsTab.vue'
import MCPTab from './tabs/MCPTab.vue'
import PromptsTab from './tabs/PromptsTab.vue'
import AITab from './tabs/AITab.vue'

const { t } = useLocale()

// Props
const props = defineProps({
  currentProject: {
    type: Object,
    default: null
  },
  terminalBusy: {
    type: Boolean,
    default: false
  }
})

// Emits
const emit = defineEmits(['collapse', 'send-command'])

// Refs
const quickInputRef = ref(null)

// Tab definitions
const tabs = computed(() => [
  { id: 'queue', icon: '📋', label: t('rightPanel.tabs.queue') },
  { id: 'plugins', icon: '🔌', label: t('rightPanel.tabs.plugins') },
  { id: 'skills', icon: '⚡', label: t('rightPanel.tabs.skills') },
  { id: 'mcp', icon: '🔗', label: t('rightPanel.tabs.mcp') },
  { id: 'prompts', icon: '💬', label: t('rightPanel.tabs.prompts') },
  { id: 'ai', icon: '🤖', label: t('rightPanel.tabs.ai') }
])

// Tab components map
const tabComponents = {
  queue: markRaw(QueueTab),
  plugins: markRaw(PluginsTab),
  skills: markRaw(SkillsTab),
  mcp: markRaw(MCPTab),
  prompts: markRaw(PromptsTab),
  ai: markRaw(AITab)
}

// Active tab state
const activeTab = ref('queue')

// Current tab component
const currentTabComponent = computed(() => {
  return tabComponents[activeTab.value] || tabComponents.queue
})

// Handlers
const handleSendCommand = (command) => {
  emit('send-command', command)
}

const handleInsertToInput = (text) => {
  if (quickInputRef.value) {
    quickInputRef.value.insertText(text)
  }
}

const handleAddToQueue = (command) => {
  // Switch to queue tab and add command
  activeTab.value = 'queue'
  // TODO: Integrate with useCommandQueue
  console.log('Add to queue:', command)
}

const handleSendDirect = (command) => {
  emit('send-command', command)
}

// Expose for parent component
defineExpose({
  activeTab,
  insertToInput: handleInsertToInput
})
</script>

<style scoped>
.right-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-color-secondary);
  border-left: 1px solid var(--border-color);
  width: 320px;
  flex-shrink: 0;
}

.panel-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}
</style>
