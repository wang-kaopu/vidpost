import test from 'node:test'
import assert from 'node:assert/strict'
import {
  findDisallowedGlobalClassSelectors,
  findVueFilesWithGlobalStyleBlocks,
  validateRendererGlobalCss,
} from '@/scripts/renderer-css-policy.ts'

test('renderer CSS policy accepts the approved global class selectors', () => {
  const css = `@import "tailwindcss";
@theme { --color-primary: #3f8cff; }
:root { background-image: url("/backgrounds/liquid-glass.webp"); }
.workspace { transform: none; }
body.rm-dialog-open .workspace { filter: none; }
`

  assert.deepEqual(validateRendererGlobalCss(css), [])
})

test('renderer CSS policy rejects business class selectors', () => {
  const css = `@import "tailwindcss";
@theme { --color-primary: #3f8cff; }
.panel-card, .notification-toast { color: red; }
`

  assert.deepEqual(findDisallowedGlobalClassSelectors(css), ['notification-toast', 'panel-card'])
  assert.match(validateRendererGlobalCss(css).join('\n'), /notification-toast, panel-card/)
})

test('renderer CSS policy rejects non-scoped Vue style blocks', () => {
  const files = [
    { path: 'Scoped.vue', source: '<style scoped>.card {}</style>' },
    { path: 'External.vue', source: '<style scoped src="./External.css"></style>' },
    { path: 'Global.vue', source: '<style>.card {}</style>' },
  ]

  assert.deepEqual(findVueFilesWithGlobalStyleBlocks(files), ['Global.vue'])
})
