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

The Bilibili, Baijiahao, and Douyin publishing implementations now live directly in their corresponding `src/infra/video/xx-video.ts` files without generated CJS/ESM wrappers. Module-private `prepare()` performs everything before the final submission, private `publish()` confirms only that last operation, and private `dispose()` cleans resources. The complete `dryRun()`, `upload()`, and `fetchPublishedState()` implementations live directly in each platform `Video` class and are called through the common `Video` interface. Sohu publishing is unchanged; its `dryRun()` only logs the input payload and resolves successfully.

- A title, video, and cover are mandatory for all three migrated platforms.
- Only immediate publishing is supported. Scheduling controls stay visible but disabled, and the backend accepts only `scheduledAt: "0"`.
- Every Bilibili task must select an account-specific `humanTypeId` fetched from Bilibili.
- Every Douyin task selects `public`, `friends`, or `self`; the default is `public`.
- Douyin reuses the current Electron account partition instead of opening the same profile in a second Electron process. Douyin publishing is available on macOS and Windows only.
- Douyin login and publish select the corresponding fixed Chrome 138 identity file under `assets/douyin` from the host OS, then consistently use its UA, platform, and Client Hints. Fingerprint overrides through environment variables or runtime arguments are unsupported. GPU, CPU, memory, and screen information still comes from the host Chromium runtime.
- When Douyin's security gateway requires identity verification for the final submission, the task fails directly and reports the account nickname, verification reason, scene, and available methods. Complete verification in the same account partition before publishing again.
- `dryRun()` executes the complete pre-publish flow without making the final submission and does not return the internal prepared context. Bilibili, Baijiahao, and Douyin dry runs may upload temporary remote assets. Douyin closes its hidden windows, IPC, and session resources after the dry run. Cleanup failures are logged and never thrown.
- Final publish requests and complete workflows are never retried automatically. Only safe probes and media chunks have bounded retries.
- HTTP debug logs intentionally include full headers, cookies, tokens, and responses. Treat production logs as sensitive.
- Remote task records store only platform IDs, public links, and non-sensitive publishing options, never complete HTTP responses.

The migrated services use `axios-retry`, `crc-32`, `file-type`, `mp4box`, `p-limit`, and `sharp`. `npm run build:electron` emits the Douyin hidden-window bundle at `.build/douyin-publish-renderer.js`.

`app/App.vue` is the production renderer entry. `app/src/App.vue` and `app/src/scripts/sse-register.ts` are the backend integration demo and must be retained.

The obsolete manual-verification store integration was removed because its runtime store did not exist. Douyin SMS verification can still read `MATRIX_DOUYIN_PUBLISH_SMS_CODE` from the environment.
