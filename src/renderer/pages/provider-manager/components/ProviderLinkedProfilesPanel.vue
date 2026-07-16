<template>
  <section class="linked-profiles-panel">
    <div class="panel-header">
      <div>
        <h2>{{ t('providerManager.linkedProfilesTitle', { provider: provider.name }) }}</h2>
        <p class="panel-subtitle">{{ t('providerManager.linkedProfilesSubtitle') }}</p>
      </div>
      <n-space>
        <n-button type="primary" @click="handleAddProfile">
          {{ t('providerManager.addLinkedProfile') }}
        </n-button>
      </n-space>
    </div>

    <div class="panel-summary">
      <span class="summary-item">{{ t('providerManager.linkedProfiles') }}: {{ linkedProfiles.length }}</span>
      <span class="summary-item">{{ t('providerManager.providerId') }}: {{ provider.id }}</span>
    </div>

    <n-spin :show="loading">
      <div class="profiles-grid" v-if="linkedProfiles.length > 0">
        <ProfileCard
          v-for="profile in linkedProfiles"
          :key="profile.id"
          :profile="profile"
          :testing="testingProfileId === profile.id"
          @edit="handleEditProfile"
          @delete="handleDeleteProfile"
          @set-default="handleSetDefault"
          @test="handleTest"
        />
      </div>

      <n-empty
        v-else-if="!loading"
        :description="t('providerManager.noLinkedProfiles')"
      />
    </n-spin>

    <ProfileFormModal
      v-model:show="showEditModal"
      :profile="editingProfile"
      :is-edit="!!editingProfile"
      :providers="providers"
      :testing="testingModal"
      :locked-provider-id="provider.id"
      @save="handleSave"
      @test="handleModalTest"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { useLocale } from '@composables/useLocale'
import { useProfiles } from '@composables/useProfiles'
import ProfileCard from '@components/ProfileCard.vue'
import ProfileFormModal from '@/pages/profile-manager/components/ProfileFormModal.vue'

const props = defineProps({
  provider: {
    type: Object,
    required: true
  },
    providers: {
      type: Array,
      default: () => []
    },
    refreshKey: {
      type: Number,
      default: 0
    }
  })

const { t } = useLocale()
const message = useMessage()
const dialog = useDialog()

const {
  profiles,
  loading,
  loadProfiles,
  addProfile,
  updateProfile,
  deleteProfile,
  setDefault,
  testConnection
} = useProfiles()

const showEditModal = ref(false)
const editingProfile = ref(null)
const testingProfileId = ref(null)
const testingModal = ref(false)

const linkedProfiles = computed(() => (
  profiles.value.filter(profile => profile.serviceProvider === props.provider.id)
))

watch(() => props.provider?.id, async () => {
  await loadProfiles()
}, { immediate: true })

watch(() => props.refreshKey, async () => {
  await loadProfiles()
})

const getInitialProfileData = () => ({
  name: props.provider.name,
  icon: '🟣',
  serviceProvider: props.provider.id,
  authType: 'auth_token',
  authToken: '',
  baseUrl: props.provider.baseUrl || '',
  selectedModelId: Array.isArray(props.provider.defaultModels) && props.provider.defaultModels.length > 0
    ? props.provider.defaultModels[0]
    : '',
  requestTimeout: 120000,
  disableNonessentialTraffic: true,
  useProxy: false,
  httpsProxy: '',
  httpProxy: '',
  description: ''
})

const handleAddProfile = () => {
  editingProfile.value = null
  showEditModal.value = true
}

const handleEditProfile = (profile) => {
  editingProfile.value = { ...profile }
  showEditModal.value = true
}

const handleDeleteProfile = async (profileId) => {
  const profile = profiles.value.find(item => item.id === profileId)
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
        await loadProfiles()
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
    await loadProfiles()
    message.success(t('messages.saveSuccess'))
  } catch (err) {
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleTest = async (profile) => {
  const config = {
    baseUrl: profile.baseUrl,
    authToken: profile.authToken,
    authType: profile.authType,
    serviceProvider: profile.serviceProvider,
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
    const nextData = {
      ...profileData,
      serviceProvider: props.provider.id
    }

    if (editingProfile.value?.id) {
      await updateProfile(editingProfile.value.id, nextData)
    } else {
      await addProfile({
        ...getInitialProfileData(),
        ...nextData
      })
    }

    await loadProfiles()
    showEditModal.value = false
    editingProfile.value = null
    message.success(t('profileManager.saveSuccess'))
  } catch (err) {
    message.error(t('messages.saveFailed') + ': ' + err.message)
  }
}

const handleModalTest = async (config) => {
  testingModal.value = true
  try {
    await handleTestConnection({
      ...config,
      serviceProvider: props.provider.id
    })
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
.linked-profiles-panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.panel-header h2 {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.3;
}

.panel-subtitle {
  margin: 4px 0 0;
  color: var(--text-color-2);
  font-size: 13px;
  line-height: 1.7;
  text-align: justify;
  text-justify: inter-ideograph;
}

.panel-summary {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.summary-item {
  display: inline-flex;
  align-items: center;
  padding: 4px 9px;
  border-radius: 999px;
  background: var(--bg-color-tertiary, #f5f5f0);
  color: var(--text-color-2);
  font-size: 12px;
}

.profiles-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 12px;
}

@media (max-width: 800px) {
  .panel-header {
    flex-direction: column;
  }

  .profiles-grid {
    grid-template-columns: 1fr;
  }
}
</style>
