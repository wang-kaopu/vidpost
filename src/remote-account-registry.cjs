const accountRegistry = new Map()

function getRemoteAccount(accountUlid) {
  return accountRegistry.get(accountUlid) ?? null
}

function setRemoteAccount(accountUlid, patch) {
  const current = accountRegistry.get(accountUlid) ?? { accountUlid }
  const next = { ...current, ...patch, accountUlid }
  accountRegistry.set(accountUlid, next)
  return next
}

function requireRemoteAccount(accountUlid) {
  const account = getRemoteAccount(accountUlid)
  if (!account || !Number.isInteger(account.remoteAccountId)) {
    throw new Error(`Remote account mapping not found for accountUlid: ${accountUlid}`)
  }
  return account
}

module.exports = {
  getRemoteAccount,
  setRemoteAccount,
  requireRemoteAccount,
}
