import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import { buildElectronLaunchConfig } from '../scripts/start-electron.ts'

test('start-electron clears ELECTRON_RUN_AS_NODE before launch', () => {
  const { command, args, spawnOptions } = buildElectronLaunchConfig({
    argv: ['--inspect'],
    env: {
      ELECTRON_RUN_AS_NODE: '1',
      PATH: process.env.PATH,
    },
  })

  assert.equal(typeof command, 'string')
  assert.deepEqual(args, [process.cwd(), '--inspect'])
  assert.equal(spawnOptions.cwd, process.cwd())
  assert.equal(spawnOptions.stdio, 'inherit')
  assert.equal(spawnOptions.windowsHide, false)
  assert.equal('ELECTRON_RUN_AS_NODE' in spawnOptions.env, false)
  assert.equal(spawnOptions.env.PATH, process.env.PATH)
})
