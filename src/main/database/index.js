/**
 * Database Mixins Index
 *
 * 导出所有数据库操作 mixin
 */

const { withProjectOperations } = require('./project-db')
const { withSessionOperations } = require('./session-db')
const { withMessageOperations } = require('./message-db')
const { withTagOperations } = require('./tag-db')
const { withFavoriteOperations } = require('./favorite-db')
const { withPromptOperations } = require('./prompt-db')
const { withQueueOperations } = require('./queue-db')
const { withAgentOperations } = require('./agent-db')

module.exports = {
  withProjectOperations,
  withSessionOperations,
  withMessageOperations,
  withTagOperations,
  withFavoriteOperations,
  withPromptOperations,
  withQueueOperations,
  withAgentOperations
}
