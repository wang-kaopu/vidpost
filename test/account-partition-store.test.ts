import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import {
  PARTITION_MAP_TABLE_KEY,
  createPartitionStore,
  deletePartitionMapping,
  movePartitionMapping,
  readPartitionMapTable,
  resolvePartitionForAccount,
} from '../src/db/partition-store.ts'

function createTempStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'matrix-partition-store-'))
  return createPartitionStore(path.join(dir, 'partition-map.json'))
}

test('resolvePartitionForAccount reuses the same persistent partition for one account', () => {
  const store = createTempStore()

  const firstPartition = resolvePartitionForAccount(store, 'account:1001')
  const secondPartition = resolvePartitionForAccount(store, 'account:1001')

  assert.equal(firstPartition, secondPartition)
  assert.match(firstPartition, /^persist:/)
})

test('resolvePartitionForAccount separates different account partitions', () => {
  const store = createTempStore()

  const firstPartition = resolvePartitionForAccount(store, 'account:1001')
  const secondPartition = resolvePartitionForAccount(store, 'account:1002')

  assert.notEqual(firstPartition, secondPartition)
})

test('partition map persists after recreating the local store', () => {
  const store = createTempStore()
  const storePath = store.storePath
  const partition = resolvePartitionForAccount(store, 'account:1001')
  const restoredStore = createPartitionStore(storePath)

  assert.equal(resolvePartitionForAccount(restoredStore, 'account:1001'), partition)
})

test('movePartitionMapping migrates a draft partition to the remote account id', () => {
  const store = createTempStore()
  const draftPartition = resolvePartitionForAccount(store, 'draft:douyin:abc.json')

  const accountPartition = movePartitionMapping(store, 'draft:douyin:abc.json', '1001')
  const table = readPartitionMapTable(store)

  assert.equal(accountPartition, draftPartition)
  assert.equal(table['1001'], draftPartition)
  assert.equal(table['draft:douyin:abc.json'], undefined)
  assert.deepEqual(Object.keys(store.get(PARTITION_MAP_TABLE_KEY)), ['1001'])
})

test('deletePartitionMapping removes only the selected map entry', () => {
  const store = createTempStore()
  const firstPartition = resolvePartitionForAccount(store, '1001')
  const secondPartition = resolvePartitionForAccount(store, '1002')

  deletePartitionMapping(store, '1001')
  const table = readPartitionMapTable(store)

  assert.equal(table['1001'], undefined)
  assert.equal(table['1002'], secondPartition)
  assert.notEqual(firstPartition, secondPartition)
})
