export const isNewerVersion = (remoteVersion, localVersion) => {
  if (!remoteVersion) return false
  if (!localVersion) return true

  const remote = remoteVersion.split('.').map(Number)
  const local = localVersion.split('.').map(Number)

  for (let i = 0; i < 3; i++) {
    const rv = remote[i] || 0
    const lv = local[i] || 0
    if (rv > lv) return true
    if (rv < lv) return false
  }

  return false
}
