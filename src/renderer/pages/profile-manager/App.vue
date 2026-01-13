<template>
  <n-config-provider :theme-overrides="claudeTheme">
    <n-message-provider>
      <n-dialog-provider>
        <n-notification-provider>
          <div class="profile-manager">
            <!-- Header -->
            <div class="header">
              <h1>API 配置管理</h1>
              <n-button @click="handleClose">关闭</n-button>
            </div>

            <!-- Current Default Profile -->
            <div class="current-profile" v-if="defaultProfile">
              <div class="label">默认配置（启动时推荐）</div>
              <div class="profile-info">
                <span class="icon">{{ defaultProfile.icon || '🟣' }}</span>
                <span class="name">{{ defaultProfile.name }}</span>
              </div>
            </div>
            <div class="current-profile no-profile" v-else>
              <div class="label">默认配置</div>
              <div class="profile-info">
                <span class="icon">❌</span>
                <span class="name">未配置</span>
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

                <n-empty v-if="!loading && profiles.length === 0" description="暂无配置，请添加新配置" />
              </div>
            </n-spin>

            <!-- Add Profile Card -->
            <div class="add-profile-card" @click="handleAdd">
              <span class="icon">➕</span>
              <span class="text">添加新配置</span>
            </div>

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
        </n-notification-provider>
      </n-dialog-provider>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useMessage, useDialog } from 'naive-ui'
import { claudeTheme } from '@theme/claude-theme'
import { useProfiles } from '@composables/useProfiles'
import { useProviders } from '@composables/useProviders'
import ProfileCard from '@components/ProfileCard.vue'
import ProfileFormModal from './components/ProfileFormModal.vue'

const message = useMessage()
const dialog = useDialog()

const { profiles, loading, defaultProfile, loadProfiles, addProfile, updateProfile, deleteProfile, setDefault, testConnection } = useProfiles()
const { providers, loadProviders } = useProviders()

const showEditModal = ref(false)
const editingProfile = ref(null)

onMounted(async () => {
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
    message.warning('无法删除默认配置')
    return
  }

  dialog.warning({
    title: '确认删除',
    content: '确定要删除此配置吗？此操作无法撤销。',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      try {
        await deleteProfile(profileId)
        message.success('配置已删除')
      } catch (err) {
        message.error('删除失败: ' + err.message)
      }
    }
  })
}

const handleSetDefault = async (profileId) => {
  try {
    await setDefault(profileId)
    message.success('已设为默认')
  } catch (err) {
    message.error('设置失败: ' + err.message)
  }
}

const handleTest = async (profile) => {
  await handleTestConnection(profile)
}

const handleSave = async (profileData) => {
  try {
    if (editingProfile.value?.id) {
      await updateProfile(editingProfile.value.id, profileData)
      message.success('配置已保存')
    } else {
      await addProfile(profileData)
      message.success('配置已添加')
    }
    showEditModal.value = false
    editingProfile.value = null
  } catch (err) {
    message.error('保存失败: ' + err.message)
  }
}

const handleTestConnection = async (config) => {
  message.info('正在测试连接...')

  try {
    const result = await testConnection(config)
    if (result.success) {
      message.success('连接测试成功！API 配置正常')
    } else {
      message.error('连接测试失败: ' + result.message)
    }
  } catch (err) {
    message.error('连接测试失败: ' + err.message)
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
  border-bottom: 2px solid #f0f0f0;
  background: white;
  margin: -24px -24px 24px -24px;
  padding: 24px;
  border-radius: 12px 12px 0 0;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #2c2825;
}

.current-profile {
  padding: 15px;
  background: #f8f9fa;
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
  color: #2c2825;
}

.profiles-grid {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
  min-height: 100px;
}

.add-profile-card {
  border: 2px dashed #FF6B35;
  border-radius: 8px;
  padding: 20px 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: 10px;
}

.add-profile-card:hover {
  background: #fff8f7;
  border-color: #FF5722;
}

.add-profile-card .icon {
  font-size: 24px;
  line-height: 1;
  color: #FF6B35;
}

.add-profile-card .text {
  font-size: 14px;
  font-weight: 500;
  color: #FF6B35;
}
</style>
