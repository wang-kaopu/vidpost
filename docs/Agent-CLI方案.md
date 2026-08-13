# VidPost Agent CLI 方案

CLI 与桌面端共享本地 SQLite、平台账号文件和平台直连能力，不再携带 VidPost 服务器 Authorization，也不访问服务器作品中心或远端发布任务。

## 请求格式

请求文件只包含本地账号 ID、本地素材路径和平台发布参数：

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

`videoPath` 和 `coverPath` 必须是本地非空文件。CLI 使用与桌面端相同的 `~/.vidpost/vidpost.db` 和账号 Cookie 文件，不接受服务器地址、手机号 token 或远端作品 ID。

## 事件与退出码

stdout 使用 JSONL：

```json
{"version":1,"type":"ready","command":"publish","pid":12345}
{"version":1,"type":"progress","taskId":"job-uuid","phase":"preparing"}
{"version":1,"type":"progress","taskId":"job-uuid","phase":"publishing"}
{"version":1,"type":"result","taskId":"job-uuid","status":"reviewing","localRecordId":789,"platformWorkId":"...","link":"..."}
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

stdout 和日志不得输出 Cookie、Authorization、账号文件内容或完整本地路径。CLI 模式不创建 Vue 主窗口；抖音仍可按平台直连需要创建隐藏运行时窗口。
