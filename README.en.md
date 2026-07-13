# AgentHunt

An Electron and Vue desktop client for publishing videos to multiple platforms. The Electron main process, services, scripts, and tests use TypeScript with ESM. The Vue renderer is built with Vite.

## Setup

The repository uses npm workspaces and keeps a single root `package-lock.json`.

```bash
nvm use
npm install
```

## Commands

```bash
npm run dev --workspace app
npm start
npm run typecheck
npm test
npm run build
npm run forge:start
npm run forge:package
```

The Electron main process is emitted as `.build/main.js` in ESM format. `preload.ts` uses TypeScript and ESM syntax in source, but is emitted as `.build/preload.cjs` to preserve Electron sandbox support.

## Video publishing pipeline

The Bilibili, Baijiahao, Douyin, and Sohu publishing implementations live directly in their corresponding `src/infra/video/xx-video.ts` files. Module-private `prepare()` performs everything before the final submission, private `publish()` confirms only that last operation, and platforms that retain runtime resources use `dispose()` for cleanup. The complete `dryRun()`, `upload()`, and `fetchPublishedState()` implementations are called through the common `Video` interface.

- A title, video, and cover are mandatory for all four platforms.
- Only immediate publishing is supported. Scheduling controls stay visible but disabled, and the backend accepts only `scheduledAt: "0"`.
- Every Bilibili task must select an account-specific `humanTypeId` fetched from Bilibili.
- Every Sohu task must explicitly provide an account-specific `channelId` and `videoChannelId`. The UI fetches the hierarchy and selects the first valid pair automatically, while the service validates that the pair still belongs together.
- Sohu publishing uses Node.js and Axios with 512 KiB streaming chunks at concurrency three. The previous Electron publish window, DOM form filling, and click workflow are deprecated and removed.
- Sohu storage-state files must include cookies, `vuex`, `sp-cm`, and `dv-id`. Incomplete historical credentials require a new login and never fall back to browser publishing.
- Every Douyin task selects `public`, `friends`, or `self`; the default is `public`.
- Douyin reuses the current Electron account partition instead of opening the same profile in a second Electron process. Douyin publishing is available on macOS and Windows only.
- All four platforms use one loader to select the host-specific fixed Chrome 138 identity under `assets/browser-identity`. Login windows share its UA, platform, language, Client Hints, and timezone behavior, while each HTTP protocol consumes only the fields it needs. Environment and runtime identity overrides are unsupported. GPU, CPU, memory, and screen information still comes from the host Chromium runtime.
- When Douyin's security gateway requires identity verification for the final submission, the task fails directly and reports the account nickname, verification reason, scene, and available methods. Complete verification in the same account partition before publishing again.
- `dryRun()` executes the complete pre-publish flow without making the final submission and does not return the internal prepared context. All four platforms may upload temporary remote assets during a dry run. Douyin closes its hidden windows, IPC, and session resources afterward. Cleanup failures are logged and never thrown.
- Final publish requests and complete workflows are never retried automatically. Only safe probes and media chunks have bounded retries.
- HTTP debug logs intentionally include full headers, cookies, tokens, and responses. Treat production logs as sensitive.
- Remote task records store platform IDs, public links, and non-sensitive publishing options. Sohu also keeps the final publish response under `publish_result.response` for diagnostics and later ID parsing.

The migrated services use `axios-retry`, `crc-32`, `file-type`, `mp4box`, `p-limit`, and `sharp`. `npm run build:electron` emits the Douyin hidden-window bundle at `.build/douyin-publish-renderer.js`.

`app/App.vue` is the production renderer entry. `app/src/App.vue` and `app/src/scripts/sse-register.ts` are the backend integration demo and must be retained.

The obsolete manual-verification store integration was removed because its runtime store did not exist. Douyin SMS verification can still read `MATRIX_DOUYIN_PUBLISH_SMS_CODE` from the environment.
