# 矩阵特工队

Electron + Vue 的多平台视频发布客户端。Electron 主进程、服务层、脚本和测试统一使用 TypeScript 与 ESM；Vue 渲染进程由 Vite 构建。

后端 TypeScript 的 `@/` 指向仓库根目录，项目内模块统一使用 `@/src/...`、`@/scripts/...` 等绝对引用，不使用 `./` 或 `../` 模块路径。唯一例外是 `forge.config.ts`：Electron Forge 的 Jiti 配置加载器不解析 tsconfig paths，因此继续相对引用打包规则。前端是独立工程，`app` 内的 `@/` 仍指向 `app` 根目录。

## 环境与安装

项目使用 npm workspace，只维护根目录一份 `package-lock.json`。Node 版本由 `.nvmrc` 固定。

```bash
nvm use
npm install
```

前端环境变量维护在 `app/.env`，包括 API 地址、应用名称和 Mock 模式。`RENDERER_DEV_SERVER_URL` 由开发启动器按实际端口动态注入，无需手动配置。

## 前端样式与 UI 组件

渲染进程使用 Tailwind CSS 4，并通过官方 `@tailwindcss/vite` 插件接入 Vite。依赖由根目录 npm workspace 统一管理；单独补装前端样式依赖时使用：

```bash
npm install -D tailwindcss @tailwindcss/vite --workspace app
```

`app/styles.css` 是唯一全局样式入口，只保留 Tailwind 入口、`@theme` 设计令牌、基础 reset、原生表单继承和工作区弹窗状态。页面布局优先使用 Tailwind 工具类；复杂动画和业务状态放在所属组件的 `<style scoped>` 中，较长样式可以通过 `<style scoped src="...">` 与组件同目录维护。不要新增页面级全局按钮、字段、徽标或业务选择器。

无业务语义的小组件统一维护在 `app/components/ui/`。当前包含按钮、图标按钮、文本输入框、文本域、选择字段、圆形复选框、数据表、页面面板、弹窗外壳、筛选浮层、操作菜单和状态消息。业务组件直接组合这些组件，并通过明确的 `variant`、`tone`、`size` 等属性选择外观。例如：

```vue
<CapsuleButton variant="primary" size="sm">绑定账号</CapsuleButton>
<TextInput v-model="keyword" placeholder="搜索标题" />
<SelectField v-model="platform">...</SelectField>
<ToneBadge tone="success" dot>在线</ToneBadge>
```

新增通用交互优先扩展 `components/ui` 中已有组件；只有业务结构和行为无法归入现有基础组件时才新建组件。UI 小组件不得直接请求接口、读取 Electron API 或依赖具体业务类型。

`DataList` 统一将表格中的 SVG 图标和平台 Logo 按原尺寸的 80% 居中显示，并保留原布局占位，业务页面不再单独调整表格图标尺寸。

具有独立 CSS 文件的业务组件按组件名建立目录，并在目录内只维护同名 Vue 与 CSS，例如 `components/Work/Work.vue` 和 `components/Work/Work.css`。没有独立 CSS 的简单组件继续直接放在 `components/` 或 `components/ui/` 下。

界面图标统一使用 Lucide 官方 Vue 包，不维护自定义 SVG 图标组件，也不在 Vue 模板中手写图标路径。依赖安装和基础用法如下：

```bash
npm install lucide-vue-next --workspace app
```

```vue
<script setup lang="ts">
import { Search, Trash2 } from "lucide-vue-next";
</script>

<Search :size="18" aria-hidden="true" />
<Trash2 :size="16" aria-hidden="true" />
```

账号、作品和记录页的筛选条件统一收纳在标题栏“筛选”按钮的轻量浮层中。浮层支持按钮切换、点击外部或按 `Esc` 关闭；按钮上的数字表示当前启用的筛选条件数量。筛选浮层允许越过短内容面板的底边显示，不受 `PanelShell` 高度裁切。

## 开发与验证

```bash
# 构建 Electron，并为当前实例启动专属 Vite 开发服务器
npm run dev

# 构建 Electron 后启动桌面应用，只加载已有前端构建产物
npm start

# 类型检查、测试和完整构建
npm run check:renderer-css
npm run lint
npm run typecheck
npm test
npm run build

# 一次执行渲染进程 CSS 边界、ESLint、vue-tsc 和前端构建
npm run verify:renderer

# Electron Forge
npm run forge:start
npm run forge:package
npm run forge:make
```

### Windows x64 打包

Windows 安装包必须在 Windows x64 主机上构建。从根目录的 `.nvmrc` 选择 Node 版本，然后按 lockfile 重建包含开发与可选依赖的完整依赖树：

```powershell
nvm install 22.22.3
nvm use 22.22.3
Get-Process -Name "矩阵特工队" -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item -Recurse -Force node_modules, app\node_modules, out, .build, app\dist -ErrorAction SilentlyContinue
npm ci --include=dev --include=optional
npm run typecheck
npm test
npm run forge:make
```

`forge:package` 只生成 `out/矩阵特工队-win32-x64` 下的可运行目录；`forge:make` 额外生成可分发安装包。打包前必须退出从 `out` 启动的旧应用，否则 Windows 会锁住 `app.asar` 并使清理或覆盖报 `EBUSY`。Forge 每次会覆盖旧的 package 目录，`.build` 和 `app/dist` 也会在构建前清空。

Sharp 的 Windows 原生模块依赖同目录的 libvips DLL。打包前应确认 `node_modules/@img/sharp-win32-x64/lib` 同时包含 `.node` 和 `.dll` 文件；打包后应确认它们都被复制到：

```text
out/矩阵特工队-win32-x64/resources/app.asar.unpacked/node_modules/@img/sharp-win32-x64/lib/
```

不得使用 `--omit=optional` 或从其他操作系统拷贝的 `node_modules` 打包 Windows 产物。

Electron 主进程构建为 `.build/main.js` ESM。`preload.ts` 仍在源码层使用 TypeScript 和 ESM 语法，但为了保留 sandbox，构建产物为 `.build/preload.cjs`。

Forge 的 ASAR 配置会整体解包 Playwright、Sharp 和 `@img` 运行时目录。Sharp 的 Windows 原生模块及其 libvips DLL 必须共同位于 `app.asar.unpacked`，否则打包应用启动时会因系统加载器无法从 ASAR 读取依赖 DLL 而报 `ERR_DLOPEN_FAILED`。

`shared/electron-api.ts` 是主进程、preload 和正式 renderer 共用的唯一 Electron IPC 契约，同时提供 DTO、平台联合和 channel 常量。preload 与 renderer 不再用 `unknown` 表示业务参数或结果；只有主进程 IPC 入口把跨进程输入视为 `unknown`，完成必要的结构校验并投影为共享 DTO。账号相关输入统一使用 `accountId`，发布输入统一使用 camelCase 字段，不兼容旧 `id`、`account_id` 和平台选项 snake_case 别名。

根目录 TypeScript 工程已启用 `strict: true`，主进程、脚本和 `src/` 下的运行时代码必须通过严格类型检查，不保留目录级豁免。

`npm run dev` 会选择空闲端口启动当前项目的 Vite，并通过 `RENDERER_DEV_SERVER_URL` 将准确地址交给 Electron。Electron 不再探测固定端口，因此不会连接其他项目或工作区的开发服务器。`npm start` 和打包后的应用只加载 `app/dist/index.html`。

`app/App.vue` 是正式渲染入口；`app/src/App.vue` 和 `app/src/scripts/sse-register.ts` 是后端联调 Demo，不能作为废弃目录删除。

## 日志规范

项目源码统一通过 logger 输出控制台日志。Node、Electron 和脚本使用 `src/utils/logger.ts`，浏览器代码使用 `app/src/utils/logger.ts`；两个实现只暴露 `logger.info(...values)` 和 `logger.error(...values)`，业务代码禁止直接调用 `console.*`。

日志使用运行机器的本地时区和 24 小时制，格式固定为：

```text
[2026-07-11 14:30:05] - [agenthunt] - [INFO] - 开始发布
[2026-07-11 14:30:06] - [agenthunt] - [ERROR] - 发布失败
```

对象会压缩为单行 JSON；普通字符串及错误堆栈中的换行保持不变，并且每次 logger 调用只添加一次前缀。`Buffer`、ArrayBuffer、TypedArray 和 DataView 会显示 Base64 编码后的前 100 个字符，同时记录类型、原始字节数和截断状态。Blob、File 只记录名称、MIME 和字节数；FormData 会展开字段并按相同规则描述其中的文件。

平台协议日志可能包含 HTTP Header、Cookie、Token 和请求数据；部分平台会对身份 Header 做定向脱敏，但生产日志仍不得交给无关人员。ESLint 对业务源码启用 `no-console`，仅两个 logger 实现及其契约测试允许访问原生 console。

## 平台资源基础设施

`src/infra` 按资源而不是按平台组织，只包含账号和视频两个目录：

```text
src/infra/
├── browser-identity.ts
├── browser-storage-state.ts
├── account/
│   ├── account.ts
│   ├── account-browser-window.ts
│   ├── account-backend-flow.ts
│   ├── account-backend-window.ts
│   ├── account-login-flow.ts
│   ├── account-login-window.ts
│   ├── baijiahao-account.ts
│   ├── bilibili-account.ts
│   ├── douyin-account.ts
│   └── sohu-account.ts
└── video/
    ├── video.ts
    ├── baijiahao-video.ts
    ├── baijiahao/{media,publish,record-status}.ts
    ├── bilibili-video.ts
    ├── bilibili/{publish,record-status}.ts
    ├── douyin-video.ts
    ├── douyin/{upload,electron-runtime,record-status}.ts
    ├── sohu-video.ts
    └── sohu/{publish,record-status}.ts
```

`account.ts` 定义登录和探活接口，`video.ts` 通过基础接口、四个平台输入接口和 `Video<TPayload>` 定义预发布演练、发布和发布状态查询能力。业务调用方通过 `createAccount(platform)` 和 `createVideo(platform)` 获取具体实现。`browser-storage-state.ts` 是账号登录、探活和 HTTP 视频协议共同使用的 storage-state 结构与读写入口；`browser-identity.ts` 统一选择宿主系统对应的两份固定浏览器身份文件。平台登录保存草稿账号文件后必须调用同一个 HTTP `ping()` 完成最终在线校验和昵称读取；不再通过 DOM 或 Playwright 单独同步昵称。

各平台实现有意保持自包含。除浏览器身份、storage-state、日志和视频契约外，Cookie 业务校验、HTTP 请求、上传重试和状态解析不跨平台复用。平台目录内允许少量重复代码，避免形成通用 HTTP、Cookie、分片或视频工具层。新增平台时必须分别提供 `Account` 和 `Video` 实现，不再使用旧的 `platformRegistry` 或 `src/infra/platforms` 目录。

### 发布工作台迁移

正式渲染器侧边栏包含“发布”入口。作品页勾选已完成作品后使用“加入发布”直接写入应用级待发布队列并切换到发布页，不再打开旧账号选择或发布计划弹窗；相同作品按作品 ID 去重。未配置作品展示“添加账号”按钮，该按钮打开独立的账号选择抽屉，可按平台或账号标签筛选并为当前作品绑定一个在线账号，此时“发布设置”置灰且不可点击；绑定后可点击账号信息重新选择账号。“发布设置”抽屉不包含账号选择，只根据作品已经绑定的账号平台展示字段。公共字段为标题和简介；抖音增加可见范围；Bilibili 按账号加载投稿分区；搜狐按账号加载一级、二级频道；百家号、Bilibili 和抖音提供各自合法时间窗口内的定时发布。右下角“发布检测”会按平台和账号 ID 对当前条目去重，再分批调用账号 `ping()` 并刷新账号列表；每个作品分别展示未检测、检测中、检测成功或带原因的检测失败。检测过程中禁止添加、更换账号、修改发布设置或删除条目，账号或发布设置后续变化时对应结果重置。设置保存在对应待发布作品上，发布页支持移除作品，退出登录时会清空队列。当前迁移页仍不直接提交发布任务。

### 视频上传链路

Bilibili、百家号、抖音和搜狐的 `xx-video.ts` 是稳定门面，只实现 `dryRun()`、`upload()` 和 `fetchPublishedState()` 并调用同平台语义模块。三个 HTTP 平台以 `publish.ts` 和 `record-status.ts` 为主；百家号额外使用 `media.ts` 处理 MP4 元数据、MD5 和封面；抖音由 `electron-runtime.ts` 管理窗口、IPC 与签名宿主，`upload.ts` 执行 renderer 上传协议。调用关系保持单向，不使用平台目录 barrel 文件。

- 四个平台都要求标题、视频和封面，封面缺失时任务不会提交。
- 发布标题按 Unicode 码点统一截断：百家号 50、Bilibili 80、抖音 30、搜狐 30；四平台简介统一截断为 100。规范化结果同时用于远程任务和平台投稿，搜狐不再使用旧的 60 字符上限报错。
- Bilibili、百家号和抖音使用平台服务端定时能力，逐条计划按上海时区填写 `YYYY-MM-DD HH:mm`；搜狐仍仅支持立即发布。UI 在平台原始最小提前量上固定预留 10 分钟上传时间，同账号批量任务不按队列位置继续增加余量。
- Bilibili 必须按账号动态查询并选择投稿分区 `humanTypeId`。
- 搜狐必须按账号动态查询一级、二级频道。UI 自动选择首个有效组合，底层发布仍强制要求显式 `channelId` 和 `videoChannelId`，并校验父子关系。
- 搜狐使用 Node.js + Axios 复刻生产内容管理协议，以 512 KiB、并发 3 的方式流式上传视频分片；旧的发布窗口、DOM 填表和点击发布路径已废弃。
- 搜狐账号文件必须包含 Cookie、`vuex`、`sp-cm` 和 `dv-id`。历史残缺账号需要重新登录，不提供浏览器发布兜底。
- 抖音必须逐任务选择 `public`、`friends` 或 `self`，默认 `public`。
- 抖音 HTTP 上传复用当前应用的账号级 Electron partition，不启动第二个 Electron Profile。
- 四个平台通过同一个身份 loader 根据宿主 OS 读取 `assets/browser-identity` 下对应的固定 Chrome 138 身份文件。登录窗口统一应用 UA、平台、语言、Client Hints 和时区；平台 HTTP 协议按需使用其中字段。不通过环境变量或运行参数回退或自定义身份。GPU、CPU、内存和屏幕信息仍由当前宿主 Chromium 提供。
- 抖音最终投稿被安全网关要求身份验证时，任务会直接失败并报告账号昵称、验证原因、验证场景和可用验证方式；完成同一账号 partition 中的身份验证后再重新发布。
- `dryRun()` 执行完整预发布流程但不进行最终投稿，成功时不返回内部准备上下文。四个平台的演练都可能上传远端临时素材；抖音演练结束后会关闭隐藏窗口、IPC 和 Session 资源。清理失败只记录日志，不向调用方抛错。
- 最终投稿请求和整条发布流程不会自动重试。搜狐发布链路只重试 GET 网络错误、429 和 5xx，所有写请求（包括分片）失败后直接暴露；搜狐审核查询关闭 Axios 内层重试，交由主进程每 30 秒重试。其他平台只对各自可安全重复的探测请求及分片做有限重试。
- HTTP 调试日志按原 Service 行为输出完整 Header、Cookie、Token 和响应，请勿把生产日志交给无关人员。
- 远程任务保存平台作品 ID、公开链接和非敏感发布选项。搜狐将投稿成功响应的标量 `data` 保存为 `postId` 和 `review_state_clues.platform_work_id`；该值对应作品列表的 `record.id`，不兼容 `clientNewsId`。

### 发布状态监控

抖音、百家号、Bilibili 和搜狐投稿成功后由 Electron 主进程注册独立监控：首轮在 30 秒后执行，之后每 30 秒查询一次，最多等待 2 小时。定时投稿的截止时间为平台计划发布时间加 2 小时；立即投稿以投稿成功时间为基准。应用重启后会恢复带 `platform_work_id` 的 `reviewing` 和 `running` 任务；搜狐活跃任务缺少 ID 时可从投稿响应 `data` 或旧审核记录 `raw.id` 回填。退出时清理所有计时器和在途请求。

四个平台的审核查询均使用账号 storage-state 中的 Cookie 直连平台 HTTP 接口，不再启动 Playwright browser/context，也不使用标题、链接或发布时间匹配。平台审核失败映射为 `non_public`；发布过程被中断、记录无法恢复和审核超时映射为 `failed`。网络错误、HTTP 错误及响应结构错误不改变任务状态，只写入 `review_state.sync_error` 并在下一轮重试。已经取得平台终态但远程任务写回失败时只重试写回，不重复请求平台。状态变化通过主进程 IPC 通知记录页刷新，记录页不建立自己的轮询计时器。

记录页在状态胶囊后显示信息图标，并通过悬浮或键盘聚焦提示状态原因。提示依次读取任务状态原因、审核原因、同步错误、发布失败详情和 `error_msg`，不使用带问号的系统帮助光标。

记录页不单独占用“账号 ID”和“预约发布时间”列；每条记录通过操作列的纵向三点轻菜单查看记录 ID、账号 ID、预约时间并执行删除操作。

记录页在状态右侧单独显示任务创建时间，并按当前系统本地时区格式化为年月日和时分。

上传实现复用 `axios-retry`、`crc-32`、`file-type`、`mp4box`、`p-limit` 和 `sharp`，搜狐迁移没有新增依赖。抖音隐藏网络窗口脚本由 `npm run build:electron` 生成到 `.build/douyin-publish-renderer.js`。

## 账号浏览器环境隔离

平台账号登录窗口使用账号级 Electron `persist:` partition 隔离浏览器状态。partition 映射持久化在：

`~/.agenthunt/partition-map.json`

旧目录 `~/.matrix-account` 不再作为账号状态读写路径。

```json
{ "partition_map_table": { "1001": "persist:rpa-MTAwMQ" } }
```

- 同一个账号 ID 复用同一个 partition，重启后从本地映射恢复。
- 不同账号 ID 使用不同 partition，避免浏览器状态串号。
- 主应用窗口使用 `persist:app-main`，不与平台账号页面共用。
- 登录窗口关闭不会删除账号 partition。
- 登录窗口不向平台页面注入悬浮关闭按钮，只通过原生标题栏或 `Cmd/Ctrl+W` 关闭，也不响应 `Esc`。
- 新账号登录窗口和已有账号后台窗口都会在 frame 导航阶段静默拦截平台隐藏 iframe 发起的 `bitbrowser:` 外部协议探测，避免 Windows 弹出应用关联提示；HTTP/HTTPS 平台导航不受影响。
- 登录窗口确认成功并保存草稿账号文件后，四个平台统一执行一次最多 20 秒的 HTTP `ping()`；离线或检测异常时不创建远程账号。
- `ping()` 返回昵称时直接创建远程账号；昵称缺失时先创建账号，再在写入账号文件路径和 partition 的同一次更新中使用远程账号 ID 作为昵称。
- 账号管理页执行日常 `ping()` 前会检查 cookie 文件和已绑定的 partition；任一不存在时不请求平台接口，直接同步为离线，也不自动补建 partition 映射。

账号管理页为抖音、Bilibili、百家号和搜狐号提供“账号后台”入口。入口使用账号专属 partition 打开平台后台首页，并以模态窗口和前端遮罩阻止主界面继续操作；全局同时最多存在一个账号后台窗口。已有 storage-state 会在加载前恢复 Cookie 和 localStorage，文件失效或缺失时仍允许用户在窗口内重新登录。检测到有效登录态后立即回写账号文件、在线状态和昵称，窗口关闭前再保存一次；重新登录其他同平台账号视为换绑当前系统账号。

账号后台统一从平台后台首页进入，登录态失效时允许平台自行跳转登录页或跨域同步页。首次主页面需要在 30 秒内加载成功；正常鉴权跳转产生的 `ERR_ABORTED` 不视为失败，真正的主页面加载错误或启动超时会解除遮罩并提示用户。页面成功打开后不设置使用超时，只使用原生标题栏与 `Cmd/Ctrl+W` 关闭，不拦截 `Esc`，网页请求打开的新窗口统一交给系统浏览器。首次页面加载前关闭窗口不会保存不完整状态；打开后关闭时保存失败不会阻止窗口关闭，账号管理页会显示错误通知。账号后台不监听用户在平台页面中的手动发布行为，也不会补建发布记录。只要应用级发布进度中仍存在等待、准备、排队或上传投稿任务，前端就拒绝打开账号后台；平台已接受投稿后的审核阶段不属于该互斥范围。

## 已移除能力

历史人工验证码存储模块及其桌面轮询链路已删除，因为其依赖的 runtime store 不存在。抖音发布短信验证码仍支持通过 `MATRIX_DOUYIN_PUBLISH_SMS_CODE` 环境变量自动填写。

登录后的 `syncNickname()` 接口、登录结果昵称字段，以及四个平台基于 DOM/Playwright 的昵称提取实现均已删除。账号昵称统一来自 HTTP `ping()` 响应。
