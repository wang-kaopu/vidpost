# VidPost 本地化 SQLite 重构方案

## 目标

移除 VidPost 自有服务器相关功能，应用不再进行手机号登录、Token 刷新、用户资料查询、服务器作品浏览、远端账号同步或远端发布任务写回。

保留与内容平台直接交互的能力：平台账号登录、账号探活、视频发布、审核状态查询和本地发布记录。

```text
移除：VidPost 后端
  ├─ 用户登录与用户会话
  ├─ 服务器作品列表与作品详情
  ├─ 远端账号 API
  └─ 远端发布任务 API

保留：内容平台直连
  ├─ 平台账号 Cookie 与 Electron partition
  ├─ 平台账号登录与探活
  ├─ 本地视频、封面与发布参数
  ├─ 平台投稿与审核查询
  └─ SQLite 本地账号和发布记录
```

## 技术选型

使用 `better-sqlite3` 作为 Electron 主进程的 SQLite 驱动。

```bash
npm install better-sqlite3
npm install -D @types/better-sqlite3
```

账号和发布记录是小规模、短生命周期的事务型数据，`better-sqlite3` 的同步 API 足以满足需求，并且比自定义 JSON 文件锁和原子写入更可靠。数据库仅在主进程访问；renderer 必须通过受限 Electron IPC 查询和修改数据。

数据库文件固定为：

```text
~/.vidpost/vidpost.db
```

平台 Cookie 和浏览器 storage-state 继续保留在文件系统中，不写入数据库：

```text
~/.vidpost/cookie_files/<accountId>_<platform>.json
```

## 数据库结构

```sql
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY,
  platform TEXT NOT NULL,
  platform_account_id TEXT NOT NULL,
  nickname TEXT NOT NULL,
  remark_name TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  cookie_file TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(platform, platform_account_id)
);

CREATE TABLE account_tags (
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  PRIMARY KEY(account_id, tag)
);

CREATE TABLE publish_records (
  id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id),
  platform TEXT NOT NULL,
  title TEXT NOT NULL,
  introduction TEXT NOT NULL,
  video_path TEXT NOT NULL,
  cover_path TEXT NOT NULL,
  scheduled_at TEXT NOT NULL DEFAULT '',
  platform_options_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL,
  platform_work_id TEXT,
  published_link TEXT,
  publish_result_json TEXT,
  review_state_json TEXT,
  error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX publish_records_by_account_created_at
  ON publish_records(account_id, created_at DESC);

CREATE INDEX publish_records_by_status_updated_at
  ON publish_records(status, updated_at);
```

启动时必须执行 `PRAGMA foreign_keys = ON`、`PRAGMA journal_mode = WAL` 和 `PRAGMA busy_timeout = 5000`。migration 必须在事务中执行，失败时中止启动，不回退到 JSON 文件。

## 文件级实施清单

### 新增文件

- `src/db/database.ts`
  - 打开和关闭 `~/.vidpost/vidpost.db`。
  - 配置 SQLite pragma，并按版本顺序执行 migration。
  - 对外暴露仅限主进程使用的数据库连接获取函数。

- `src/db/migrations/001-initial-schema.ts`
  - 创建 `schema_migrations`、`accounts`、`account_tags` 和 `publish_records`。
  - 写入 migration 版本记录。

- `src/db/migrations/index.ts`
  - 按版本导出 migration 列表。
  - 拒绝重复版本号和版本间断。

- `src/repository/account-repository.ts`
  - 提供账号 UPSERT、账号筛选分页、标签替换、状态更新和账号删除。
  - 平台账号唯一键使用 `platform + platform_account_id`。

- `src/repository/publish-record-repository.ts`
  - 提供本地发布记录创建、阶段更新、审核状态写入、筛选分页和待恢复任务查询。
  - `platform_options_json`、`publish_result_json` 和 `review_state_json` 必须在读写时校验为对象。

- `test/database.test.ts`
  - 验证空目录初始化、migration、外键约束、WAL 配置和损坏数据库失败行为。

- `test/account-repository.test.ts`
  - 验证账号 UPSERT、标签替换、筛选分页和删除级联行为。

- `test/publish-record-repository.test.ts`
  - 验证记录创建、状态变更、审核恢复查询和 JSON 字段校验。

### 删除文件

- `app/src/api/auth.ts`
- `app/src/api/works.ts`
- `app/src/api/request.ts`
- `app/src/api/types.ts`
- `app/src/views/LoginView.vue`
- `app/src/views/WorksView.vue`
- `app/src/config/session.ts`
- `src/api/account-api.ts`
- `src/api/task-api.ts`
- `src/api/api-client.ts`
- `src/api/model/response.ts`
- `src/api/model/task-model.ts`

删除后还必须从所有 import、测试和文档中移除对应引用。

### 修改文件

- `package.json`
  - 添加 `better-sqlite3` 与 `@types/better-sqlite3`。
  - 移除只用于 VidPost 后端请求的 `axios` 与 `axios-retry`；如果平台直连实现仍依赖 Axios，则保留它们。

- `scripts/forge-packaging.ts`
  - 将 `better-sqlite3` 与其传递原生依赖加入生产运行时白名单。

- `forge.config.ts`
  - 将 `better-sqlite3` 加入 ASAR 解包规则，确保原生 `.node` 文件可加载。

- `main.ts`
  - 在应用准备就绪后初始化 SQLite。
  - 注册本地账号和发布记录 IPC。
  - 在退出流程关闭数据库连接。
  - 删除依赖服务器用户登录或作品页的启动导航处理。

- `shared/electron-api.ts`
  - 删除用户登录、用户资料、作品列表和作品详情 DTO 与 IPC。
  - 新增本地账号、发布记录和本地素材发布 DTO 与 IPC channel。
  - 发布输入改为 `videoPath`、`coverPath`，不再使用服务器作品 URL 或 `workId`。

- `preload.ts`
  - 删除用户登录与作品查询暴露接口。
  - 暴露本地账号查询、发布记录查询、本地素材选择和发布接口。

- `src/service/account-service.ts`
  - 平台登录和 `ping()` 成功后调用 `account-repository` 写入 SQLite。
  - 删除远端账号创建、更新、查询和远端账号 ID 依赖。

- `src/service/task-service.ts`
  - 创建 SQLite 发布记录后执行平台投稿。
  - 在事务边界内记录 preparing、running、reviewing、public、non_public 和 failed 状态。
  - 删除远端发布任务创建、更新和素材 URL 下载逻辑。

- `src/service/task-state-service.ts`
  - 从 `publish-record-repository` 恢复 `running` 和 `reviewing` 记录。
  - 审核状态变化只写入 SQLite 并通过 IPC 通知 renderer。

- `src/funcs.ts`
  - 发布调用改为接收本地素材路径。
  - 账号登录、探活、发布和状态查询全部使用本地 repository。

- `app/src/App.vue`
  - 删除手机号登录、Token 刷新、用户资料、退出登录和路由鉴权。
  - 应用启动后直接显示工作区。

- `app/src/router/index.ts`
  - 删除 `/login`、`/works` 与 `requiresAuth` 守卫。
  - `/` 和未知路由重定向到 `/accounts`。

- `app/src/types.ts`
  - 删除 `User`、`LoginForm`、`LoginResponse`、`works` 菜单类型和服务器作品类型。
  - 新增本地账号、发布记录和本地素材选择类型。

- `app/src/components/SidebarNav.vue`
  - 删除作品导航、用户资料展示和退出登录菜单。
  - 保留账号、发布和记录入口。

- `app/src/components/AppContentTransition.vue`
  - 从视图顺序中移除 `works`。

- `app/src/views/PublishView.vue`
  - 删除服务器作品跳转、作品详情加载和 `fetchWorkPublishPayload()`。
  - 增加本地视频与封面文件选择，并把绝对路径保存到发布队列。

- `app/src/store/publish-queue.ts`
  - 队列条目保存 `videoPath`、`coverPath`、标题、简介和平台选项。
  - 删除 `workId`、远端视频 URL、远端封面 URL 和服务器作品类型依赖。

- `app/src/views/AccountsView.vue`
  - 使用 Electron IPC 查询 SQLite 账号列表、筛选条件和标签。
  - 不再发起 HTTP 请求。

- `app/src/views/RecordsView.vue`
  - 使用 Electron IPC 查询 SQLite 发布记录和状态原因。
  - 不再发起 HTTP 请求。

- `README.md`
  - 删除服务器地址、用户登录和作品中心说明。
  - 说明本地 SQLite 路径、平台账号登录、本地素材发布和数据不可与服务器同步。

- `docs/Agent-CLI方案.md`
  - CLI 请求示例改为 `videoPath` 和 `coverPath`。
  - 删除服务器授权环境变量与远端任务语义。

## 实施顺序

1. 添加 SQLite 驱动、Forge 原生模块配置、数据库初始化和 migration 测试。
2. 实现 repository，并将账号服务和发布任务服务切换至 SQLite。
3. 更新 Electron IPC 契约与 preload，确保 renderer 不可直接访问数据库。
4. 删除用户登录和作品浏览页面、路由、前端 API 与会话状态。
5. 将发布页和 CLI 输入切换为本地文件路径。
6. 切换账号页、记录页到本地 IPC 数据源。
7. 删除遗留服务器模块、更新文档并执行全量检查。

## 验收标准

- 应用首次启动不请求 VidPost 服务器，也不显示用户登录页。
- 账号登录、探活、发布和审核查询均可在无网络后端的情况下直接访问内容平台。
- 重启应用后，本地账号、标签、发布记录和审核中任务可从 SQLite 恢复。
- renderer 不含数据库文件路径、SQLite 连接或后端 Authorization token。
- `npm run lint`、`npm run typecheck`、`npm test` 和 `npm run build` 全部通过。
