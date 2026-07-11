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

`app/App.vue` is the production renderer entry. `app/src/App.vue` and `app/src/scripts/sse-register.ts` are the backend integration demo and must be retained.

The obsolete manual-verification store integration was removed because its runtime store did not exist. Douyin SMS verification can still read `MATRIX_DOUYIN_PUBLISH_SMS_CODE` from the environment.
