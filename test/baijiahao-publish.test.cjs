const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

async function loadPublishModule() {
  return import(pathToFileURL(path.resolve(__dirname, '../src/infra/platforms/baijiahao/publish.ts')).href)
}

test('buildBaijiahaoDescriptionValue prefixes title before copy with double newline', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(
    buildBaijiahaoDescriptionValue('olivia', 'Olivia IG update'),
    'olivia\n\nOlivia IG update',
  )
})

test('buildBaijiahaoDescriptionValue keeps single title when copy is empty or duplicated', async () => {
  const { buildBaijiahaoDescriptionValue } = await loadPublishModule()

  assert.equal(buildBaijiahaoDescriptionValue('olivia', ''), 'olivia')
  assert.equal(buildBaijiahaoDescriptionValue('olivia', 'olivia'), 'olivia')
})
