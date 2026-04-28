# IPC 通道清单

> Hydro Desktop v1.7.55+ | [← 返回架构文档](../ARCHITECTURE.md)

## 概览

- 当前清单按 Handler 模块与事件域整理，已移除废弃的独立助手与自定义模型通道。
- 类型：`handle` = invoke 请求-响应 | `on` = 单向发送/同步 | `send` = main→renderer 推送

## 通道索引

### config 域（config-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| config:get | handle | 获取完整配置 |
| config:save | handle | 保存配置 |
| config:getPath | handle | 获取配置文件路径 |
| config:getServiceProviders | handle | 获取服务商列表 |
| config:getMarketConfig | handle | 获取组件市场配置 |
| config:updateMarketConfig | handle | 更新组件市场配置 |
| config:getTimeout | handle | 获取超时设置 |
| config:updateTimeout | handle | 更新超时设置 |
| config:getMaxActiveSessions | handle | 获取最大活动会话数 |
| config:updateMaxActiveSessions | handle | 更新最大活动会话数 |
| config:getMaxHistorySessions | handle | 获取历史会话显示条数 |
| config:updateMaxHistorySessions | handle | 更新历史会话显示条数 |
| config:getAutocompactPctOverride | handle | 获取自动压缩阈值 |
| config:updateAutocompactPctOverride | handle | 更新自动压缩阈值 |
| config:getTerminalSettings | handle | 获取终端设置（字体等） |
| config:updateTerminalSettings | handle | 更新终端设置 |
| config:getMcpProxy | handle | 获取 MCP 代理配置 |
| config:updateMcpProxy | handle | 更新 MCP 代理配置 |
| config:ensureProxySupport | handle | 确保代理支持 |

### settings / theme / locale 域（config-handlers.js + plugin-handlers.js）

| 通道名 | 类型 | Handler | 简述 |
|--------|------|---------|------|
| settings:update | handle | config | 更新应用设置 |
| settings:broadcast | on | config | 广播设置变更到所有窗口 |
| theme:getSync | on(sync) | config | 同步获取主题（避免闪白） |
| locale:getSync | on(sync) | config | 同步获取语言 |
| settings:getAll | handle | plugin | 获取 Claude Code 全部设置 |
| settings:getPermissions | handle | plugin | 获取权限设置 |
| settings:addPermission | handle | plugin | 添加权限规则 |
| settings:updatePermission | handle | plugin | 更新权限规则 |
| settings:removePermission | handle | plugin | 删除权限规则 |
| settings:getEnv | handle | plugin | 获取环境变量 |
| settings:setEnv | handle | plugin | 设置环境变量 |
| settings:removeEnv | handle | plugin | 删除环境变量 |
| settings:getRaw | handle | plugin | 获取原始 settings JSON |
| settings:saveRaw | handle | plugin | 保存原始 settings JSON |

### api 域（config-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| api:getConfig | handle | 获取 API 配置 |
| api:updateConfig | handle | 更新 API 配置 |
| api:validate | handle | 验证 API 配置 |
| api:testConnection | handle | 测试 API 连接 |
| api:listProfiles | handle | 列出所有 Profile |
| api:getProfile | handle | 获取单个 Profile |
| api:addProfile | handle | 添加 Profile |
| api:updateProfile | handle | 更新 Profile |
| api:deleteProfile | handle | 删除 Profile |
| api:setDefault | handle | 设置默认 Profile |
| api:getCurrentProfile | handle | 获取默认 Profile |
| api:fetchOfficialModels | handle | 拉取官方模型列表 |

### provider / quickCommands 域（config-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| provider:list | handle | 列出服务商定义 |
| provider:get | handle | 获取单个服务商定义 |
| provider:add | handle | 添加服务商定义 |
| provider:update | handle | 更新服务商定义 |
| provider:delete | handle | 删除服务商定义 |
| quickCommands:list | handle | 列出快捷命令 |
| quickCommands:add | handle | 添加快捷命令 |
| quickCommands:update | handle | 更新快捷命令 |
| quickCommands:delete | handle | 删除快捷命令 |
### project 域（project-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| project:getAll | handle | 获取所有工程（含路径有效性检查） |
| project:getHidden | handle | 获取隐藏工程 |
| project:getById | handle | 获取单个工程 |
| project:create | handle | 创建工程（含目录选择） |
| project:open | handle | 打开已有目录为工程 |
| project:update | handle | 更新工程 |
| project:duplicate | handle | 复制工程配置 |
| project:hide | handle | 隐藏工程 |
| project:unhide | handle | 恢复隐藏工程 |
| project:delete | handle | 删除工程 |
| project:togglePinned | handle | 切换置顶 |
| project:touch | handle | 更新最后打开时间 |
| project:openFolder | handle | 打开工程目录 |
| project:checkPath | handle | 检查路径有效性 |
| project:newSession | handle | 新建会话（占位） |
| project:openSession | handle | 打开会话（占位） |

### session 域（session-handlers.js + ipc-handlers.js）

| 通道名 | 类型 | Handler | 简述 |
|--------|------|---------|------|
| session:sync | handle | session | 同步会话数据 |
| session:forceFullSync | handle | session | 强制全量同步 |
| session:getSyncStatus | handle | session | 获取同步状态 |
| session:clearInvalid | handle | session | 清除无效会话 |
| session:getProjects | handle | session | 获取所有项目 |
| session:getProjectSessions | handle | session | 获取项目会话列表 |
| session:getMessages | handle | session | 获取会话消息 |
| session:search | handle | session | 搜索会话（FTS5） |
| session:export | handle | session | 导出会话 |
| session:getStats | handle | session | 获取数据库统计 |
| session:getFileBasedSessions | handle | ipc | 实时读取文件会话 |
| session:getProjectSessionsFromDb | handle | ipc | 从数据库获取项目会话 |
| session:syncProjectSessions | handle | ipc | 文件→数据库增量同步 |
| session:updateTitle | handle | ipc | 更新会话标题 |
| session:deleteWithFile | handle | ipc | 删除会话（DB+文件） |
| session:deleteFile | handle | ipc | 删除会话文件 |

### tag / favorite 域（session-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| tag:create | handle | 创建标签 |
| tag:getAll | handle | 获取所有标签 |
| tag:delete | handle | 删除标签 |
| tag:addToSession | handle | 添加标签到会话 |
| tag:removeFromSession | handle | 从会话移除标签 |
| tag:getSessionTags | handle | 获取会话标签 |
| tag:getSessions | handle | 获取标签下的会话 |
| tag:addToMessage | handle | 添加标签到消息 |
| tag:removeFromMessage | handle | 从消息移除标签 |
| tag:getMessageTags | handle | 获取消息标签 |
| tag:getMessages | handle | 获取标签下的消息 |
| tag:getSessionTaggedMessages | handle | 获取会话中带标签的消息 |
| favorite:add | handle | 添加收藏 |
| favorite:remove | handle | 移除收藏 |
| favorite:check | handle | 检查是否收藏 |
| favorite:getAll | handle | 获取所有收藏 |
| favorite:updateNote | handle | 更新收藏备注 |

### queue 域（queue-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| queue:list | handle | 获取会话队列 |
| queue:add | handle | 添加到队列 |
| queue:update | handle | 更新队列项 |
| queue:delete | handle | 删除队列项 |
| queue:clear | handle | 清空队列 |
| queue:swap | handle | 交换队列项顺序 |

### scheduled-task 域（scheduled-task-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| scheduled-task:list | handle | 获取全部定时任务 |
| scheduled-task:create | handle | 创建定时任务 |
| scheduled-task:update | handle | 更新定时任务 |
| scheduled-task:delete | handle | 删除定时任务 |
| scheduled-task:runNow | handle | 立即执行一次定时任务 |
| scheduled-task:listRuns | handle | 获取定时任务运行历史 |

### terminal 域（ipc-handlers.js，旧版单终端）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| terminal:start | handle | 启动终端 |
| terminal:write | on | 写入终端数据 |
| terminal:resize | on | 调整终端大小 |
| terminal:kill | handle | 终止终端 |
| terminal:status | handle | 获取终端状态 |

### activeSession 域（active-session-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| activeSession:create | handle | 创建并启动会话 |
| activeSession:close | handle | 关闭会话（安全退出） |
| activeSession:disconnect | handle | 断开连接（保持后台） |
| activeSession:list | handle | 获取会话列表 |
| activeSession:get | handle | 获取单个会话 |
| activeSession:getByProject | handle | 获取项目的活动会话 |
| activeSession:write | on | 写入数据到会话 |
| activeSession:resize | on | 调整终端大小 |
| activeSession:focus | handle | 设置聚焦会话 |
| activeSession:getFocused | handle | 获取聚焦会话 ID |
| activeSession:setVisible | handle | 设置会话可见性 |
| activeSession:getRunningCount | handle | 获取运行中会话数 |
| activeSession:getSessionLimits | handle | 获取会话限制信息 |
| activeSession:rename | handle | 重命名会话 |

### agent 域（agent-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| agent:create | handle | 创建 Agent 会话 |
| agent:sendMessage | handle | 发送消息（异步流式） |
| agent:cancel | handle | 取消生成 |
| agent:close | handle | 关闭会话 |
| agent:reopen | handle | 恢复会话 |
| agent:get | handle | 获取单个会话 |
| agent:list | handle | 获取所有会话列表 |
| agent:rename | handle | 重命名会话 |
| agent:getMessages | handle | 获取消息历史 |
| agent:deleteConversation | handle | 物理删除对话 |
| agent:compact | handle | 压缩会话上下文 |
| agent:setModel | handle | 切换模型 |
| agent:getSupportedModels | handle | 获取支持的模型列表 |
| agent:getSupportedCommands | handle | 获取支持的命令列表 |
| agent:getAccountInfo | handle | 获取账户信息 |
| agent:getMcpServerStatus | handle | 获取 MCP 服务器状态 |
| agent:getInitResult | handle | 获取初始化结果 |
| agent:getOutputDir | handle | 获取输出目录路径 |
| agent:openOutputDir | handle | 打开输出目录 |
| agent:listOutputFiles | handle | 列出输出文件 |
| agent:listDir | handle | 列出目录内容 |
| agent:readFile | handle | 读取文件内容 |
| agent:saveFile | handle | 保存文件 |
| agent:openFile | handle | 用系统应用打开文件 |
| agent:readAbsolutePath | handle | 读取任意路径文件 |
| agent:saveQueue | handle | 保存队列消息 |
| agent:getQueue | handle | 读取队列消息 |
| agent:createFile | handle | 创建文件/文件夹 |
| agent:renameFile | handle | 重命名文件/文件夹 |
| agent:deleteFile | handle | 删除文件/文件夹 |
| agent:searchFiles | handle | 搜索文件（递归遍历 cwd，按文件名模糊匹配） |

### capabilities 域（capability-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| capabilities:fetch | handle | 拉取远程能力清单 |
| capabilities:install | handle | 安装能力 |
| capabilities:uninstall | handle | 卸载能力 |
| capabilities:enable | handle | 启用能力 |
| capabilities:disable | handle | 禁用能力 |
| capabilities:toggleComponent | handle | 切换组件禁用状态 |
| capabilities:getUpdateStatus | handle | 获取清单更新状态 |
| capabilities:clearUpdateBadge | handle | 清除更新徽章 |

### plugins 域（plugin-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| plugins:list | handle | 获取插件列表 |
| plugins:details | handle | 获取插件详情 |
| plugins:setEnabled | handle | 设置插件启用/禁用 |
| plugins:openFolder | handle | 打开插件目录 |
| plugins:openInstalledJson | handle | 打开 installed_plugins.json |
| plugins:openSettingsJson | handle | 打开 settings.json |
| plugins:cli:listAvailable | handle | 获取可用插件列表 |
| plugins:cli:install | handle | 安装插件 |
| plugins:cli:uninstall | handle | 卸载插件 |
| plugins:cli:update | handle | 更新插件 |
| plugins:cli:listMarketplaces | handle | 获取市场列表 |
| plugins:cli:addMarketplace | handle | 添加市场源 |
| plugins:cli:removeMarketplace | handle | 移除市场源 |
| plugins:cli:updateMarketplace | handle | 更新市场索引 |

### skills 域（plugin-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| skills:listGlobal | handle | 获取全局 Skills |
| skills:listProject | handle | 获取项目级 Skills |
| skills:listAll | handle | 获取所有 Skills |
| skills:delete | handle | 删除 Skill |
| skills:copy | handle | 复制 Skill |
| skills:getRawContent | handle | 获取 Skill 原始内容 |
| skills:createRaw | handle | 创建 Skill |
| skills:updateRaw | handle | 更新 Skill |
| skills:openFolder | handle | 打开 Skills 目录 |
| skills:validateImport | handle | 校验导入源 |
| skills:checkConflicts | handle | 检测导入冲突 |
| skills:import | handle | 导入 Skills |
| skills:export | handle | 导出单个 Skill |
| skills:exportBatch | handle | 批量导出 Skills |
| skills:market:fetchIndex | handle | 获取市场索引 |
| skills:market:install | handle | 安装市场 Skill |
| skills:market:installForce | handle | 强制安装市场 Skill |
| skills:market:checkUpdates | handle | 检查市场更新 |
| skills:market:update | handle | 更新市场 Skill |
| skills:market:installed | handle | 获取已安装市场 Skills |

### agents 域（plugin-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| agents:listUser | handle | 获取用户全局 Agents |
| agents:listProject | handle | 获取项目级 Agents |
| agents:listPlugin | handle | 获取插件级 Agents |
| agents:listAll | handle | 获取所有 Agents |
| agents:getRawContent | handle | 获取 Agent 原始内容 |
| agents:createRaw | handle | 创建 Agent |
| agents:updateRaw | handle | 更新 Agent |
| agents:delete | handle | 删除 Agent |
| agents:copy | handle | 复制 Agent |
| agents:rename | handle | 重命名 Agent |
| agents:openFolder | handle | 打开 Agents 目录 |
| agents:validateImport | handle | 校验导入源 |
| agents:checkConflicts | handle | 检测导入冲突 |
| agents:import | handle | 导入 Agents |
| agents:export | handle | 导出单个 Agent |
| agents:exportBatch | handle | 批量导出 Agents |
| agents:market:install | handle | 安装市场 Agent |
| agents:market:installForce | handle | 强制安装市场 Agent |
| agents:market:installed | handle | 获取已安装市场 Agents |
| agents:market:checkUpdates | handle | 检查市场 Agents 更新 |
| agents:market:update | handle | 更新市场 Agent |

### hooks 域（plugin-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| hooks:listGlobal | handle | 获取全局 Hooks |
| hooks:listProject | handle | 获取项目级 Hooks |
| hooks:listAll | handle | 获取所有 Hooks |
| hooks:getSchema | handle | 获取 Hooks Schema |
| hooks:create | handle | 创建 Hook |
| hooks:update | handle | 更新 Hook |
| hooks:delete | handle | 删除 Hook |
| hooks:copy | handle | 复制 Hook |
| hooks:getJson | handle | 获取 Hooks JSON 原始数据 |
| hooks:saveJson | handle | 保存 Hooks JSON 原始数据 |

### mcp 域（plugin-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| mcp:listAll | handle | 获取所有 MCP（四级分类） |
| mcp:listUser | handle | 获取 User scope MCP |
| mcp:listLocal | handle | 获取 Local scope MCP |
| mcp:listProject | handle | 获取 Project scope MCP |
| mcp:listPlugin | handle | 获取 Plugin scope MCP |
| mcp:create | handle | 创建 MCP |
| mcp:update | handle | 更新 MCP |
| mcp:delete | handle | 删除 MCP |
| mcps:market:previewConfig | handle | 预览市场 MCP 配置 |
| mcps:market:install | handle | 安装市场 MCP |
| mcps:market:installForce | handle | 强制安装市场 MCP |
| mcps:market:update | handle | 更新市场 MCP |
| mcps:applyProxyToAll | handle | 批量应用代理到所有 MCP |

### prompts / promptTags 域（prompt-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| prompts:list | handle | 列出提示词 |
| prompts:get | handle | 获取单个提示词 |
| prompts:create | handle | 创建提示词 |
| prompts:update | handle | 更新提示词 |
| prompts:delete | handle | 删除提示词 |
| prompts:incrementUsage | handle | 增加使用次数 |
| prompts:toggleFavorite | handle | 切换收藏状态 |
| prompts:addTag | handle | 添加标签到提示词 |
| prompts:removeTag | handle | 从提示词移除标签 |
| prompts:market:install | handle | 安装市场提示词 |
| prompts:market:installForce | handle | 强制安装市场提示词 |
| prompts:market:installed | handle | 获取已安装市场提示词 |
| prompts:market:update | handle | 更新市场提示词 |
| promptTags:list | handle | 列出提示词标签 |
| promptTags:create | handle | 创建提示词标签 |
| promptTags:update | handle | 更新提示词标签 |
| promptTags:delete | handle | 删除提示词标签 |

### file / dialog / shell / claude 域（plugin-handlers.js + ipc-handlers.js）

| 通道名 | 类型 | Handler | 简述 |
|--------|------|---------|------|
| file:openInEditor | handle | plugin | 用系统编辑器打开文件 |
| file:readJson | handle | plugin | 读取 JSON 文件 |
| file:writeJson | handle | plugin | 写入 JSON 文件 |
| file:read | handle | plugin | 读取文本文件 |
| file:write | handle | plugin | 写入文本文件 |
| dialog:selectFolder | handle | ipc | 选择目录 |
| dialog:selectDirectory | handle | ipc | 选择目录（带创建选项） |
| dialog:selectFile | handle | ipc | 选择单个文件 |
| dialog:selectFiles | handle | ipc | 选择多个文件 |
| dialog:saveFile | handle | ipc | 保存文件对话框 |
| shell:openExternal | handle | ipc | 打开外部 URL |
| shell:openPath | handle | ipc | 打开本地文件/目录 |
| claude:getSettingsPath | handle | ipc | 获取 Claude settings.json 路径 |
| claude:getProjectConfigPath | handle | ipc | 获取项目 settings.local.json 路径 |
| path:exists | handle | ipc | 判断路径是否存在 |

### window / sessionWatcher 域（ipc-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| window:openProfileManager | handle | 打开 Profile 管理窗口 |
| window:openGlobalSettings | handle | 打开全局设置窗口 |
| window:openAppearanceSettings | handle | 打开外观设置窗口 |
| window:openSettingsWorkbench | handle | 打开能力设置工作台 |
| window:openProviderManager | handle | 打开服务商管理窗口 |
| window:openSessionManager | handle | 打开会话查询窗口 |
| window:openUpdateManager | handle | 打开应用更新窗口 |
| window:openDingTalkSettings | handle | 打开钉钉设置窗口 |
| window:openNotebookWorkspace | handle | 打开 Notebook 工作台 |
| window:focusMainWindow | handle | 聚焦主窗口 |
| sessionWatcher:watch | handle | 监控项目会话文件变化 |
| sessionWatcher:stop | handle | 停止文件监控 |

### notebook 域（notebook-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| notebook:list | handle | 获取 Notebook 列表 |
| notebook:get | handle | 获取单个 Notebook |
| notebook:create | handle | 创建 Notebook |
| notebook:rename | handle | 重命名 Notebook |
| notebook:delete | handle | 删除 Notebook |
| notebook:bindSession | handle | 绑定 Notebook 与 Agent 会话 |
| notebook:restartSession | handle | 重启 Notebook 关联会话 |
| notebook:listSources | handle | 获取资料源列表 |
| notebook:addSource | handle | 新增资料源 |
| notebook:importFiles | handle | 批量导入资料文件 |
| notebook:updateSource | handle | 更新资料源元数据 |
| notebook:deleteSource | handle | 删除单个资料源 |
| notebook:deleteSources | handle | 批量删除资料源 |
| notebook:listAchievements | handle | 获取成果列表 |
| notebook:addAchievement | handle | 新增成果 |
| notebook:updateAchievement | handle | 更新成果元数据 |
| notebook:deleteAchievement | handle | 删除单个成果 |
| notebook:deleteAchievements | handle | 批量删除成果 |
| notebook:addAchievementToSource | handle | 将成果回填为资料源 |
| notebook:exportAchievement | handle | 导出成果文件 |
| notebook:readFileContent | handle | 读取 Notebook 相对路径文件 |
| notebook:writeFileContent | handle | 写回 Notebook 相对路径文件 |
| notebook:copyImageToClipboard | handle | 复制聊天图片到剪贴板 |
| notebook:saveChatImageToSource | handle | 将聊天图片归档到资料源 |
| notebook:saveChatImageToAchievement | handle | 将聊天图片归档到成果 |
| notebook:saveChatMarkdownToSource | handle | 将聊天 Markdown 归档到资料源 |
| notebook:saveChatMarkdownToAchievement | handle | 将聊天 Markdown 归档到成果 |
| notebook:finalizeAchievementText | handle | 在生成结束后写回成果正文 |
| notebook:setCopySourceFiles | handle | 设置生成时是否复制资料源文件 |
| notebook:sanitizeIndexes | handle | 清理失效资料源/成果索引 |
| notebook:addPathToSource | handle | 将文件路径加入资料源 |
| notebook:addPathToAchievement | handle | 将文件路径加入成果 |
| notebook:exportSource | handle | 导出资料源文件 |
| notebook:listTools | handle | 获取 Notebook 工具列表 |
| notebook:updateTool | handle | 更新 Notebook 工具 |
| notebook:addTool | handle | 新增 Notebook 工具 |
| notebook:deleteTool | handle | 删除 Notebook 工具 |
| notebook:fetchRemoteTools | handle | 拉取远程工具清单 |
| notebook:fetchPromptTemplateContent | handle | 获取市场提示词模板正文 |
| notebook:prepareGeneration | handle | 预创建本次工具生成上下文 |
| notebook:previewGeneration | handle | 预览工具生成使用的提示词与资料 |
| notebook:installTool | handle | 安装 Notebook 工具 |
| notebook:uninstallTool | handle | 卸载 Notebook 工具 |

### update 域（update-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| update:check | handle | 检查更新 |
| update:download | handle | 下载更新 |
| update:quitAndInstall | handle | 退出并安装 |
| update:getVersion | handle | 获取当前版本 |
| update:getStatus | handle | 获取更新状态 |
| update:getInstallError | handle | 获取安装失败信息 |

### dingtalk 域（dingtalk-handlers.js）

| 通道名 | 类型 | 简述 |
|--------|------|------|
| dingtalk:getStatus | handle | 获取钉钉桥接状态 |
| dingtalk:start | handle | 启动钉钉桥接 |
| dingtalk:stop | handle | 停止钉钉桥接 |
| dingtalk:restart | handle | 重启钉钉桥接 |
| dingtalk:updateConfig | handle | 更新钉钉配置 |

---

## 事件通道（main→renderer）

main 进程通过 `webContents.send()` 主动推送到渲染进程的事件。

### Terminal / 活动会话事件

| 事件名 | 发送位置 | 简述 |
|--------|---------|------|
| terminal:data | terminal-manager.js | 终端输出数据 |
| terminal:exit | terminal-manager.js | 终端退出 |
| terminal:error | terminal-manager.js | 终端错误 |
| session:data | active-session-manager.js | 会话输出数据 |
| session:started | active-session-manager.js | 会话启动 |
| session:exit | active-session-manager.js | 会话退出 |
| session:error | active-session-manager.js | 会话错误 |
| session:updated | active-session-manager.js | 会话状态更新 |
| session:fileChanged | session-file-watcher.js | 会话文件变化 |

### Agent 事件（agent-session-manager.js）

| 事件名 | 简述 |
|--------|------|
| agent:init | Agent 初始化完成 |
| agent:message | Agent 消息 |
| agent:stream | Agent 流式输出 |
| agent:result | Agent 结果 |
| agent:error | Agent 错误 |
| agent:statusChange | Agent 状态变更 |
| agent:toolProgress | 工具执行进度 |
| agent:systemStatus | 系统状态 |
| agent:renamed | 会话重命名 |
| agent:compacted | 上下文已压缩 |
| agent:usage | Token 用量 |
| agent:allSessionsClosed | 所有会话已关闭 |

### 设置 / 更新 / 钉钉事件

| 事件名 | 发送位置 | 简述 |
|--------|---------|------|
| settings:changed | config-handlers.js | 设置变更广播 |
| capabilities-update-available | ipc-handlers.js | 能力清单有更新 |
| update-checking | update-manager.js | 正在检查更新 |
| update-available | update-manager.js | 有可用更新 |
| update-not-available | update-manager.js | 无可用更新 |
| update-download-progress | update-manager.js | 下载进度 |
| update-downloaded | update-manager.js | 下载完成 |
| update-error | update-manager.js | 更新错误 |
| update-need-redownload | update-manager.js | 需要重新下载 |
| update-install-failed | update-manager.js | 安装失败 |
| scheduled-task:changed | scheduled-task-service.js | 定时任务状态或运行记录变更 |
| dingtalk:statusChange | dingtalk-bridge.js | 钉钉状态变更 |
| dingtalk:error | dingtalk-bridge.js | 钉钉错误 |
| dingtalk:messageReceived | dingtalk-bridge.js | 收到钉钉消息 |
| dingtalk:sessionCreated | dingtalk-bridge.js | 钉钉会话创建 |
| dingtalk:sessionClosed | dingtalk-bridge.js | 钉钉会话关闭 |
