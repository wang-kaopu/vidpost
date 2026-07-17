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

`shared/electron-api.ts` is the single Electron IPC contract shared by the main process, preload, and production renderer. It owns the DTOs, platform union, and channel constants. Preload and renderer APIs no longer expose business parameters or results as `unknown`; only main-process IPC entry points treat cross-process input as unknown before validating and projecting it into the shared DTOs. Account inputs use `accountId`, publishing inputs use camelCase fields, and the previous `id`, `account_id`, and snake_case platform-option aliases are unsupported.

The root TypeScript project enables `strict: true`. The main process, scripts, and runtime code under `src/` must pass strict type checking without directory-level exemptions.

## Video publishing pipeline

The Bilibili, Baijiahao, Douyin, and Sohu publishing implementations live directly in their corresponding `src/infra/video/xx-video.ts` files. Module-private `prepare()` performs everything before the final submission, private `publish()` confirms only that last operation, and platforms that retain runtime resources use `dispose()` for cleanup. The complete `dryRun()`, `upload()`, and `fetchPublishedState()` implementations are called through the common `Video` interface.

- A title, video, and cover are mandatory for all four platforms.
- Publish titles are truncated by Unicode code point to 50 characters for Baijiahao, 80 for Bilibili, and 30 for both Douyin and Sohu. Descriptions are truncated to 100 characters on every platform. The normalized text is shared by remote task records and platform submissions, and Sohu no longer uses its legacy 60-character rejection rule.
- Only immediate publishing is supported. Scheduling controls stay visible but disabled, and the backend accepts only `scheduledAt: "0"`.
- Every Bilibili task must select an account-specific `humanTypeId` fetched from Bilibili.
- Every Sohu task must explicitly provide an account-specific `channelId` and `videoChannelId`. The UI fetches the hierarchy and selects the first valid pair automatically, while the service validates that the pair still belongs together.
- Sohu publishing uses Node.js and Axios with 512 KiB streaming chunks at concurrency three. The previous Electron publish window, DOM form filling, and click workflow are deprecated and removed.
- Sohu storage-state files must include cookies, `vuex`, `sp-cm`, and `dv-id`. Incomplete historical credentials require a new login and never fall back to browser publishing.
- Every Douyin task selects `public`, `friends`, or `self`; the default is `public`.
- Douyin reuses the current Electron account partition instead of opening the same profile in a second Electron process. Douyin publishing is available on macOS and Windows only.
- All four platforms use one loader to select the host-specific fixed Chrome 138 identity under `assets/browser-identity`. Login windows share its UA, platform, language, Client Hints, and timezone behavior, while each HTTP protocol consumes only the fields it needs. Environment and runtime identity overrides are unsupported. GPU, CPU, memory, and screen information still comes from the host Chromium runtime.
- Login windows do not inject a floating close button into platform pages. They close through the native title bar or `Cmd/Ctrl+W` and do not consume `Esc`.
- Before a routine account `ping()`, the main process requires both the cookie file and an existing account partition mapping. If either is missing, it skips the platform request, marks the remote account offline, and does not create a replacement partition mapping.
- When Douyin's security gateway requires identity verification for the final submission, the task fails directly and reports the account nickname, verification reason, scene, and available methods. Complete verification in the same account partition before publishing again.
- `dryRun()` executes the complete pre-publish flow without making the final submission and does not return the internal prepared context. All four platforms may upload temporary remote assets during a dry run. Douyin closes its hidden windows, IPC, and session resources afterward. Cleanup failures are logged and never thrown.
- Final publish requests and complete workflows are never retried automatically. Only safe probes and media chunks have bounded retries.
- HTTP debug logs intentionally include full headers, cookies, tokens, and responses. Treat production logs as sensitive.
- Remote task records store platform IDs, public links, and non-sensitive publishing options. Sohu also keeps the final publish response under `publish_result.response` for diagnostics and later ID parsing.

The migrated services use `axios-retry`, `crc-32`, `file-type`, `mp4box`, `p-limit`, and `sharp`. `npm run build:electron` emits the Douyin hidden-window bundle at `.build/douyin-publish-renderer.js`.

## Logging

Application code keeps using `logger.info(...values)` and `logger.error(...values)`. The Electron main process owns the log4js implementation and writes `electron.log` for main-process and Node activity and `renderer.log` for the production renderer under `~/.agenthunt/logs`. The production renderer records a startup marker, uncaught Vue and window errors, unhandled promise rejections, sanitized HTTP failures, and failures from key direct Electron IPC operations. Renderer HTTP logs include only the method, relative URL without query parameters, status, error code, and operation description; they exclude authentication headers, query parameters, and request bodies. The application constructs this absolute path from `app.getPath("home")` and registers it with `app.setAppLogsPath()`, without relying on shell expansion. Each active stream rotates after a 24-hour write window: the active file has no suffix, the newest archive uses `.1`, and the oldest uses `.6`, keeping exactly seven windows per stream. On restart, the remaining interval is recovered from the active files' creation time. If the application was closed for longer than 24 hours, it performs one rollover at the next launch without creating empty files for the offline intervals. Renderer messages are safely formatted before the restricted `electronAPI.logger` bridge forwards them to the main process; the renderer never receives filesystem or log4js access. The application waits for pending rotation and log writes before quitting. These files can contain sensitive application context and must be handled accordingly.

## Account management windows

The account table exposes an **Account backend** action for Douyin, Bilibili, Baijiahao, and Sohu. It opens the platform management home in the account's persistent Electron partition. The window is modal, the renderer adds a full-page mask, and only one account backend can exist globally. Existing cookies and local storage are restored before navigation. Missing or expired state does not block the window, so users can sign in again; a valid replacement login is saved immediately, and the current state is saved and checked again when the window closes. Signing in as another account on the same platform rebinds the existing local account record while retaining its local ID, tags, and history.

Account backend windows always start from the platform management home and let an expired session follow the platform's own login or cross-domain synchronization redirects. The first main-frame page must load within 30 seconds; expected `ERR_ABORTED` navigation replacements remain in the flow, while real main-frame failures and startup timeouts release the mask and report an error. Once a page is visible, the window has no usage timeout. It closes through the native title bar or `Cmd/Ctrl+W`, does not consume `Esc`, and sends every requested popup to the system browser. Closing before the first page loads does not save an incomplete state, and later save failures never trap the user in the modal window. Manual actions performed in platform pages do not create local publishing records. The renderer prevents this window from opening while any automatic task is still waiting, preparing, queued, or publishing; platform review after a successful submission does not keep the window blocked.

`app/App.vue` is the production renderer entry. Its sidebar includes a **Publish** workspace. Selecting completed works and pressing **Add to Publish** appends them to an application-level, work-ID-deduplicated queue and navigates directly to that workspace; the old account-picker and publish-plan dialogs are no longer opened from the Works page. An unconfigured work exposes **Add Account**, which opens a dedicated account-selection drawer where online accounts can be filtered by platform or account tag and one account can be bound to the work, while **Publish Settings** remains greyed out and disabled. After binding, clicking the account information reopens the drawer so the account can be changed. The settings drawer never contains an account selector and derives its fields from the account already bound to the work: common title and introduction, Douyin visibility, account-scoped Bilibili category, account-scoped Sohu channel hierarchy, and the supported platform scheduling window. **Publish Check** at the bottom-right deduplicates the current rows by platform and account ID, runs the existing account `ping()` flow in batches, refreshes account states, and reports idle, running, successful, or failed-with-reason state per row. Only when every row succeeds does the button change to **Confirm Publish**. A second click validates platform options and schedules, loads work assets, submits the existing `publish()` flow, removes the submitted rows, and hands progress tracking to the application-level publishing panel. Account binding, publish settings, and row removal are locked while a check or submission preparation is running, and changing the account or settings later resets that row. Logging out clears any unsubmitted queue. `app/src/App.vue` and `app/src/scripts/sse-register.ts` are the backend integration demo and must be retained.

The obsolete manual-verification store integration was removed because its runtime store did not exist. Douyin SMS verification can still read `MATRIX_DOUYIN_PUBLISH_SMS_CODE` from the environment.
