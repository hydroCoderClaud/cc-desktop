let pluginStateChain = Promise.resolve()

async function withPluginStateLock(task) {
  const run = pluginStateChain.then(() => task())
  pluginStateChain = run.catch(() => {})
  return run
}

module.exports = {
  withPluginStateLock
}
