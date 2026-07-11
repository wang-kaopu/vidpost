# 矩阵特工队

Electron + Vue 的多平台视频发布客户端。Electron 主进程、服务层、脚本和测试统一使用 TypeScript 与 ESM；Vue 渲染进程由 Vite 构建。

## 环境与安装

项目使用 npm workspace，只维护根目录一份 `package-lock.json`。Node 版本由 `.nvmrc` 固定。

```bash
nvm use
npm install
```

前端环境变量维护在 `app/.env`，包括 API 地址、应用名称和 Mock 模式。`RENDERER_DEV_SERVER_URL` 由开发启动器按实际端口动态注入，无需手动配置。

## 开发与验证

```bash
# 构建 Electron，并为当前实例启动专属 Vite 开发服务器
npm run dev

# 构建 Electron 后启动桌面应用，只加载已有前端构建产物
npm start

# 类型检查、测试和完整构建
npm run typecheck
npm test
npm run build

# Electron Forge
npm run forge:start
npm run forge:package
npm run forge:make
```

Electron 主进程构建为 `.build/main.js` ESM。`preload.ts` 仍在源码层使用 TypeScript 和 ESM 语法，但为了保留 sandbox，构建产物为 `.build/preload.cjs`。

`npm run dev` 会选择空闲端口启动当前项目的 Vite，并通过 `RENDERER_DEV_SERVER_URL` 将准确地址交给 Electron。Electron 不再探测固定端口，因此不会连接其他项目或工作区的开发服务器。`npm start` 和打包后的应用只加载 `app/dist/index.html`。

`app/App.vue` 是正式渲染入口；`app/src/App.vue` 和 `app/src/scripts/sse-register.ts` 是后端联调 Demo，不能作为废弃目录删除。

## 平台资源基础设施

`src/infra` 按资源而不是按平台组织，只包含账号和视频两个目录：

```text
src/infra/
├── account/
│   ├── account.ts
│   ├── baijiahao-account.ts
│   ├── bilibili-account.ts
│   ├── douyin-account.ts
│   └── sohu-account.ts
└── video/
    ├── video.ts
    ├── baijiahao-video.ts
    ├── bilibili-video.ts
    ├── douyin-video.ts
    └── sohu-video.ts
```

`account.ts` 定义登录、探活和昵称同步接口，`video.ts` 定义发布和发布状态查询接口。业务调用方通过 `createAccount(platform)` 和 `createVideo(platform)` 获取具体实现。

各平台实现有意保持自包含。浏览器启动、Cookie 状态、Electron 发布窗口、页面交互、上传重试和状态解析代码不通过 shared 模块跨平台复用。新增平台时必须分别提供 `Account` 和 `Video` 实现，不再使用旧的 `platformRegistry` 或 `src/infra/platforms` 目录。

### 视频上传链路

Bilibili、百家号和抖音的发布逻辑已分别内联到 `src/infra/video` 下对应的 `xx-video.ts`，不再包含迁移工具生成的 CJS/ESM 包装代码。每个平台由顶层 `prepare()` 完成最终投稿前的全部操作，私有 `publish()` 只确认最后一次投稿，顶层 `dispose()` 负责清理；`upload()` 与 `fetchPublishedState()` 的完整实现直接位于平台 `Video` 类中。业务层通过统一的 `Video.upload()` 和 `Video.fetchPublishedState()` 接口调用。搜狐上传保持不变。

- 三个平台都要求标题、视频和封面，封面缺失时任务不会提交。
- 当前所有平台仅支持立即发布；发布计划中的定时控件保留为禁用状态，后端只接受 `scheduledAt: "0"`。
- Bilibili 必须按账号动态查询并选择投稿分区 `humanTypeId`。
- 抖音必须逐任务选择 `public`、`friends` 或 `self`，默认 `public`。
- 抖音 HTTP 上传复用当前应用的账号级 Electron partition，不启动第二个 Electron Profile；该链路仅支持 macOS 和 Windows。
- `prepare()` 返回可检查的完整平台上下文。单独调用 Bilibili 或百家号 `prepare()` 后不执行最终投稿会遗留已上传的远端素材；抖音应将返回上下文传给 `dispose()` 关闭隐藏窗口、IPC 和 Session 资源。`dispose()` 清理失败只记录日志，不向调用方抛错。
- 最终投稿请求和整条发布流程不会自动重试，只对可安全重复的探测请求及视频分片做有限重试。
- HTTP 调试日志按原 Service 行为输出完整 Header、Cookie、Token 和响应，请勿把生产日志交给无关人员。
- 远程任务只保存平台作品 ID、公开链接及非敏感发布选项，不保存完整 HTTP 响应。

新增上传实现依赖 `axios-retry`、`crc-32`、`file-type`、`mp4box`、`p-limit` 和 `sharp`。抖音隐藏网络窗口脚本由 `npm run build:electron` 生成到 `.build/douyin-publish-renderer.js`。

## 账号浏览器环境隔离

平台账号登录窗口使用账号级 Electron `persist:` partition 隔离浏览器状态。partition 映射持久化在：

`~/.agenthunt/partition-map.json`

旧目录 `~/.matrix-account` 不再作为账号状态读写路径。

```json
{
  "partition_map_table": {
    "1001": "persist:rpa-MTAwMQ"
  }
}
```

- 同一个账号 ID 复用同一个 partition，重启后从本地映射恢复。
- 不同账号 ID 使用不同 partition，避免浏览器状态串号。
- 主应用窗口使用 `persist:app-main`，不与平台账号页面共用。
- 登录窗口关闭不会删除账号 partition。

## 已移除能力

历史人工验证码存储模块及其桌面轮询链路已删除，因为其依赖的 runtime store 不存在。抖音发布短信验证码仍支持通过 `MATRIX_DOUYIN_PUBLISH_SMS_CODE` 环境变量自动填写。
