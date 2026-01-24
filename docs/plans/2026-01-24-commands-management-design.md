# Commands 管理功能设计

## 概述

优化 Commands 管理功能，参考 Skills 管理模式，支持三级结构和完整 CRUD。

## 需求

| 级别 | 来源 | 操作权限 |
|------|------|----------|
| 项目命令 | `.claude/commands/` | 完整 CRUD |
| 用户命令 | `~/.claude/commands/` | 完整 CRUD（新增） |
| 插件命令 | 插件 `commands/` 目录 | 只读 |

功能：
- 新建、编辑、删除、复制
- 项目 ↔ 用户级互相复制/提升
- 导入/导出（单文件 `.md` 或批量 `.zip`）

## 与 Skills 的区别

| 类型 | 存储形式 | 示例 |
|------|----------|------|
| Skill | 文件夹 | `skills/my-skill/skill.md` |
| Command | 单文件 | `commands/my-command.md` |

## 后端模块设计

### 目录结构

```
src/main/managers/
├── commands-manager.js    # 向后兼容重导出
└── commands/
    ├── index.js           # CommandsManager 主类
    ├── crud.js            # CRUD 操作
    ├── import.js          # 导入功能
    └── export.js          # 导出功能
```

### 新增方法

```javascript
// crud.js
getUserCommands()
createCommand({ source, name, description, content, projectPath })
updateCommand({ source, commandId, name, description, content, projectPath })
deleteCommand({ source, commandId, projectPath })
copyCommand({ source, commandId, targetSource, newName, projectPath })
getCommandContent({ source, commandId, projectPath })

// import.js
importCommands({ sourcePath, targetSource, projectPath, overwrite })

// export.js
exportCommand({ source, commandId, outputPath, projectPath })
exportCommandsBatch({ commands, outputPath })
```

## 前端组件设计

### 目录结构

```
src/renderer/.../RightPanel/tabs/
├── CommandsTab.vue           # 主组件（精简后 ~350 行）
└── commands/
    ├── CommandGroup.vue      # 命令分组组件
    ├── CommandEditModal.vue  # 新建/编辑弹窗
    ├── CommandCopyModal.vue  # 复制/提升弹窗
    ├── CommandExportModal.vue # 导出弹窗
    └── CommandImportModal.vue # 导入弹窗
```

### 主组件结构

```vue
<template>
  <!-- 工具栏：搜索 + 导入/导出按钮 -->
  <div class="tab-toolbar">
    <n-input v-model:value="searchText" ... />
    <n-button-group>
      <n-button @click="showImportModal">📥</n-button>
      <n-button @click="showExportModal">📤</n-button>
    </n-button-group>
  </div>

  <!-- 项目命令 - 可编辑 -->
  <CommandGroup group-key="project" :editable="true" ... />

  <!-- 用户命令 - 可编辑 -->
  <CommandGroup group-key="user" :editable="true" ... />

  <!-- 插件命令 - 只读 -->
  <CommandGroup group-key="plugin" :editable="false" ... />
</template>
```

## IPC 接口

```javascript
// 读取
listCommandsAll(projectPath)       // 扩展支持用户级
getUserCommands()
getCommandContent(params)

// CRUD
createCommand(params)
updateCommand(params)
deleteCommand(params)
copyCommand(params)

// 导入/导出
exportCommand(params)
exportCommandsBatch(params)
importCommands(params)

// 辅助
openCommandsFolder(source, projectPath)
```

### 参数约定

```javascript
source: 'project' | 'user' | 'plugin'
commandId: string  // 命令文件名（不含 .md）
projectPath: string | null
```

## 导入/导出逻辑

### 导出

```javascript
// 单个导出 - 直接复制 .md 文件
exportCommand({ commandId, outputPath })

// 批量导出 - 打包为 .zip
exportCommandsBatch({ commands, outputPath })
```

### 导入

```javascript
// 支持三种来源
importCommands({ sourcePath, targetSource })

sourcePath 可以是:
1. 单个 .md 文件 → 直接导入
2. .zip 文件 → 解压后导入所有 .md
3. 文件夹 → 导入文件夹内所有 .md
```

## 实现步骤

### 阶段 1：后端扩展
1. 创建 `managers/commands/` 目录结构
2. 拆分 `commands-manager.js` 为 mixin 模块
3. 新增 `getUserCommands()` 方法
4. 实现 CRUD 方法 (create/update/delete/copy)
5. 实现导入/导出方法
6. 注册 IPC 通道

### 阶段 2：前端组件
7. 创建 `CommandGroup.vue` 组件
8. 创建 `CommandEditModal.vue`
9. 创建 `CommandCopyModal.vue`
10. 创建 `CommandImportModal.vue`
11. 创建 `CommandExportModal.vue`

### 阶段 3：主组件重构
12. 重构 `CommandsTab.vue`，集成新组件
13. 移除 `deprecated-badge` 旧版标记
14. 添加国际化文案

### 阶段 4：测试验证
15. 测试三级命令的 CRUD 操作
16. 测试导入/导出功能
