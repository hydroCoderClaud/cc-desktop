function buildToolResult(payload) {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(payload, null, 2)
    }]
  }
}

const HYDROLOGY_SERVER_NAME = 'hydrology'
const HYDROLOGY_TOOL_NAMES = [
  'station_list',
  'station_get',
  'realtime_slots_list',
  'realtime_slot_get',
  'review_tasks_list',
  'review_latest_run_summary_get',
  'quality_check_run'
]

const HYDROLOGY_ALLOWED_TOOLS = HYDROLOGY_TOOL_NAMES.map(
  toolName => `mcp__${HYDROLOGY_SERVER_NAME}__${toolName}`
)

const HYDROLOGY_SYSTEM_PROMPT = [
  'You can access hydrology workbench business data through the hydrology MCP server.',
  'Use hydrology tools for real business entities such as stations, realtime slots, review tasks, and quality-check results.',
  'Use embeddedapp tools for current UI state and page navigation, not for backend data lookup when a hydrology tool can answer directly.',
  'When the user asks about station data, realtime observations, review tasks, or hydrology audit results, prefer hydrology tools over workspace inspection.',
  'When the user asks about the current page, current selected station in the UI, or requests page switching, prefer embeddedapp tools first.',
  'Do not invent station details, task counts, slot values, or review results without calling the corresponding hydrology tool first.'
].join(' ')

async function buildHydrologyCapabilityQueryOptions({
  stationService,
  realtimeService,
  reviewTaskService,
  qualityCheckService,
  session
}) {
  const appId = session?.clientMeta?.appId || session?.clientMeta?.embeddedAppId || null
  const isHydrologyWorkbench = session?.clientType === 'embedded' && appId === 'hydrology-workbench'

  if (!isHydrologyWorkbench || !stationService || !realtimeService || !reviewTaskService || !qualityCheckService) {
    return {}
  }

  const sdk = await import('@anthropic-ai/claude-agent-sdk')
  const { z } = await import('zod/v4')
  const { createSdkMcpServer, tool } = sdk

  return {
    mcpServers: {
      [HYDROLOGY_SERVER_NAME]: createSdkMcpServer({
        name: HYDROLOGY_SERVER_NAME,
        tools: [
          tool(
            HYDROLOGY_TOOL_NAMES[0],
            '查询水文工作台中的站点列表。',
            {},
            async () => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[0],
              stations: stationService.listStations()
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[1],
            '按站点 ID 查询水文站点详情。',
            {
              stationId: z.string().min(1).describe('站点 ID')
            },
            async ({ stationId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[1],
              station: stationService.getStation(stationId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[2],
            '查询站点的实时时槽列表，可按观测类型、时间范围、对比状态、异常状态过滤。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型，例如 waterLevel 或 airTemperature'),
              fromTime: z.string().optional().describe('开始时间，ISO 字符串或可解析时间'),
              toTime: z.string().optional().describe('结束时间，ISO 字符串或可解析时间'),
              compareStatus: z.string().optional().describe('对比状态过滤'),
              hasAnomaly: z.boolean().optional().describe('是否仅返回异常时槽')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[2],
              slots: realtimeService.listRealtimeSlots(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[3],
            '按时槽 ID 查询单个实时时槽详情，包括来源观测、异常和关联审核任务。',
            {
              slotId: z.string().min(1).describe('时槽 ID')
            },
            async ({ slotId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[3],
              detail: realtimeService.getRealtimeSlotDetail(slotId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[4],
            '查询站点审核任务列表。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              status: z.string().optional().describe('任务状态过滤，例如 all、needs_review、resolved')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[4],
              tasks: reviewTaskService.listReviewTasks(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[5],
            '查询最近一次质量检查运行摘要。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              scopeType: z.string().optional().describe('范围类型，例如 station 或 slot')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[5],
              summary: qualityCheckService.getLatestRunSummary(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[6],
            '执行水文质量检查，可用于单站或指定时间范围检查。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              fromTime: z.string().optional().describe('开始时间'),
              toTime: z.string().optional().describe('结束时间')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[6],
              result: qualityCheckService.runStationQualityCheck(args || {})
            })
          )
        ]
      })
    },
    appendSystemPrompt: HYDROLOGY_SYSTEM_PROMPT,
    allowedTools: HYDROLOGY_ALLOWED_TOOLS
  }
}

module.exports = {
  buildHydrologyCapabilityQueryOptions,
  HYDROLOGY_ALLOWED_TOOLS,
  HYDROLOGY_SYSTEM_PROMPT
}
