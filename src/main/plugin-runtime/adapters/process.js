const { spawn } = require('child_process')
const { buildBasicEnv } = require('../../utils/env-builder')

function runCommand(command, args, options = {}) {
  const env = options.env || buildBasicEnv({})
  const cwd = options.cwd
  const timeout = options.timeout || 60000

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env,
      windowsHide: true
    })

    let stdout = ''
    let stderr = ''
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`Command timed out: ${command} ${args.join(' ')}`))
    }, timeout)

    child.stdout.on('data', chunk => {
      stdout += chunk.toString()
    })

    child.stderr.on('data', chunk => {
      stderr += chunk.toString()
    })

    child.on('error', err => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(err)
    })

    child.on('close', code => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        const msg = stderr.trim() || stdout.trim() || `Process exited with code ${code}`
        const error = new Error(msg)
        error.exitCode = code
        error.stdout = stdout
        error.stderr = stderr
        reject(error)
        return
      }
      resolve({ stdout, stderr, exitCode: code || 0 })
    })
  })
}

function runGit(args, options = {}) {
  return runCommand('git', args, options)
}

module.exports = {
  runCommand,
  runGit
}
