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
  'station_save',
  'station_delete',
  'realtime_slots_list',
  'realtime_slot_get',
  'realtime_trend_list',
  'realtime_demo_seed',
  'realtime_observation_create',
  'realtime_observation_update',
  'realtime_observation_delete',
  'realtime_slot_delete',
  'realtime_correction_apply',
  'review_tasks_list',
  'review_task_resolve',
  'review_task_delete',
  'review_tasks_delete',
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
  realtimeDemoSeeder,
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
            '新建或保存水文站点与规则配置。',
            {
              station: z.record(z.string(), z.any()).describe('站点对象，允许包含基础信息、数据源、调度与规则配置')
            },
            async ({ station }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[2],
              station: stationService.saveStation(station || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[3],
            '删除一个水文站点。',
            {
              stationId: z.string().min(1).describe('站点 ID')
            },
            async ({ stationId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[3],
              result: stationService.deleteStation(stationId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[4],
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
              action: HYDROLOGY_TOOL_NAMES[4],
              slots: realtimeService.listRealtimeSlots(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[5],
            '按时槽 ID 查询单个实时时槽详情，包括来源观测、异常和关联审核任务。',
            {
              slotId: z.string().min(1).describe('时槽 ID')
            },
            async ({ slotId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[5],
              detail: realtimeService.getRealtimeSlotDetail(slotId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[6],
            '查询站点实时数据过程线视图，可按观测类型与时间范围返回趋势点位。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型，例如 waterLevel 或 airTemperature'),
              fromTime: z.string().optional().describe('开始时间，ISO 字符串或可解析时间'),
              toTime: z.string().optional().describe('结束时间，ISO 字符串或可解析时间')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[6],
              trend: realtimeService.listRealtimeTrend(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[7],
            '为指定站点灌入演示实时数据，用于 demo、联调或重新生成样例时序数据。',
            {
              stationId: z.string().min(1).describe('站点 ID')
            },
            async ({ stationId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[7],
              result: realtimeDemoSeeder
                ? realtimeDemoSeeder.seedStationObservations(stationService.getStation(stationId))
                : { error: 'Realtime demo seeder unavailable' }
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[8],
            '新增一条实时观测记录。',
            {
              observation: z.record(z.string(), z.any()).describe('观测对象，通常包含 stationId、observationType、sourceType、observedAt 或 slotTime、value')
            },
            async ({ observation }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[8],
              observation: realtimeService.saveObservation(observation || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[9],
            '修改一条实时观测记录。',
            {
              observation: z.record(z.string(), z.any()).describe('观测对象，必须包含 id，可包含 value、observedAt、slotTime 等字段')
            },
            async ({ observation }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[9],
              observation: realtimeService.updateObservation(observation || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[10],
            '删除一条实时观测记录。',
            {
              observationId: z.string().min(1).describe('观测记录 ID')
            },
            async ({ observationId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[10],
              result: realtimeService.deleteObservation(observationId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[11],
            '删除某个时槽的可删观测数据。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().min(1).describe('观测类型'),
              slotTime: z.string().min(1).describe('时槽时间'),
              sourceTypes: z.array(z.string()).optional().describe('要删除的来源类型列表，缺省时删除该时槽可删来源')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[11],
              result: realtimeService.deleteSlotObservations(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[12],
            '对某个时槽应用人工修正。',
            {
              correction: z.record(z.string(), z.any()).describe('修正对象，通常包含 stationId、observationType、targetTime、beforeValue、afterValue、reason、approver')
            },
            async ({ correction }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[12],
              correction: realtimeService.applyCorrection(correction || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[13],
            '查询站点审核任务列表。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              status: z.string().optional().describe('任务状态过滤，例如 all、needs_review、resolved')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[13],
              tasks: reviewTaskService.listReviewTasks(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[14],
            '将一条审核任务标记为已处理。',
            {
              taskId: z.string().min(1).describe('审核任务 ID'),
              payload: z.record(z.string(), z.any()).optional().describe('处理信息，例如 resolvedBy、resolutionNote')
            },
            async ({ taskId, payload }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[14],
              task: reviewTaskService.resolveReviewTask(taskId, payload || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[15],
            '删除一条审核任务。',
            {
              taskId: z.string().min(1).describe('审核任务 ID')
            },
            async ({ taskId }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[15],
              result: reviewTaskService.deleteReviewTask(taskId)
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[16],
            '批量删除审核任务。',
            {
              taskIds: z.array(z.string()).describe('审核任务 ID 列表')
            },
            async ({ taskIds }) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[16],
              result: reviewTaskService.deleteReviewTasks(taskIds || [])
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[17],
            '查询最近一次质量检查运行摘要。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              scopeType: z.string().optional().describe('范围类型，例如 station 或 slot')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[17],
              summary: qualityCheckService.getLatestRunSummary(args || {})
            })
          ),
          tool(
            HYDROLOGY_TOOL_NAMES[18],
            '执行水文质量检查，可用于单站或指定时间范围检查。',
            {
              stationId: z.string().min(1).describe('站点 ID'),
              observationType: z.string().optional().describe('观测类型'),
              fromTime: z.string().optional().describe('开始时间'),
              toTime: z.string().optional().describe('结束时间')
            },
            async (args) => buildToolResult({
              action: HYDROLOGY_TOOL_NAMES[18],
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
