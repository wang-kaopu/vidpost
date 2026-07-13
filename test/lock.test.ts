import test from 'node:test'
import assert from 'node:assert/strict'

import { attachSingletonLock } from '@/src/utils/lock.ts'

test('attachSingletonLock quits and blocks bootstrap when another instance already owns the lock', () => {
  let quitCalled = false
  let secondInstanceHandler = null

  const app = {
    requestSingleInstanceLock() {
      return false
    },
    quit() {
      quitCalled = true
    },
    on(event, handler) {
      if (event === 'second-instance') {
        secondInstanceHandler = handler
      }
    },
  }

  const hasLock = attachSingletonLock(app, () => null, () => null, () => {})

  assert.equal(hasLock, false)
  assert.equal(quitCalled, true)
  assert.equal(secondInstanceHandler, null)
})

test('attachSingletonLock forwards deep links to the first instance instead of focusing a new window', () => {
  let secondInstanceHandler = null
  const handledUrls = []

  const app = {
    requestSingleInstanceLock() {
      return true
    },
    quit() {},
    on(event, handler) {
      if (event === 'second-instance') {
        secondInstanceHandler = handler
      }
    },
  }

  const hasLock = attachSingletonLock(
    app,
    () => null,
    (argv) => argv.find((value) => String(value).startsWith('agenthunt://')) ?? null,
    (url) => handledUrls.push(url)
  )

  assert.equal(hasLock, true)
  assert.equal(typeof secondInstanceHandler, 'function')

  secondInstanceHandler(null, ['rm-server.exe', 'agenthunt://navigate/works'])

  assert.deepEqual(handledUrls, ['agenthunt://navigate/works'])
})

test('attachSingletonLock focuses the existing window when the second launch does not carry a deep link', () => {
  let secondInstanceHandler = null
  let restoreCalls = 0
  let focusCalls = 0

  const mainWindow = {
    isDestroyed() {
      return false
    },
    isMinimized() {
      return true
    },
    restore() {
      restoreCalls += 1
    },
    focus() {
      focusCalls += 1
    },
  }

  const app = {
    requestSingleInstanceLock() {
      return true
    },
    quit() {},
    on(event, handler) {
      if (event === 'second-instance') {
        secondInstanceHandler = handler
      }
    },
  }

  attachSingletonLock(app, () => mainWindow, () => null, () => {})

  assert.equal(typeof secondInstanceHandler, 'function')

  secondInstanceHandler(null, ['rm-server.exe'])

  assert.equal(restoreCalls, 1)
  assert.equal(focusCalls, 1)
})
