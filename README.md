# VidPost

VidPost 是一个 Electron + Vue 的本地多平台视频发布客户端。应用不依赖 VidPost 自有服务器：平台账号登录、账号探活、视频投稿、审核状态查询和发布记录都在本机完成。

## 本地数据

- SQLite 数据库：`~/.vidpost/vidpost.db`
- 平台 Cookie / storage-state：`~/.vidpost/cookie_files/<accountId>_<platform>.json`
- 浏览器 partition 映射：`~/.vidpost/partition-map.json`

SQLite 只由 Electron 主进程访问，renderer 通过受限 IPC 获取账号和发布记录 DTO。数据库启动时启用外键、WAL 和 5 秒 busy timeout，并在事务中执行版本迁移。平台 Cookie 和浏览器 storage-state 不写入 SQLite。

## 安装与开发

```bash
nvm use
npm install
npm run dev
```

常用验证命令：

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`better-sqlite3` 是主进程的 SQLite 驱动；其原生模块会被 Electron Forge 自动加入生产依赖，并在 ASAR 中解包。

## 使用流程

### GUI

1. 在“账号”页选择平台并完成平台账号登录。
2. 在“发布”页选择本地视频和封面，绑定平台账号并填写标题、简介与平台选项。
3. 执行发布检测后确认投稿。
4. 在“记录”页查看本地发布记录、平台审核状态和失败原因。

### CLI

CLI 与 GUI 共用本机的账号、Cookie 和发布记录。打包后的可执行文件以 `vidpost` 表示；开发环境可将下列命令替换为 `npm run dev -- <命令>`。

1. 先通过登录命令完成对应平台的人工登录；命令会打开平台登录窗口，成功后在 stdout 输出包含本地 `accountId` 的 JSONL 结果。

   ```bash
   vidpost login douyin
   ```

   支持的平台为 `baijiahao`、`bilibili`、`douyin` 和 `sohu`。

2. 创建发布请求 JSON。`videoPath` 和 `coverPath` 必须是本地非空文件的绝对路径；`accountId` 必须是上一步登录得到的本地账号 ID。

   ```json
   {
     "version": 1,
     "task": {
       "platform": "douyin",
       "accountId": 123,
       "accountName": "账号名称",
       "progressId": "job-uuid",
       "title": "标题",
       "introduction": "简介",
       "videoPath": "/absolute/path/video.mp4",
       "coverPath": "/absolute/path/cover.jpg",
       "scheduledAt": "",
       "visibility": "public"
     }
   }
   ```

   平台专属参数：Bilibili 需要 `humanTypeId`，搜狐需要 `channelId` 和 `videoChannelId`，抖音需要 `visibility`（`public`、`friends` 或 `self`）；百家号不需要额外参数。

3. 传入请求文件执行发布。stdout 依次输出 `ready`、`progress` 和 `result` 或 `error` JSONL 事件，适合由脚本或 Agent 解析。

   ```bash
   vidpost publish /absolute/path/request.json
   ```

4. 使用 `records` 查看本地发布记录；可选的查询 JSON 可按账号、平台、状态、标题、备注、计划时间和分页条件筛选。

   ```bash
   vidpost records
   vidpost records /absolute/path/query.json
   ```

视频和封面始终使用本地绝对路径；原始文件不会被应用删除。平台上传、审核查询和账号探活仍需要对应内容平台的网络连接，但不需要 VidPost 后端、手机号登录、Authorization token 或远端作品中心。

## 项目结构

- `main.ts` / `preload.ts`：Electron 生命周期、SQLite 初始化和受限 IPC。
- `src/db/`：SQLite 连接与迁移。
- `src/repository/`：账号、标签和发布记录仓储。
- `src/service/`：账号队列、发布编排和审核状态恢复。
- `src/infra/account/`：四个平台账号登录与探活。
- `src/infra/video/`：四个平台投稿和审核查询。
- `app/src/views/`：账号、发布和记录工作区。

账号与发布记录是本地数据，不会与服务器同步；删除或迁移应用前请自行备份 `~/.vidpost`。
