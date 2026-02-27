<template>
  <n-modal v-model:show="visible" preset="card" :title="t('market.title')" style="width: 680px; max-width: 90vw;">
    <div class="market-modal-content">
      <!-- 错误提示 -->
      <div v-if="fetchError" class="fetch-error">
        <Icon name="warning" :size="14" />
        <span>{{ fetchError }}</span>
      </div>

      <!-- Tabs -->
      <n-tabs v-model:value="activeTab" type="segment" size="small">
        <n-tab-pane :name="'skills'" :tab="t('market.tabs.skills')">
          <MarketList
            :items="filteredSkills"
            :installed-map="installedSkillsMap"
            :installing-set="installingSet"
            :fetch-loading="fetchLoading"
            :fetched="fetched"
            :search-text="skillsSearch"
            @update:search-text="skillsSearch = $event"
            @fetch="fetchIndex"
            @install="handleInstallSkill"
            @update-item="handleUpdateSkill"
          />
        </n-tab-pane>
        <n-tab-pane :name="'prompts'" :tab="t('market.tabs.prompts')">
          <MarketList
            :items="filteredPrompts"
            :installed-map="installedPromptsMap"
            :installing-set="installingSet"
            :fetch-loading="fetchLoading"
            :fetched="fetched"
            :search-text="promptsSearch"
            @update:search-text="promptsSearch = $event"
            @fetch="fetchIndex"
            @install="handleInstallPrompt"
            @update-item="handleUpdatePrompt"
          />
        </n-tab-pane>
        <n-tab-pane :name="'agents'" :tab="t('market.tabs.agents')">
          <MarketList
            :items="filteredAgents"
            :installed-map="installedAgentsMap"
            :installing-set="installingSet"
            :fetch-loading="fetchLoading"
            :fetched="fetched"
            :search-text="agentsSearch"
            @update:search-text="agentsSearch = $event"
            @fetch="fetchIndex"
            @install="handleInstallAgent"
            @update-item="handleUpdateAgent"
          />
        </n-tab-pane>
        <n-tab-pane :name="'mcps'" :tab="t('market.tabs.mcps')">
          <MarketList
            :items="filteredMcps"
            :installed-map="installedMcpsMap"
            :installing-set="installingSet"
            :fetch-loading="fetchLoading"
            :fetched="fetched"
            :search-text="mcpsSearch"
            @update:search-text="mcpsSearch = $event"
            @fetch="fetchIndex"
            @install="handleInstallMcp"
            @update-item="handleUpdateMcp"
          />
        </n-tab-pane>
      </n-tabs>
    </div>
  </n-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { NModal, NTabs, NTabPane, useMessage, useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import Icon from '@components/icons/Icon.vue'
import MarketList from './MarketList.vue'

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const props = defineProps({
  defaultTab: { type: String, default: 'skills' }
})

const visible = defineModel({ type: Boolean, default: false })
const emit = defineEmits(['installed'])

// State
const activeTab = ref(props.defaultTab)
const registryUrl = ref('')
const marketData = ref({ skills: [], prompts: [], agents: [], mcps: [] })
const installedSkillsMap = ref(new Map())
const installedPromptsMap = ref(new Map())
const installedAgentsMap = ref(new Map())
const installedMcpsMap = ref(new Map())
const skillsSearch = ref('')
const promptsSearch = ref('')
const agentsSearch = ref('')
const mcpsSearch = ref('')
const fetchLoading = ref(false)
const fetchError = ref('')
const fetched = ref(false)
const installingSet = ref(new Set())

// 打开时自动加载
watch(visible, async (val) => {
  if (val) {
    activeTab.value = props.defaultTab
    try {
      const marketConfig = await window.electronAPI.getMarketConfig()
      if (marketConfig?.registryUrl) {
        registryUrl.value = marketConfig.registryUrl
      }
      await loadAllInstalled()
      if (registryUrl.value.trim()) {
        fetchIndex()
      }
    } catch (e) {
      console.error('Failed to load market config:', e)
    }
  }
})

// Filter helpers
const filterList = (list, search) => {
  if (!search.trim()) return list
  const kw = search.toLowerCase()
  return list.filter(item =>
    (item.name || item.id).toLowerCase().includes(kw) ||
    (item.description || '').toLowerCase().includes(kw) ||
    (item.tags || []).some(tag => tag.toLowerCase().includes(kw))
  )
}

const filteredSkills = computed(() => filterList(marketData.value.skills, skillsSearch.value))
const filteredPrompts = computed(() => filterList(marketData.value.prompts, promptsSearch.value))
const filteredAgents = computed(() => filterList(marketData.value.agents, agentsSearch.value))
const filteredMcps = computed(() => filterList(marketData.value.mcps, mcpsSearch.value))

// Load installed items
const loadAllInstalled = async () => {
  await Promise.all([
    loadInstalledSkills(),
    loadInstalledPrompts(),
    loadInstalledAgents(),
    loadInstalledMcps()
  ])
}

const loadInstalledSkills = async () => {
  try {
    const list = await window.electronAPI.listMarketInstalled()
    const map = new Map()
    for (const item of list) map.set(item.skillId, item)
    installedSkillsMap.value = map
  } catch (e) { console.error('Failed to load installed skills:', e) }
}

const loadInstalledPrompts = async () => {
  try {
    const list = await window.electronAPI.listMarketInstalledPrompts()
    const map = new Map()
    for (const item of list) map.set(item.market_id, item)
    installedPromptsMap.value = map
  } catch (e) { console.error('Failed to load installed prompts:', e) }
}

const loadInstalledAgents = async () => {
  try {
    const list = await window.electronAPI.listMarketInstalledAgents()
    const map = new Map()
    for (const item of list) map.set(item.agentId, item)
    installedAgentsMap.value = map
  } catch (e) { console.error('Failed to load installed agents:', e) }
}

const loadInstalledMcps = async () => {
  try {
    // 获取 user scope 中已安装的 MCP（从 ~/.claude.json 读取）
    const allMcp = await window.electronAPI.listMcpAll()
    const map = new Map()
    // 将 user scope 中的 MCP name 标记为已安装
    // MCP 没有版本信息，所以只记录名称
    for (const mcp of (allMcp?.user || [])) {
      map.set(mcp.name, { name: mcp.name, installed: true })
    }
    installedMcpsMap.value = map
  } catch (e) { console.error('Failed to load installed MCPs:', e) }
}

// Fetch registry index
const fetchIndex = async () => {
  const url = registryUrl.value.trim()
  if (!url) {
    fetchError.value = t('market.noRegistry')
    return
  }

  fetchLoading.value = true
  fetchError.value = ''

  try {
    const result = await window.electronAPI.fetchMarketIndex(url)
    if (result.success) {
      marketData.value = {
        skills: result.data.skills || [],
        prompts: result.data.prompts || [],
        agents: result.data.agents || [],
        mcps: result.data.mcps || []
      }
      fetched.value = true
      fetchError.value = ''
    } else {
      fetchError.value = result.error || t('market.fetchError')
      message.warning(fetchError.value)
    }
  } catch (e) {
    fetchError.value = t('market.networkError')
    message.warning(fetchError.value)
  } finally {
    fetchLoading.value = false
  }
}

// Reactive set helper
const addToInstalling = (id) => {
  installingSet.value.add(id)
  installingSet.value = new Set(installingSet.value)
}
const removeFromInstalling = (id) => {
  installingSet.value.delete(id)
  installingSet.value = new Set(installingSet.value)
}

// ========== Skills install ==========
const handleInstallSkill = async (skill) => {
  addToInstalling(skill.id)
  try {
    const result = await window.electronAPI.installMarketSkill({
      registryUrl: registryUrl.value.trim(),
      skill: JSON.parse(JSON.stringify(skill))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: skill.name || skill.id }))
      await loadInstalledSkills()
      emit('installed')
    } else if (result.conflict) {
      dialog.warning({
        title: t('market.confirmOverwriteTitle'),
        content: t('market.confirmOverwrite', { id: skill.id }),
        positiveText: t('market.install'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
          await handleForceInstallSkill(skill)
        }
      })
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(skill.id)
  }
}

const handleForceInstallSkill = async (skill) => {
  addToInstalling(skill.id)
  try {
    const result = await window.electronAPI.installMarketSkillForce({
      registryUrl: registryUrl.value.trim(),
      skill: JSON.parse(JSON.stringify(skill))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: skill.name || skill.id }))
      await loadInstalledSkills()
      emit('installed')
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(skill.id)
  }
}

const handleUpdateSkill = async (skill) => {
  addToInstalling(skill.id)
  try {
    const result = await window.electronAPI.updateMarketSkill({
      registryUrl: registryUrl.value.trim(),
      skill: JSON.parse(JSON.stringify(skill))
    })
    if (result.success) {
      message.success(t('market.updateSuccess', { name: skill.name || skill.id }))
      await loadInstalledSkills()
      emit('installed')
    } else {
      message.error(t('market.updateFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.updateFailed', { error: e.message }))
  } finally {
    removeFromInstalling(skill.id)
  }
}

// ========== Prompts install ==========
const handleInstallPrompt = async (prompt) => {
  addToInstalling(prompt.id)
  try {
    const result = await window.electronAPI.installMarketPrompt({
      registryUrl: registryUrl.value.trim(),
      prompt: JSON.parse(JSON.stringify(prompt))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: prompt.name || prompt.id }))
      await loadInstalledPrompts()
      emit('installed')
    } else if (result.conflict) {
      dialog.warning({
        title: t('market.confirmOverwriteTitle'),
        content: t('market.confirmOverwrite', { id: prompt.id }),
        positiveText: t('market.install'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
          await handleForceInstallPrompt(prompt)
        }
      })
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(prompt.id)
  }
}

const handleForceInstallPrompt = async (prompt) => {
  addToInstalling(prompt.id)
  try {
    const result = await window.electronAPI.installMarketPromptForce({
      registryUrl: registryUrl.value.trim(),
      prompt: JSON.parse(JSON.stringify(prompt))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: prompt.name || prompt.id }))
      await loadInstalledPrompts()
      emit('installed')
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(prompt.id)
  }
}

const handleUpdatePrompt = async (prompt) => {
  addToInstalling(prompt.id)
  try {
    const result = await window.electronAPI.updateMarketPrompt({
      registryUrl: registryUrl.value.trim(),
      prompt: JSON.parse(JSON.stringify(prompt))
    })
    if (result.success) {
      message.success(t('market.updateSuccess', { name: prompt.name || prompt.id }))
      await loadInstalledPrompts()
      emit('installed')
    } else {
      message.error(t('market.updateFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.updateFailed', { error: e.message }))
  } finally {
    removeFromInstalling(prompt.id)
  }
}

// ========== Agents install ==========
const handleInstallAgent = async (agent) => {
  addToInstalling(agent.id)
  try {
    const result = await window.electronAPI.installMarketAgent({
      registryUrl: registryUrl.value.trim(),
      agent: JSON.parse(JSON.stringify(agent))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: agent.name || agent.id }))
      await loadInstalledAgents()
      emit('installed')
    } else if (result.conflict) {
      dialog.warning({
        title: t('market.confirmOverwriteTitle'),
        content: t('market.confirmOverwrite', { id: agent.id }),
        positiveText: t('market.install'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
          await handleForceInstallAgent(agent)
        }
      })
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(agent.id)
  }
}

const handleForceInstallAgent = async (agent) => {
  addToInstalling(agent.id)
  try {
    const result = await window.electronAPI.installMarketAgentForce({
      registryUrl: registryUrl.value.trim(),
      agent: JSON.parse(JSON.stringify(agent))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: agent.name || agent.id }))
      await loadInstalledAgents()
      emit('installed')
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(agent.id)
  }
}

const handleUpdateAgent = async (agent) => {
  addToInstalling(agent.id)
  try {
    const result = await window.electronAPI.updateMarketAgent({
      registryUrl: registryUrl.value.trim(),
      agent: JSON.parse(JSON.stringify(agent))
    })
    if (result.success) {
      message.success(t('market.updateSuccess', { name: agent.name || agent.id }))
      await loadInstalledAgents()
      emit('installed')
    } else {
      message.error(t('market.updateFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.updateFailed', { error: e.message }))
  } finally {
    removeFromInstalling(agent.id)
  }
}

// ========== MCPs install ==========
const handleInstallMcp = async (mcp) => {
  addToInstalling(mcp.id)
  try {
    const result = await window.electronAPI.installMarketMcp({
      registryUrl: registryUrl.value.trim(),
      mcp: JSON.parse(JSON.stringify(mcp))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: mcp.name || mcp.id }))
      await loadInstalledMcps()
      emit('installed')
    } else if (result.conflict) {
      dialog.warning({
        title: t('market.confirmOverwriteTitle'),
        content: t('market.confirmOverwrite', { id: mcp.id }),
        positiveText: t('market.install'),
        negativeText: t('common.cancel'),
        onPositiveClick: async () => {
          await handleForceInstallMcp(mcp)
        }
      })
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(mcp.id)
  }
}

const handleForceInstallMcp = async (mcp) => {
  addToInstalling(mcp.id)
  try {
    const result = await window.electronAPI.installMarketMcpForce({
      registryUrl: registryUrl.value.trim(),
      mcp: JSON.parse(JSON.stringify(mcp))
    })
    if (result.success) {
      message.success(t('market.installSuccess', { name: mcp.name || mcp.id }))
      await loadInstalledMcps()
      emit('installed')
    } else {
      message.error(t('market.installFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.installFailed', { error: e.message }))
  } finally {
    removeFromInstalling(mcp.id)
  }
}

const handleUpdateMcp = async (mcp) => {
  addToInstalling(mcp.id)
  try {
    const result = await window.electronAPI.updateMarketMcp({
      registryUrl: registryUrl.value.trim(),
      mcp: JSON.parse(JSON.stringify(mcp))
    })
    if (result.success) {
      message.success(t('market.updateSuccess', { name: mcp.name || mcp.id }))
      await loadInstalledMcps()
      emit('installed')
    } else {
      message.error(t('market.updateFailed', { error: result.error }))
    }
  } catch (e) {
    message.error(t('market.updateFailed', { error: e.message }))
  } finally {
    removeFromInstalling(mcp.id)
  }
}
</script>

<style scoped>
.market-modal-content {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fetch-error {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: rgba(231, 76, 60, 0.08);
  border-radius: 6px;
  color: #e74c3c;
  font-size: 12px;
}
</style>
