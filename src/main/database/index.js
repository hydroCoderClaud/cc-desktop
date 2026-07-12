/**
 * Database Mixins Index
 *
 * 导出所有数据库操作 mixin
 */

const { withProjectOperations } = require('./project-db')
const { withPromptOperations } = require('./prompt-db')
const { withQueueOperations } = require('./queue-db')
const { withAgentOperations } = require('./agent-db')
const { withPromptMarketOperations } = require('./prompt-market-db')
const { withScheduledTaskOperations } = require('./scheduled-task-db')
const { withSessionAppOperations } = require('./session-app-db')

module.exports = {
  withProjectOperations,
  withPromptOperations,
  withQueueOperations,
  withAgentOperations,
  withPromptMarketOperations,
  withScheduledTaskOperations,
  withSessionAppOperations
}
