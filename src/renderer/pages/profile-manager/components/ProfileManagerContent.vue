<template>
  <div class="profile-manager">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('profileManager.title') }}</h1>
      <n-space>
        <n-button type="primary" @click="handleAdd">{{ t('profileManager.addProfile') }}</n-button>
        <n-button v-if="!embedded" @click="handleClose">{{ t('common.close') }}</n-button>
      </n-space>
    </div>

    <!-- Current Default Profile -->
    <div class="current-profile" v-if="defaultProfile">
      <div class="label">{{ t('profileManager.isDefault') }}</div>
      <div class="profile-info">
        <span class="icon">{{ defaultProfile.icon || '🟣' }}</span>
        <span class="name">{{ defaultProfile.name }}</span>
      </div>
    </div>
    <div class="current-profile no-profile" v-else-if="!loading">
      <div class="label">{{ t('profileManager.isDefault') }}</div>
      <div class="profile-info">
        <span class="icon no-icon"><Icon name="xCircle" :size="24" /></span>
        <span class="name">{{ t('profileManager.noProfiles') }}</span>
      </div>
    </div>

    <!-- Profiles List -->
    <n-spin :show="loading">
      <div class="profiles-grid">
        <ProfileCard
          v-for="profile in orderedProfiles"
          :key="profile.id"
          :profile="profile"
          :testing="testingProfileId === profile.id"
          @edit="handleEdit"
          @delete="handleDelete"
          @set-default="handleSetDefault"
          @test="handleTest"
        />

        <n-empty v-if="!loading && orderedProfiles.length === 0" :description="t('profileManager.noProfilesHint')" />
      </div>
    </n-spin>

    <!-- Edit Modal -->
    <ProfileFormModal
      v-model:show="showEditModal"
      :profile="editingProfile"
      :is-edit="!!editingProfile"
      :testing="testingModal"
      @save="handleSave"
      @test="handleModalTest"
    />
  </div>
</template>

<script setup>
import { computed, ref, onMounted, onActivated } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useProfiles } from '@composables/useProfiles'
import { useLocale } from '@composables/useLocale'
import ProfileCard from '@components/ProfileCard.vue'
import ProfileFormModal from './ProfileFormModal.vue'
import Icon from '@components/icons/Icon.vue'

const props = defineProps({
  embedded: {
    type: Boolean,
    default: false
  }
})

const message = useMessage()
const dialog = useDialog()
const { t, initLocale } = useLocale()

const { profiles, loading, defaultProfile, loadProfiles, addProfile, updateProfile, deleteProfile, setDefault, testConnection } = useProfiles()

const orderedProfiles = computed(() => {
  const profileList = [...profiles.value]
  const defaultIndex = profileList.findIndex(profile => profile.isDefault)

  if (defaultIndex <= 0) return profileList

  const [defaultProfile] = profileList.splice(defaultIndex, 1)
  return [defaultProfile, ...profileList]
})

const showEditModal = ref(false)
const editingProfile = ref(null)
const testingProfileId = ref(null)
const testingModal = ref(false)

onMounted(async () => {
  await initLocale()
  await loadProfiles()
})

// KeepAlive 激活时刷新（嵌入在 model-settings 多 tab 页面）
onActivated(() => {
  loadProfiles()
})

const handleClose = () => {
  if (props.embedded) return
  window.close()
}

const handleAdd = () => {
  editingProfile.value = null
  showEditModal.value = true
}

const handleEdit = (profile) => {
  editingProfile.value = { ...profile }
  showEditModal.value = true
}

const handleDelete = async (profileId) => {
  const profile = profiles.value.find(p => p.id === profileId)
  if (profile?.isDefault) {
    message.warning(t('profileManager.deleteConfirm'))
    return
  }

  dialog.warning({
    title: t('common.confirm'),
    content: t('profileManager.deleteConfirm'),
    positiveText: t('common.delete'),
    negativeText: t('common.cancel'),
    onPositiveClick: async () => {
      try {
        await deleteProfile(profileId)
        window.electronAPI?.broadcastSettings?.({ modelProfilesChanged: true })
        message.success(t('profileManager.deleteSuccess'))
      } catch (err) {
        message.error(t('messages.deleteFailed') + ': ' + err.message)
      }
    }
  })
}

const handleSetDefault = async (profileId) => {
  try {
    await setDefault(profileId)
    window.electronAPI?.broadcastSettings?.({ modelProfilesChanged: true })
    message.success(t('messages.saveSuccess'))
  } catch (err) {
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleTest = async (profile) => {
  // Convert reactive object to plain object for IPC
  const config = {
    baseUrl: profile.baseUrl,
    authToken: profile.authToken,
    authType: profile.authType,
    selectedModelId: profile.selectedModelId || '',
    useProxy: profile.useProxy,
    httpsProxy: profile.httpsProxy,
    httpProxy: profile.httpProxy
  }
  testingProfileId.value = profile.id
  try {
    await handleTestConnection(config)
  } finally {
    testingProfileId.value = null
  }
}

const handleSave = async (profileData) => {
  try {
    if (editingProfile.value?.id) {
      await updateProfile(editingProfile.value.id, profileData)
      message.success(t('profileManager.saveSuccess'))
    } else {
      await addProfile(profileData)
      message.success(t('profileManager.saveSuccess'))
    }
    window.electronAPI?.broadcastSettings?.({ modelProfilesChanged: true })
    showEditModal.value = false
    editingProfile.value = null
  } catch (err) {
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleModalTest = async (config) => {
  testingModal.value = true
  try {
    await handleTestConnection(config)
  } finally {
    testingModal.value = false
  }
}

const handleTestConnection = async (config) => {
  const connectingMsg = message.info(t('common.connecting'), { duration: 0 })

  try {
    const result = await testConnection(config)
    connectingMsg.destroy()
    if (result.success) {
      const reply = result.message ? result.message.substring(0, 100) : ''
      message.success(t('profileManager.testSuccess') + reply)
    } else {
      message.error(t('profileManager.testFailed') + ': ' + result.message)
    }
  } catch (err) {
    connectingMsg.destroy()
    message.error(t('profileManager.testFailed') + ': ' + err.message)
  }
}
</script>

<style scoped>
.profile-manager {
  padding: 24px;
  max-width: 1000px;
  margin: 0 auto;
  min-height: 100vh;
}

.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 24px;
  padding: 24px;
  border: 1px solid var(--border-color, #f0f0f0);
  background: var(--bg-color-secondary, white);
  border-radius: 12px;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
}

.current-profile {
  padding: 15px;
  background: var(--bg-color-tertiary, #f8f9fa);
  border-radius: 8px;
  border-left: 4px solid #17a2b8;
  margin-bottom: 20px;
}

.current-profile.no-profile {
  border-left-color: #dc3545;
}

.current-profile .label {
  font-size: 12px;
  color: #666;
  margin-bottom: 5px;
}

.current-profile .profile-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.current-profile .icon {
  font-size: 24px;
}

.current-profile .icon.no-icon {
  color: #dc3545;
}

.current-profile .name {
  font-size: 16px;
  font-weight: 600;
}

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
  margin-bottom: 20px;
  min-height: 100px;
}

@media (max-width: 700px) {
  .profiles-grid {
    grid-template-columns: 1fr;
  }
}

</style>
