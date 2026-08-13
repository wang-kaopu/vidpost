# VidPost Agent CLI 方案

VidPost 提供基于 Electron 的无主窗口 CLI，供上层 Agent 通过 `spawn()` 调用。正常命令不创建主界面；抖音发布仅创建不可见的签名与网络窗口，以保持真实 Chromium 的 Cookie、网页安全 SDK 和平台请求环境。

```text
Agent
  └─ spawn(VidPost CLI)
       ├─ Electron 初始化
       ├─ 不创建主界面
       ├─ 抖音仅创建隐藏签名窗口
       ├─ stdout 输出 JSONL 事件
       └─ 完成后清理并退出
```

## 命令

```bash
vidpost publish --request /absolute/path/request.json
vidpost ping --request /absolute/path/request.json
vidpost status --request /absolute/path/request.json
vidpost doctor --platform douyin --account-id 123
vidpost login --platform douyin --account-id 123
```

`publish`、`ping` 和 `status` 不显示窗口。`login` 是唯一允许展示登录窗口的命令，供人工扫码或处理验证码。

开发态由 Agent 调用 Electron：

```ts
spawn(electronBinary, [projectRoot, "--mode=cli", "publish", "--request", requestPath], {
  cwd: projectRoot,
  env: {
    ...process.env,
    VIDPOST_API_AUTHORIZATION: authorization,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
```

## 请求与事件协议

请求文件只包含业务参数，授权信息通过环境变量传入，避免出现在命令行或 stdout。

```json
{
  "version": 1,
  "task": {
    "platform": "douyin",
    "accountId": "123",
    "accountName": "账号名称",
    "progressId": "job-uuid",
    "workId": "456",
    "title": "标题",
    "introduction": "简介",
    "videoUrl": "https://example.com/video.mp4",
    "coverUrl": "https://example.com/cover.jpg",
    "videoType": "ai_ad_video",
    "scheduledAt": "",
    "visibility": "public"
  }
}
```

stdout 只能输出 JSON Lines：

```json
{"version":1,"type":"ready","command":"publish","pid":12345}
{"version":1,"type":"progress","taskId":"job-uuid","phase":"preparing"}
{"version":1,"type":"progress","taskId":"job-uuid","phase":"uploading"}
{"version":1,"type":"progress","taskId":"job-uuid","phase":"publishing"}
{"version":1,"type":"result","taskId":"job-uuid","status":"submitted","remoteTaskId":789,"platformWorkId":"...","link":"..."}
```

失败事件：

```json
{"version":1,"type":"error","taskId":"job-uuid","code":"ACCOUNT_AUTH_REQUIRED","message":"账号需要重新登录","retryable":false}
```

| 退出码 | 含义 |
| ---: | --- |
| 0 | 成功 |
| 2 | 命令或请求参数错误 |
| 3 | 登录态、验证码或账号验证问题 |
| 4 | 素材、平台参数或发布时间错误 |
| 5 | 网络、平台临时故障或账号忙 |
| 6 | 收到终止信号后取消 |
| 1 | 未分类内部错误 |

## 生命周期

- 每个子进程只执行一个任务，完成后立即退出。
- 同账号任务使用跨进程锁；锁已占用时返回 `ACCOUNT_BUSY`。
- 收到 `SIGTERM` 或 `SIGINT` 时，CLI 停止后续阶段、关闭隐藏窗口、输出 `CANCELLED` 事件并以退出码 `6` 结束。
- stdout 和日志不得输出 Cookie、Authorization、Token、账号文件内容或完整本地路径。
- macOS CLI 模式调用 `app.dock?.hide()`，确保不显示 Dock 图标。

## 文件级实施清单

- 修改 `main.ts`：解析 `--mode=cli`；CLI 模式不创建主窗口、不加载 Vue、不注册桌面 IPC 或 deep link；保留 Electron、logger、抖音隐藏运行时初始化与退出清理。
- 新增 `src/cli/index.ts`：解析命令、读取 `--request`、注册信号处理、输出 JSONL 和设置退出码。
- 新增 `src/cli/protocol.ts`：定义请求、事件、错误码和退出码 DTO，并统一敏感字段脱敏规则。
- 新增 `src/cli/publish-command.ts`：适配 `publish` 请求并输出阶段事件。
- 新增 `src/service/publish-command-service.ts`：从 `src/funcs.ts` 抽离参数校验、发布输入组装和任务调用，接受 `onProgress` 回调。
- 修改 `src/funcs.ts`：保留 Electron IPC 适配，不再持有核心发布编排逻辑。
- 修改 `src/api/api-client.ts`：增加 `configureApiAuthorization()`；CLI 使用 `VIDPOST_API_AUTHORIZATION`，桌面端继续读取已登录用户 token。
- 新增 `test/cli-protocol.test.ts` 和 `test/cli-entry.test.ts`：覆盖 JSONL、错误映射、退出码、信号取消、敏感信息不泄漏和隐藏运行时清理。
- 修改 `README.md`：增加 Agent `spawn()` 示例、请求格式、事件协议、退出码与人工登录说明。
