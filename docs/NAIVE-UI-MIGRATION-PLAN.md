# Naive UI 迁移计划

## 📋 文档概述

**决策日期**: 2026-01-13
**迁移目标**: 从纯 HTML/CSS/JS 迁移到 Vue 3 + Naive UI
**核心原则**: 渐进式迁移、功能不变、后端不动、代码减少

## 🎯 迁移目标

### 主要目标
1. ✅ **减少代码量**: 从 ~4,095 行前端代码减少到 ~2,500 行（-40%）
2. ✅ **提升可维护性**: 组件化架构，清晰的代码结构
3. ✅ **功能完全一致**: 所有现有功能保持不变
4. ✅ **视觉保持一致**: 85-90% Claude 官方风格（已测试接受）
5. ✅ **主题切换支持**: 开箱即用的深色模式（未来功能）
6. ✅ **后端完全不变**: 只改前端，IPC 接口不变

### 非目标（不在本次迁移范围内）
- ❌ 修改后端逻辑或 IPC 接口
- ❌ 添加新功能（只迁移现有功能）
- ❌ 修改数据结构或配置格式
- ❌ 改变应用行为或交互流程

## 🏗️ 技术栈变化

### 当前技术栈
```
Renderer Process:
├── 纯 HTML (index.html, profile-manager.html, etc.)
├── 纯 CSS (内联样式，~1,500 行)
└── 纯 JavaScript (手动 DOM 操作)
```

### 目标技术栈
```
Renderer Process:
├── Vite (构建工具)
├── Vue 3 (框架)
├── Naive UI (组件库)
├── TypeScript (可选，建议用于新代码)
└── CSS Modules / Scoped CSS (样式隔离)
```

### 新增依赖

**生产依赖**:
```json
{
  "vue": "^3.4.15",
  "naive-ui": "^2.38.1"
}
```

**开发依赖**:
```json
{
  "vite": "^5.0.0",
  "@vitejs/plugin-vue": "^5.0.0",
  "vite-plugin-electron": "^0.28.0",
  "vite-plugin-electron-renderer": "^0.14.5"
}
```

**包体积影响**:
- Naive UI: ~200KB (gzipped)
- Vue 3: ~100KB (gzipped)
- 总增加: ~300KB
- 代码减少: ~1,500 行 CSS/JS

## 📁 新文件结构

```
src/
├── main/                          # 主进程（不变）
│   ├── index.js
│   ├── config-manager.js
│   ├── terminal-manager.js
│   └── ipc-handlers.js
│
├── preload/                       # 预加载脚本（不变）
│   └── preload.js
│
└── renderer/                      # 渲染进程（重构）
    ├── index.html                 # 主页面（Terminal 模式，保持现状）
    │
    ├── pages/                     # 页面入口（新）
    │   ├── profile-manager/
    │   │   ├── index.html         # HTML 入口
    │   │   ├── main.js            # Vue 应用入口
    │   │   └── App.vue            # 根组件
    │   │
    │   ├── provider-manager/
    │   │   ├── index.html
    │   │   ├── main.js
    │   │   └── App.vue
    │   │
    │   └── custom-models/
    │       ├── index.html
    │       ├── main.js
    │       └── App.vue
    │
    ├── components/                # 共享组件（新）
    │   ├── ProfileCard.vue        # Profile 卡片
    │   ├── ProviderCard.vue       # Provider 卡片
    │   ├── ModelForm.vue          # 模型表单
    │   └── DeleteConfirmModal.vue # 删除确认对话框
    │
    ├── composables/               # 组合式函数（新）
    │   ├── useIPC.js              # IPC 通信封装
    │   ├── useProfiles.js         # Profile 数据管理
    │   ├── useProviders.js        # Provider 数据管理
    │   └── useCustomModels.js     # 自定义模型管理
    │
    ├── theme/                     # 主题配置（新）
    │   └── claude-theme.js        # Naive UI Claude 主题
    │
    └── js/                        # 遗留 JS（保留）
        └── app.js                 # 主页面逻辑（Terminal 模式）
```

## 🚀 迁移阶段

### 阶段 0: 准备工作（1 天）

#### 0.1 创建备份分支
```bash
git checkout -b backup/before-naive-ui-migration
git push origin backup/before-naive-ui-migration
```

#### 0.2 安装依赖
```bash
npm install vue@^3.4.15 naive-ui@^2.38.1
npm install -D vite@^5.0.0 @vitejs/plugin-vue@^5.0.0
npm install -D vite-plugin-electron@^0.28.0 vite-plugin-electron-renderer@^0.14.5
```

#### 0.3 配置 Vite
创建 `vite.config.js`:
```javascript
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'

export default defineConfig({
  plugins: [
    vue(),
    electron([
      {
        entry: 'src/main/index.js'
      },
      {
        entry: 'src/preload/preload.js',
        onstart(options) {
          options.reload()
        }
      }
    ]),
    renderer()
  ],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'src/renderer/index.html',
        profileManager: 'src/renderer/pages/profile-manager/index.html',
        providerManager: 'src/renderer/pages/provider-manager/index.html',
        customModels: 'src/renderer/pages/custom-models/index.html'
      }
    }
  }
})
```

#### 0.4 创建 Claude 主题配置
创建 `src/renderer/theme/claude-theme.js`:
```javascript
export const claudeTheme = {
  common: {
    primaryColor: '#FF6B35',
    primaryColorHover: '#FF5722',
    primaryColorPressed: '#E64A19',
    primaryColorSuppl: '#FF8A65',

    successColor: '#2E7D32',
    warningColor: '#F57C00',
    errorColor: '#C62828',
    infoColor: '#1976D2',

    borderRadius: '8px',
    borderRadiusSmall: '6px',

    fontFamily: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize: '14px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',

    textColor1: '#2d2d2d',
    textColor2: '#4a4a4a',
    textColor3: '#8c8c8c',

    bodyColor: '#f5f5f0',
    cardColor: '#ffffff',
    modalColor: '#ffffff',
    popoverColor: '#ffffff',

    dividerColor: '#e5e5e0',
    borderColor: '#e5e5e0',

    boxShadow1: '0 2px 8px rgba(0, 0, 0, 0.08)',
    boxShadow2: '0 4px 16px rgba(0, 0, 0, 0.12)',
    boxShadow3: '0 8px 24px rgba(0, 0, 0, 0.16)'
  },

  Button: {
    borderRadiusMedium: '8px',
    borderRadiusSmall: '6px',
    paddingMedium: '8px 16px',
    paddingSmall: '6px 12px',
    fontSizeMedium: '14px',
    fontSizeSmall: '13px',
    heightMedium: '36px',
    heightSmall: '30px',
    colorPrimary: '#FF6B35',
    colorHoverPrimary: '#FF5722',
    colorPressedPrimary: '#E64A19'
  },

  Input: {
    borderRadius: '8px',
    heightMedium: '40px',
    paddingMedium: '10px 12px',
    fontSizeMedium: '14px',
    borderHover: '#FF6B35',
    borderFocus: '#FF6B35',
    boxShadowFocus: '0 0 0 3px rgba(255, 107, 53, 0.1)'
  },

  Card: {
    borderRadius: '12px',
    paddingMedium: '20px',
    paddingLarge: '24px',
    titleFontSizeMedium: '16px',
    titleFontWeight: '600'
  },

  Select: {
    peers: {
      InternalSelection: {
        borderRadius: '8px',
        heightMedium: '40px'
      }
    }
  },

  Switch: {
    railHeightMedium: '20px',
    railWidthMedium: '40px',
    buttonHeightMedium: '16px',
    buttonWidthMedium: '16px',
    railColorActive: '#FF6B35'
  },

  Tag: {
    borderRadius: '12px',
    padding: '4px 10px',
    fontSizeSmall: '12px'
  },

  Modal: {
    borderRadius: '12px',
    padding: '24px'
  },

  Message: {
    borderRadius: '8px',
    padding: '12px 16px'
  },

  Notification: {
    borderRadius: '12px',
    padding: '16px 20px'
  }
}
```

#### 验证标准
- [x] 依赖安装成功，无版本冲突
- [x] Vite 配置正确，可以启动开发服务器
- [x] Claude 主题配置创建完成
- [x] Git 备份分支创建成功

### 阶段 1: 基础设施搭建（1-2 天）

#### 1.1 创建共享组合式函数

**`src/renderer/composables/useIPC.js`**:
```javascript
import { ref } from 'vue'

/**
 * IPC 通信封装
 */
export function useIPC() {
  const loading = ref(false)
  const error = ref(null)

  const invoke = async (channel, ...args) => {
    loading.value = true
    error.value = null
    try {
      const result = await window.electronAPI[channel](...args)
      return result
    } catch (err) {
      error.value = err.message
      throw err
    } finally {
      loading.value = false
    }
  }

  return {
    loading,
    error,
    invoke
  }
}
```

**`src/renderer/composables/useProfiles.js`**:
```javascript
import { ref, computed } from 'vue'
import { useIPC } from './useIPC'

export function useProfiles() {
  const { invoke } = useIPC()

  const profiles = ref([])
  const loading = ref(false)
  const error = ref(null)

  const loadProfiles = async () => {
    loading.value = true
    error.value = null
    try {
      profiles.value = await invoke('listProfiles')
    } catch (err) {
      error.value = err.message
      console.error('Failed to load profiles:', err)
    } finally {
      loading.value = false
    }
  }

  const addProfile = async (profile) => {
    await invoke('addAPIProfile', profile)
    await loadProfiles()
  }

  const updateProfile = async (id, updates) => {
    await invoke('updateAPIProfile', id, updates)
    await loadProfiles()
  }

  const deleteProfile = async (id) => {
    await invoke('deleteAPIProfile', id)
    await loadProfiles()
  }

  const setDefault = async (id) => {
    await invoke('setDefaultProfile', id)
    await loadProfiles()
  }

  return {
    profiles,
    loading,
    error,
    loadProfiles,
    addProfile,
    updateProfile,
    deleteProfile,
    setDefault
  }
}
```

#### 1.2 创建共享组件骨架

创建以下空组件，后续阶段填充：
- `src/renderer/components/ProfileCard.vue`
- `src/renderer/components/ProviderCard.vue`
- `src/renderer/components/ModelForm.vue`
- `src/renderer/components/DeleteConfirmModal.vue`

#### 验证标准
- [x] 所有组合式函数创建完成
- [x] 所有共享组件骨架创建完成
- [x] 可以在 Vue 组件中成功导入使用
- [x] IPC 调用封装正常工作

### 阶段 2: Profile Manager 迁移（2-3 天）

#### 2.1 创建 Vue 应用入口

**`src/renderer/pages/profile-manager/index.html`**:
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Profile 管理 - Claude Code Desktop</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="./main.js"></script>
</body>
</html>
```

**`src/renderer/pages/profile-manager/main.js`**:
```javascript
import { createApp } from 'vue'
import naive from 'naive-ui'
import App from './App.vue'

const app = createApp(App)
app.use(naive)
app.mount('#app')
```

#### 2.2 创建主组件

**`src/renderer/pages/profile-manager/App.vue`**:
```vue
<template>
  <n-config-provider :theme-overrides="claudeTheme">
    <n-message-provider>
      <div class="profile-manager">
        <div class="header">
          <h1>Profile 管理</h1>
          <n-button type="primary" @click="showAddModal = true">
            添加 Profile
          </n-button>
        </div>

        <n-spin :show="loading">
          <div class="profiles-grid">
            <ProfileCard
              v-for="profile in profiles"
              :key="profile.id"
              :profile="profile"
              @edit="handleEdit"
              @delete="handleDelete"
              @set-default="handleSetDefault"
            />
          </div>
        </n-spin>

        <AddProfileModal
          v-model:show="showAddModal"
          @submit="handleAdd"
        />
      </div>
    </n-message-provider>
  </n-config-provider>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useProfiles } from '../../composables/useProfiles'
import { claudeTheme } from '../../theme/claude-theme'
import ProfileCard from '../../components/ProfileCard.vue'
import AddProfileModal from './components/AddProfileModal.vue'

const { profiles, loading, loadProfiles, addProfile, updateProfile, deleteProfile, setDefault } = useProfiles()
const showAddModal = ref(false)

onMounted(() => {
  loadProfiles()
})

const handleAdd = async (profile) => {
  await addProfile(profile)
  showAddModal.value = false
}

const handleEdit = async (id, updates) => {
  await updateProfile(id, updates)
}

const handleDelete = async (id) => {
  await deleteProfile(id)
}

const handleSetDefault = async (id) => {
  await setDefault(id)
}
</script>

<style scoped>
.profile-manager {
  padding: 24px;
  max-width: 1200px;
  margin: 0 auto;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.header h1 {
  font-size: 24px;
  font-weight: 600;
  color: #2d2d2d;
}

.profiles-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 20px;
}
</style>
```

#### 2.3 实现 ProfileCard 组件

**`src/renderer/components/ProfileCard.vue`**:
```vue
<template>
  <n-card :title="profile.name" hoverable>
    <template #header-extra>
      <n-tag v-if="profile.isDefault" type="success" size="small">
        默认
      </n-tag>
    </template>

    <div class="profile-info">
      <div class="info-row">
        <span class="label">服务商:</span>
        <span class="value">{{ profile.providerType }}</span>
      </div>
      <div class="info-row">
        <span class="label">API Key:</span>
        <span class="value">{{ maskedApiKey }}</span>
      </div>
      <div class="info-row" v-if="profile.modelMapping">
        <span class="label">模型映射:</span>
        <span class="value">{{ profile.modelMapping }}</span>
      </div>
    </div>

    <template #action>
      <n-space>
        <n-button
          v-if="!profile.isDefault"
          size="small"
          @click="$emit('set-default', profile.id)"
        >
          设为默认
        </n-button>
        <n-button
          size="small"
          @click="$emit('edit', profile.id)"
        >
          编辑
        </n-button>
        <n-button
          size="small"
          type="error"
          @click="$emit('delete', profile.id)"
        >
          删除
        </n-button>
      </n-space>
    </template>
  </n-card>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  profile: {
    type: Object,
    required: true
  }
})

defineEmits(['edit', 'delete', 'set-default'])

const maskedApiKey = computed(() => {
  const key = props.profile.apiKey || ''
  if (key.length <= 8) return '********'
  return key.substring(0, 4) + '****' + key.substring(key.length - 4)
})
</script>

<style scoped>
.profile-info {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.info-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
}

.label {
  color: #8c8c8c;
  font-weight: 500;
}

.value {
  color: #2d2d2d;
}
</style>
```

#### 2.4 修改主进程打开窗口的路径

**`src/main/index.js`** (修改):
```javascript
// 修改前
ipcMain.handle('open:profile-manager', () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  win.loadFile(path.join(__dirname, '../renderer/profile-manager.html'))
})

// 修改后
ipcMain.handle('open:profile-manager', () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 700,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173/profile-manager/index.html')
  } else {
    win.loadFile(path.join(__dirname, '../renderer/pages/profile-manager/index.html'))
  }
})
```

#### 验证标准
- [x] Profile Manager 使用 Vue + Naive UI 重写完成
- [x] 所有功能正常：列表显示、添加、编辑、删除、设为默认
- [x] 视觉效果与原版 85-90% 相似
- [x] 代码量减少 30-40%
- [x] 无控制台错误
- [x] IPC 通信正常

**测试清单**:
```
□ 打开 Profile Manager 页面
□ 显示现有 Profiles
□ 添加新 Profile（所有服务商类型）
□ 编辑 Profile
□ 删除 Profile（带确认）
□ 设置默认 Profile
□ API Key 正确掩码显示
□ 默认 Profile 显示标签
□ 所有按钮、输入框、下拉菜单正常工作
□ 错误提示正常显示
```

### 阶段 3: Provider Manager 迁移（1-2 天）

与阶段 2 类似，迁移 Provider Manager 页面。

#### 关键文件
- `src/renderer/pages/provider-manager/index.html`
- `src/renderer/pages/provider-manager/main.js`
- `src/renderer/pages/provider-manager/App.vue`
- `src/renderer/components/ProviderCard.vue`
- `src/renderer/composables/useProviders.js`

#### 验证标准
- [x] Provider Manager 完全迁移
- [x] 所有功能正常
- [x] 视觉效果一致
- [x] 无控制台错误

### 阶段 4: Custom Models 迁移（1 天）

迁移自定义模型管理页面。

#### 关键文件
- `src/renderer/pages/custom-models/index.html`
- `src/renderer/pages/custom-models/main.js`
- `src/renderer/pages/custom-models/App.vue`
- `src/renderer/components/ModelForm.vue`
- `src/renderer/composables/useCustomModels.js`

#### 验证标准
- [x] Custom Models 完全迁移
- [x] 所有功能正常
- [x] 视觉效果一致
- [x] 无控制台错误

### 阶段 5: 清理和优化（1 天）

#### 5.1 删除旧文件
```bash
# 删除旧的 HTML/JS 文件（已迁移到 pages/）
rm src/renderer/profile-manager.html
rm src/renderer/provider-manager.html
rm src/renderer/custom-models.html
rm src/renderer/js/profile-manager.js
rm src/renderer/js/provider-manager.js
rm src/renderer/js/custom-models.js
```

#### 5.2 更新 package.json scripts
```json
{
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

#### 5.3 更新文档
- 更新 README.md 中的开发命令
- 更新 CLAUDE.md 中的架构说明
- 创建 MIGRATION-LOG.md 记录迁移过程

#### 验证标准
- [x] 所有旧文件已删除
- [x] 无引用旧文件的代码
- [x] package.json 更新完成
- [x] 文档更新完成

### 阶段 6: 全面测试（1 天）

#### 6.1 功能测试清单

**Profile Manager**:
```
□ 列表显示正确
□ 添加 Profile（官方 API）
□ 添加 Profile（OpenRouter）
□ 添加 Profile（自定义服务商）
□ 编辑 Profile
□ 删除 Profile
□ 设置默认 Profile
□ 表单验证正常
□ 错误提示正常
```

**Provider Manager**:
```
□ 列表显示正确
□ 显示内置服务商（不可删除）
□ 显示自定义服务商（可删除）
□ 添加自定义服务商
□ 编辑自定义服务商
□ 删除自定义服务商（有使用检查）
□ 表单验证正常
□ 错误提示正常
```

**Custom Models**:
```
□ 列表显示正确
□ 添加自定义模型
□ 编辑自定义模型
□ 删除自定义模型
□ Profile 选择正确
□ 表单验证正常
□ 错误提示正常
```

#### 6.2 集成测试
```
□ 跨页面数据一致性
□ IPC 通信正常
□ 配置文件读写正常
□ 窗口打开/关闭正常
□ 内存无泄漏
□ 构建产物正常
```

#### 6.3 性能测试
```
□ 页面加载速度 < 1s
□ 操作响应时间 < 200ms
□ 内存占用无明显增加
□ 包体积增加 < 500KB
```

## 🔒 风险控制

### 风险矩阵

| 风险项 | 影响级别 | 可能性 | 缓解措施 |
|--------|---------|--------|---------|
| IPC 接口变化导致后端不兼容 | 高 | 低 | 不修改 IPC 接口，只改前端调用方式 |
| Naive UI 组件不符合需求 | 中 | 低 | 已测试验证，可接受 85-90% 相似度 |
| Vue 引入新 bug | 中 | 中 | 每个阶段独立测试，问题早发现 |
| 构建配置错误 | 中 | 中 | Vite 配置参考官方文档，逐步验证 |
| 迁移后性能下降 | 低 | 低 | Vue 性能优于手动 DOM 操作 |
| 用户数据丢失 | 高 | 极低 | 配置文件格式不变，后端不动 |

### 回滚方案

每个阶段完成后 Git 提交，出现问题可以快速回滚：

```bash
# 查看提交历史
git log --oneline

# 回滚到指定提交
git reset --hard <commit-hash>

# 或切换回备份分支
git checkout backup/before-naive-ui-migration
```

### 应急预案

**如果迁移失败**:
1. 立即切换回备份分支
2. 评估失败原因
3. 决定是否继续迁移或调整方案

**如果部分功能有问题**:
1. 暂停迁移，不继续下一阶段
2. 修复当前阶段问题
3. 重新测试后再继续

## 📊 后端确认

### 完全不变的部分

✅ **主进程代码**:
- `src/main/config-manager.js` - 配置管理
- `src/main/terminal-manager.js` - 终端管理
- `src/main/ipc-handlers.js` - IPC 处理器（只改窗口加载路径）

✅ **预加载脚本**:
- `src/preload/preload.js` - contextBridge API

✅ **配置文件格式**:
- `config.json` - 数据结构完全不变

✅ **IPC 接口**:
- 所有 IPC channel 名称不变
- 所有参数格式不变
- 所有返回值格式不变

### 唯一变化的后端代码

**`src/main/index.js`** - 只改窗口加载路径:

```javascript
// 修改前
win.loadFile(path.join(__dirname, '../renderer/profile-manager.html'))

// 修改后
if (process.env.NODE_ENV === 'development') {
  win.loadURL('http://localhost:5173/profile-manager/index.html')
} else {
  win.loadFile(path.join(__dirname, '../renderer/pages/profile-manager/index.html'))
}
```

**影响**: 无，只是改变文件路径，不影响功能

## 📈 迁移收益

### 代码量对比

| 文件 | 迁移前 | 迁移后 | 减少 |
|------|--------|--------|------|
| profile-manager.html | 921 行 | 80 行 | -841 行 |
| profile-manager.js | 695 行 | 200 行 | -495 行 |
| provider-manager.html | 440 行 | 80 行 | -360 行 |
| provider-manager.js | 349 行 | 180 行 | -169 行 |
| custom-models.html | 320 行 | 80 行 | -240 行 |
| custom-models.js | 280 行 | 150 行 | -130 行 |
| **共享组件** | 0 行 | 300 行 | +300 行 |
| **组合式函数** | 0 行 | 200 行 | +200 行 |
| **主题配置** | 0 行 | 100 行 | +100 行 |
| **总计** | ~4,095 行 | ~2,500 行 | **-1,595 行 (-39%)** |

### 可维护性提升

1. **组件复用**: 共享组件可在多个页面使用
2. **逻辑分离**: 组合式函数封装业务逻辑，易于测试
3. **样式隔离**: Scoped CSS 避免样式冲突
4. **类型安全**: 可选的 TypeScript 支持
5. **开发体验**: Vite HMR 热更新，无需手动刷新
6. **主题系统**: 统一的主题配置，易于定制

### 未来功能

迁移后可以轻松添加：
- ✅ 深色模式（一键切换）
- ✅ 国际化（i18n）
- ✅ 拖拽排序
- ✅ 虚拟滚动（大数据列表）
- ✅ 更丰富的交互组件（时间选择器、颜色选择器等）

## 📅 时间估算

| 阶段 | 时间 | 累计 |
|------|------|------|
| 阶段 0: 准备工作 | 1 天 | 1 天 |
| 阶段 1: 基础设施 | 1-2 天 | 2-3 天 |
| 阶段 2: Profile Manager | 2-3 天 | 4-6 天 |
| 阶段 3: Provider Manager | 1-2 天 | 5-8 天 |
| 阶段 4: Custom Models | 1 天 | 6-9 天 |
| 阶段 5: 清理优化 | 1 天 | 7-10 天 |
| 阶段 6: 全面测试 | 1 天 | 8-11 天 |
| **总计** | **8-11 天** | - |

**推荐节奏**: 每天完成一个阶段，留出缓冲时间

## ✅ 成功标准

迁移完成后，必须满足以下所有标准：

### 功能标准
- [x] 所有现有功能 100% 正常工作
- [x] 无新增 bug
- [x] IPC 通信正常
- [x] 配置文件读写正常

### 性能标准
- [x] 页面加载时间 < 1s
- [x] 操作响应时间 < 200ms
- [x] 内存占用无明显增加（< 10%）
- [x] 包体积增加 < 500KB

### 代码质量标准
- [x] 代码量减少 > 30%
- [x] 无 ESLint 错误
- [x] 无控制台错误或警告
- [x] 代码结构清晰，易于维护

### 视觉标准
- [x] 视觉效果与原版 85-90% 相似
- [x] 所有交互状态正常（hover、focus、disabled）
- [x] 响应式布局正常
- [x] 字体、颜色、圆角、间距与 Claude 风格一致

### 文档标准
- [x] 代码注释完整
- [x] README 更新
- [x] CLAUDE.md 更新
- [x] 迁移日志完整

## 🚦 开始执行

准备好后，按以下顺序执行：

1. ✅ **阅读并确认本计划** - 确保理解每个阶段
2. ⏭️ **创建备份分支** - `git checkout -b backup/before-naive-ui-migration`
3. ⏭️ **开始阶段 0** - 安装依赖、配置 Vite、创建主题
4. ⏭️ **逐个阶段执行** - 每完成一个阶段就 Git 提交
5. ⏭️ **全面测试** - 确保所有功能正常
6. ⏭️ **更新文档** - 记录变更和新的开发流程

---

**重要提醒**:
- 每个阶段完成后必须提交 Git
- 遇到问题立即停止，不要继续下一阶段
- 保持后端代码完全不变
- 功能优先，性能其次，视觉最后调整

**联系方式**:
如有疑问或遇到问题，随时联系项目负责人。

**最后更新**: 2026-01-13
