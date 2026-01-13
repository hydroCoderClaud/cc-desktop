<template>
  <div class="profile-manager">
    <!-- Header -->
    <div class="header">
      <h1>{{ t('profileManager.title') }}</h1>
      <n-space>
        <n-button type="primary" @click="handleAdd">{{ t('profileManager.addProfile') }}</n-button>
        <n-button @click="handleClose">{{ t('common.close') }}</n-button>
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
    <div class="current-profile no-profile" v-else>
      <div class="label">{{ t('profileManager.isDefault') }}</div>
      <div class="profile-info">
        <span class="icon">❌</span>
        <span class="name">{{ t('profileManager.noProfiles') }}</span>
      </div>
    </div>

    <!-- Profiles List -->
    <n-spin :show="loading">
      <div class="profiles-grid">
        <ProfileCard
          v-for="profile in profiles"
          :key="profile.id"
          :profile="profile"
          @edit="handleEdit"
          @delete="handleDelete"
          @set-default="handleSetDefault"
          @test="handleTest"
        />

        <n-empty v-if="!loading && profiles.length === 0" :description="t('profileManager.noProfilesHint')" />
      </div>
    </n-spin>

    <!-- Edit Modal -->
    <ProfileFormModal
      v-model:show="showEditModal"
      :profile="editingProfile"
      :is-edit="!!editingProfile"
      :providers="providers"
      @save="handleSave"
      @test="handleTestConnection"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useProfiles } from '@composables/useProfiles'
import { useProviders } from '@composables/useProviders'
import { useLocale } from '@composables/useLocale'
import ProfileCard from '@components/ProfileCard.vue'
import ProfileFormModal from './ProfileFormModal.vue'

const message = useMessage()
const dialog = useDialog()
const { t, initLocale } = useLocale()

const { profiles, loading, defaultProfile, loadProfiles, addProfile, updateProfile, deleteProfile, setDefault, testConnection } = useProfiles()
const { providers, loadProviders } = useProviders()

const showEditModal = ref(false)
const editingProfile = ref(null)

onMounted(async () => {
  await initLocale()
  await Promise.all([loadProfiles(), loadProviders()])
})

const handleClose = () => {
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
    serviceProvider: profile.serviceProvider,
    selectedModelTier: profile.selectedModelTier,
    modelMapping: profile.modelMapping ? {
      opus: profile.modelMapping.opus || '',
      sonnet: profile.modelMapping.sonnet || '',
      haiku: profile.modelMapping.haiku || ''
    } : null,
    useProxy: profile.useProxy,
    httpsProxy: profile.httpsProxy,
    httpProxy: profile.httpProxy
  }
  await handleTestConnection(config)
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
    showEditModal.value = false
    editingProfile.value = null
  } catch (err) {
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleTestConnection = async (config) => {
  message.info(t('common.connecting'))

  try {
    const result = await testConnection(config)
    if (result.success) {
      message.success(t('profileManager.testSuccess'))
    } else {
      message.error(t('profileManager.testFailed') + ': ' + result.message)
    }
  } catch (err) {
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
  padding-bottom: 20px;
  border-bottom: 2px solid var(--border-color, #f0f0f0);
  background: var(--bg-color-secondary, white);
  margin: -24px -24px 24px -24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
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
