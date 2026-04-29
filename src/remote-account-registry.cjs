const accountRegistry = new Map()

function getRemoteAccount(accountId) {
  return accountRegistry.get(accountId) ?? null
}

function setRemoteAccount(accountId, patch) {
  const current = accountRegistry.get(accountId) ?? { accountId }
  const next = { ...current, ...patch, accountId }
  accountRegistry.set(accountId, next)
  return next
}

function requireRemoteAccount(accountId) {
  const account = getRemoteAccount(accountId)
  if (!account || !Number.isInteger(account.remoteAccountId)) {
    throw new Error(`Remote account mapping not found for accountId: ${accountId}`)
  }
  return account
}

module.exports = {
  getRemoteAccount,
  setRemoteAccount,
  requireRemoteAccount,
}
