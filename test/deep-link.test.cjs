const test = require('node:test')
const assert = require('node:assert/strict')

const {
  parseAgenthuntUrl,
  extractProtocolUrlFromCommandLine,
  resolveProtocolClientRegistration,
} = require('../src/deep-link.ts')

test('parseAgenthuntUrl accepts supported pages and rejects unknown paths', () => {
  assert.deepEqual(parseAgenthuntUrl('agenthunt://navigate/accounts'), { page: 'accounts' })
  assert.deepEqual(parseAgenthuntUrl('agenthunt://navigate/works'), { page: 'works' })
  assert.equal(parseAgenthuntUrl('agenthunt://navigate/unknown'), null)
})

test('extractProtocolUrlFromCommandLine finds the last deep link argument', () => {
  assert.equal(
    extractProtocolUrlFromCommandLine(['electron', '.', '--flag', 'agenthunt://navigate/accounts']),
    'agenthunt://navigate/accounts'
  )
  assert.equal(extractProtocolUrlFromCommandLine(['electron', '.', '--flag']), null)
})

test('resolveProtocolClientRegistration uses the packaged executable in default-app mode', () => {
  const registration = resolveProtocolClientRegistration(
    ['electron', '/Users/example/workspace/rm-server/main.cjs'],
    true
  )

  assert.deepEqual(registration, {
    path: process.execPath,
    args: ['/Users/example/workspace/rm-server/main.cjs'],
  })
  assert.deepEqual(resolveProtocolClientRegistration(['rm-server.exe'], false), {})
})
