function buildToolResult(payload) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2)
    }]
  }
}

function mergeSystemPrompts(...prompts) {
  const normalized = prompts
    .map(prompt => typeof prompt === 'string' ? prompt.trim() : '')
    .filter(Boolean)

  return normalized.length > 0 ? normalized.join(' ') : undefined
}

const EMBEDDED_APP_SERVER_NAME = 'embeddedapp'
const EMBEDDED_APP_TOOL_NAMES = [
  'context_get',
  'command_execute'
]
const HYDROLOGY_WORKBENCH_APP_ID = 'hydrology-workbench'
const HYDROLOGY_WORKBENCH_TOOL_NAMES = [
  'hydrology_context_get',
  'hydrology_current_station_get',
  'hydrology_tab_open',
  'hydrology_review_board_open'
]

const EMBEDDED_APP_ALLOWED_TOOLS = EMBEDDED_APP_TOOL_NAMES.map(
  toolName => `mcp__${EMBEDDED_APP_SERVER_NAME}__${toolName}`
)
const HYDROLOGY_WORKBENCH_ALLOWED_TOOLS = HYDROLOGY_WORKBENCH_TOOL_NAMES.map(
  toolName => `mcp__${EMBEDDED_APP_SERVER_NAME}__${toolName}`
)
const HYDROLOGY_WORKBENCH_DISALLOWED_TOOLS = [
  'Bash',
  'Glob',
  'Grep',
  'LS',
  'Read'
]

const EMBEDDED_APP_SYSTEM_PROMPT = [
  'This session belongs to an embedded app inside Hydro Desktop.',
  'Use embedded app tools to inspect current business context and request safe in-app actions.',
  'Use context_get when you need exact app state instead of guessing from the conversation.',
  'Use command_execute only for explicit in-app navigation or UI actions that help complete the user request.',
  'Do not claim you clicked or changed the app unless command_execute returned success.',
  'Do not invent app entities, selected records, tabs, stations, or review tasks without calling context_get first when that detail matters.',
  'When the user asks about the current station, current tab, current task, current selection, or other in-app state, call context_get first and answer from the returned app context.',
  'In embedded app sessions, interpret business nouns such as station, task, tab, record, and current object as the app business domain first, not as generic web or publishing concepts.',
  'For hydrology-workbench specifically, words like 站点, 实时数据, 审核任务, 审核任务状态, 工作成果, 时槽, and 当前任务 normally refer to the hydrology workbench UI state and review workflow, not Hydro Desktop scheduled tasks.',
  'When the user asks to switch pages, open 审核任务状态, open 实时数据列表, choose a station, or inspect the current hydrology workflow, prefer context_get and command_execute instead of hydrodesktop scheduled-task tools.',
  'When the app UI may be stale after in-app writes, you may call command_execute with refresh to request a safe page data reload.',
  'For hydrology-workbench, prefer hydrology_current_station_get or hydrology_context_get for questions about 当前站点 or 当前功能.',
  'For hydrology-workbench, prefer hydrology_review_board_open or hydrology_tab_open for requests such as 切换到审核任务状态 or 打开实时数据列表.',
  'For hydrology-workbench, do not inspect the workspace with Bash, Glob, Grep, LS, or Read when the user is asking about current station, current function page, review tasks, or in-app navigation.',
  'Only use hydrodesktop scheduled-task tools when the user explicitly asks about 定时任务, 计划任务, schedule, cron, or task scheduling configuration.'
].join(' ')

function getEmbeddedAppContext(embeddedAppRuntimeManager, appId) {
  return embeddedAppRuntimeManager?.getContext?.(appId) || null
}

function buildHydrologyWorkbenchTools({ tool, z, embeddedAppRuntimeManager, appId, session }) {
  if (appId !== HYDROLOGY_WORKBENCH_APP_ID) {
    return []
  }

  return [
    tool(
      HYDROLOGY_WORKBENCH_TOOL_NAMES[0],
      '读取当前水文工作台的业务上下文，优先用于回答当前站点、当前功能、当前时槽、当前审核任务。',
      {},
      async () => {
        const context = getEmbeddedAppContext(embeddedAppRuntimeManager, appId)
        return buildToolResult({
          action: HYDROLOGY_WORKBENCH_TOOL_NAMES[0],
          appId,
          context
        })
      }
    ),
    tool(
      HYDROLOGY_WORKBENCH_TOOL_NAMES[1],
      '读取当前水文工作台的当前站点信息。用户询问“当前水文站点是什么”时优先使用此工具。',
      {},
      async () => {
        const context = getEmbeddedAppContext(embeddedAppRuntimeManager, appId)
        return buildToolResult({
          action: HYDROLOGY_WORKBENCH_TOOL_NAMES[1],
          appId,
          station: context?.payload?.station || null,
          function: context?.payload?.function || null,
          summary: context?.summary || ''
        })
      }
    ),
    tool(
      HYDROLOGY_WORKBENCH_TOOL_NAMES[2],
      '切换水文工作台中间区域功能 tab。用于打开基础信息管理、实时数据列表、审核任务状态、规则与算法配置、工作成果展示。',
      {
        functionKey: z.enum(['basic', 'realtime', 'review', 'rule-config', 'results'])
          .describe('目标功能页。review=审核任务状态，realtime=实时数据列表，basic=基础信息管理，rule-config=规则与算法配置，results=工作成果展示。')
      },
      async (args) => {
        const executed = await embeddedAppRuntimeManager.executeCommand(
          appId,
          'openTab',
          { functionKey: args.functionKey },
          session?.ownerClientId || null
        )
        return buildToolResult({
          action: HYDROLOGY_WORKBENCH_TOOL_NAMES[2],
          appId,
          functionKey: args.functionKey,
          result: executed?.result ?? null
        })
      }
    ),
    tool(
      HYDROLOGY_WORKBENCH_TOOL_NAMES[3],
      '直接打开水文工作台的审核任务状态页面。用户说“切换到审核任务状态”时优先使用此工具。',
      {},
      async () => {
        const executed = await embeddedAppRuntimeManager.executeCommand(
          appId,
          'openReviewBoard',
          {},
          session?.ownerClientId || null
        )
        return buildToolResult({
          action: HYDROLOGY_WORKBENCH_TOOL_NAMES[3],
          appId,
          result: executed?.result ?? null
        })
      }
    )
  ]
}

async function buildEmbeddedAppCapabilityQueryOptions({ embeddedAppRuntimeManager, session }) {
  const appId = session?.clientMeta?.appId || session?.clientMeta?.embeddedAppId || null
  if (!embeddedAppRuntimeManager || !appId || session?.clientType !== 'embedded') {
    return {}
  }

  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const { z } = await import('zod/v4')
  const { createSdkMcpServer, tool } = sdk
  const hydrologyWorkbenchTools = buildHydrologyWorkbenchTools({
    tool,
    z,
    embeddedAppRuntimeManager,
    appId,
    session
  })

  return {
    mcpServers: {
      [EMBEDDED_APP_SERVER_NAME]: createSdkMcpServer({
        name: EMBEDDED_APP_SERVER_NAME,
        tools: [
          tool(
            EMBEDDED_APP_TOOL_NAMES[0],
            '读取当前 embedded app 的业务上下文快照，包括当前选择、当前页面位置和结构化业务对象。',
            {},
            async () => {
              const context = embeddedAppRuntimeManager.getContext(appId)
              return buildToolResult({
                action: 'context_get',
                appId,
                context
              })
            }
          ),
          tool(
            EMBEDDED_APP_TOOL_NAMES[1],
            '请求 embedded app 执行一个受控动作，例如切换标签、打开记录、聚焦当前业务对象。',
            {
              command: z.string().min(1).describe('受控动作名称，例如 refresh、selectStation、openTab、openReviewTask。'),
              payload: z.record(z.string(), z.any()).optional().describe('动作参数对象。')
            },
            async (args) => {
              const executed = await embeddedAppRuntimeManager.executeCommand(
                appId,
                args.command,
                args.payload || {},
                session?.ownerClientId || null
              )
              return buildToolResult({
                action: 'command_execute',
                appId,
                command: args.command,
                payload: args.payload || {},
                result: executed?.result ?? null
              })
            }
          ),
          ...hydrologyWorkbenchTools
        ]
      })
    },
    appendSystemPrompt: EMBEDDED_APP_SYSTEM_PROMPT,
    allowedTools: [
      ...EMBEDDED_APP_ALLOWED_TOOLS,
      ...(appId === HYDROLOGY_WORKBENCH_APP_ID ? HYDROLOGY_WORKBENCH_ALLOWED_TOOLS : [])
    ],
    disallowedTools: appId === HYDROLOGY_WORKBENCH_APP_ID
      ? HYDROLOGY_WORKBENCH_DISALLOWED_TOOLS
      : undefined
  }
}

module.exports = {
  buildEmbeddedAppCapabilityQueryOptions,
  EMBEDDED_APP_ALLOWED_TOOLS,
  EMBEDDED_APP_SYSTEM_PROMPT,
  HYDROLOGY_WORKBENCH_ALLOWED_TOOLS,
  HYDROLOGY_WORKBENCH_DISALLOWED_TOOLS
}
