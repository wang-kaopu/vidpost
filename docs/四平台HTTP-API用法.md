# 四平台 HTTP API 用法

本文汇总项目对哔哩哔哩、百家号、搜狐号和抖音创作者后台发出的全部平台 HTTP 请求，覆盖账号在线检测、视频与封面上传、发布辅助数据、最终发布和作品状态查询。

> 这些接口是项目根据各平台 Web 创作者后台实现的非公开接口，不是平台承诺稳定的开放 API。Cookie、CSRF、临时上传凭证、上传节点和签名都有账号或会话绑定关系，不能跨账号复用。文中的占位符不能直接用于生产请求。

## 1. 范围与约定

本文只统计 `src/infra/account/*-account.ts` 和 `src/infra/video/*-video.ts` 中发往四个平台域名的 HTTP 请求，不包括：

- Electron 登录窗口的页面导航；
- 项目自身的任务服务 API；
- SSE 通知；
- 返回结果中的作品页、图片 CDN 或视频播放链接。

请求示例使用下列占位符：

| 占位符 | 含义 |
| --- | --- |
| `<COOKIE>` | 从 Playwright storage-state 中筛选出的平台 Cookie Header |
| `<UA>` | 当前平台链路使用的 User-Agent |
| `<ACCOUNT_ID>` | 搜狐平台账号 ID |
| `<APP_ID>` | 百家号 `app_id` |
| `<CSRF>` | B 站 `bili_jct` 或抖音 `X-Secsdk-Csrf-Token`，以所在章节为准 |
| `<UPLOAD_URL>` | 预上传/创建上传任务后由平台动态返回的上传地址 |
| `<AUTH>` | 上传节点返回的临时授权值 |
| `<WORK_ID>` | 最终发布返回的平台作品 ID |

四个平台的总体调用顺序如下：

| 平台 | 账号检测 | 发布主链路 | 状态查询 |
| --- | --- | --- | --- |
| 哔哩哔哩 | `nav` | 分区 → 两次预上传 → multipart 初始化 → 分片 → 合并 → 封面 → 投稿 | `archives`，最多 3 页 |
| 百家号 | `appinfo` | app_id → 预上传 → 两张封面 → 分片 → 完成 → 话题 → 发布 | `article/lists`，固定首页 |
| 搜狐号 | `check/user` + `account/info` | 鉴权 → 频道 → 创建视频 → 分片 → 合并 → 封面 → 压缩 → 额度 → 发布 | `users/news`，最多 3 页 |
| 抖音 | `user/info` | CSRF → UID → 临时密钥 → VOD 视频 → ImageX 封面 → 话题 → BDMS 签名 → 发布 | `aweme/post`，固定首页 |

## 2. 哔哩哔哩

### 2.1 认证与公共请求配置

- Cookie 来源：storage-state 中未过期的 `bilibili.com` 及其子域 Cookie。
- 发布链路必须存在 `bili_jct`，其值同时作为 `csrf` Query/表单字段。
- 上传与投稿 Referer：`https://member.bilibili.com/platform/upload/video/frame`。
- Axios 超时：120 秒；请求体和响应体不限制大小。
- 仅 GET 和 PUT 请求重试，最多 3 次；网络错误、HTTP 429 和 5xx 才重试，使用指数退避。
- multipart 初始化、合并、封面和最终投稿不自动重试，避免重复创建或重复发布。

### 2.2 接口总览

| 方法 | URL | 用途 |
| --- | --- | --- |
| GET | `https://api.bilibili.com/x/web-interface/nav` | 账号在线检测 |
| GET | `https://member.bilibili.com/x/vupre/web/archive/human/type2/list` | 获取可投稿的新分区 |
| GET | `https://member.bilibili.com/preupload` | 获取 meta、视频 UPOS 上传信息 |
| POST | `<UPLOAD_URL>` | 初始化 UPOS multipart |
| PUT | `<UPLOAD_URL>` | 上传视频分片 |
| POST | `<UPLOAD_URL>` | 合并视频分片 |
| POST | `https://member.bilibili.com/x/vu/web/cover/up` | 上传封面 |
| POST | `https://member.bilibili.com/x/vu/web/add/v3` | 最终投稿 |
| GET | `https://member.bilibili.com/x/web/archives` | 查询作品状态 |

### 2.3 账号在线检测

```http
GET /x/web-interface/nav HTTP/1.1
Host: api.bilibili.com
Cookie: <COOKIE>
User-Agent: <UA>
```

判断规则：

- `data.isLogin === true`：在线；昵称优先取 `data.name`，其次取 `data.uname`。
- `data.isLogin === false` 或 HTTP 401/403：离线。
- 整体超时 20 秒；业务代码最多尝试 3 次，但非 HTTP 异常会立即抛出。

### 2.4 获取新分区

```http
GET /x/vupre/web/archive/human/type2/list HTTP/1.1
Host: member.bilibili.com
Cookie: <COOKIE>
Referer: https://member.bilibili.com/platform/upload/video/frame
User-Agent: <UA>
```

成功条件为响应未返回非零 `code`，且 `data.type_list` 或根级 `type_list` 是非空数组。项目把每项规范化为 `{ id, name }`，最终投稿的 `human_type2` 必须属于本次响应。

### 2.5 获取 UPOS 预上传信息

同一接口调用两次：第一次申请 `file_meta.txt`，第二次申请视频文件。

公共 Query：

| 字段 | 值 |
| --- | --- |
| `build` | `2140000` |
| `probe_version` | `20250923` |
| `r` | `upos` |
| `ssl` | `0` |
| `threads` | `2` |
| `upcdn` | `estx` |
| `version` | `2.14.0.0` |
| `webVersion` | `2.14.0` |
| `zone` | `cs` |

差异字段：

| 用途 | `name` | `profile` | `size` |
| --- | --- | --- | --- |
| meta | `file_meta.txt` | `aicovers/bup` | `2000` |
| 视频 | 本地视频文件名 | `ugcfx/bup` | 文件字节数 |

```http
GET /preupload?... HTTP/1.1
Host: member.bilibili.com
Cookie: <COOKIE>
Referer: https://member.bilibili.com/platform/upload/video/frame
```

两个响应都要求 `OK === 1`。meta 响应使用 `upos_uri`；视频响应使用 `auth`、`endpoint`、`upos_uri` 和 `biz_id`。

### 2.6 初始化、上传和合并视频

`<UPLOAD_URL>` 由视频预上传响应拼成：

```text
normalize(endpoint) + "/" + upos_uri.removePrefix("upos://")
```

初始化 multipart：

```http
POST <UPLOAD_URL>?uploads=&output=json&profile=ugcfx/bup&filesize=<SIZE>&partsize=10485760&biz_id=<BIZ_ID>&meta_upos_uri=<META_URI> HTTP/1.1
X-Upos-Auth: <AUTH>
Referer: https://member.bilibili.com/platform/upload/video/frame
```

Body 为 `null`。成功条件为 `OK === 1`，并返回 `upload_id` 和 `key`。

项目按 10 MiB 切片、并发数 2 上传：

```http
PUT <UPLOAD_URL>?chunk=<ZERO_BASED_INDEX>&chunks=<COUNT>&end=<END>&partNumber=<ONE_BASED_INDEX>&size=<CHUNK_SIZE>&start=<START>&total=<FILE_SIZE>&uploadId=<UPLOAD_ID> HTTP/1.1
Content-Type: application/octet-stream
X-Upos-Auth: <AUTH>
Referer: https://member.bilibili.com/platform/upload/video/frame

<CHUNK_BINARY>
```

全部分片成功后合并：

```http
POST <UPLOAD_URL>?biz_id=<BIZ_ID>&name=<VIDEO_NAME>&output=json&profile=ugcfx/bup&uploadId=<UPLOAD_ID> HTTP/1.1
Content-Type: application/json
X-Upos-Auth: <AUTH>
Referer: https://member.bilibili.com/platform/upload/video/frame

{"parts":[{"partNumber":1,"eTag":"etag"}]}
```

合并成功条件为 `OK === 1`。投稿使用的 `filename` 是 multipart `key` 去掉前导 `/` 和扩展名后的值。

### 2.7 上传封面

项目只接受 JPEG、PNG 或 WebP，并把文件转成 Data URL：

```http
POST /x/vu/web/cover/up?csrf=<CSRF>&t=<MILLISECONDS> HTTP/1.1
Host: member.bilibili.com
Cookie: <COOKIE>
Referer: https://member.bilibili.com/platform/upload/video/frame
Content-Type: multipart/form-data

cover=data:<MIME>;base64,<BASE64>
csrf=<CSRF>
```

成功条件为 `code === 0` 且存在 `data.url`。

### 2.8 最终投稿

```http
POST /x/vu/web/add/v3?b_wet=&csrf=<CSRF>&t=<MILLISECONDS>&web_location=1&w_rid=&wts=1781077232 HTTP/1.1
Host: member.bilibili.com
Cookie: <COOKIE>
Referer: https://member.bilibili.com/platform/upload/video/frame
Content-Type: application/json
```

核心 JSON Body：

```json
{
  "cover": "<COVER_URL>",
  "cover43": "<COVER_URL>",
  "title": "<TITLE>",
  "copyright": 3,
  "creation_statement": { "id": -1 },
  "human_type2": 123,
  "tid": 221,
  "tag": "tag1,tag2",
  "desc": "<TITLE>\n<INTRODUCTION>",
  "dynamic": "<TITLE>",
  "videos": [{ "cid": 123456, "desc": "", "filename": "<VIDEO_KEY>", "title": "<TITLE>" }],
  "watermark": { "state": 1 },
  "subtitle": { "lan": "", "open": 0 },
  "dtime": 1780000000
}
```

- `tag` 从描述中的 `#话题` 提取并去重。
- 立即发布时不传 `dtime`；定时发布时为 Unix 秒。
- 成功条件为 `code === 0` 且存在 `data.bvid`，该值作为作品 ID。

### 2.9 查询作品状态

```http
GET /x/web/archives?coop=1&interactive=1&pn=<1..3>&ps=20&status=is_pubing%2Cpubed%2Cnot_pubed HTTP/1.1
Host: member.bilibili.com
Cookie: <COOKIE>
Referer: https://member.bilibili.com/platform/upload/video/frame
User-Agent: <UA>
```

- 最多顺序查询 3 页，按 `Archive.bvid` 精确匹配投稿返回的作品 ID。
- `state` 为 `-30/-1/-6/-7/-8/-10/-13/-60`：`reviewing`。
- `state` 为 `0/-40`：`public`。
- 其他状态：`non_public`，原因组合 `state_desc`、`reject_reason` 和原始状态码。
- 三页均找不到作品：`non_public`。

## 3. 百家号

### 3.1 认证与公共请求配置

- Cookie 来源：storage-state 中未过期的 `baidu.com` 及其子域 Cookie。
- 所有请求携带 `<UA>`；大部分业务请求携带 `Cookie: <COOKIE>`。
- Axios 超时 120 秒，请求体和响应体不限制大小。
- 视频分片由业务代码按 1、2、4 秒间隔最多重试 3 次；其他请求不自动重试。
- 横版视频定义为 `width >= height`，竖版视频定义为 `width < height`。

### 3.2 接口总览

| 方法 | URL | 用途 |
| --- | --- | --- |
| GET | `https://baijiahao.baidu.com/builder/app/appinfo` | 在线检测、获取 `app_id` |
| POST | `https://baijiahao.baidu.com/materialui/video/preuploadvideo` | 创建视频上传任务 |
| POST | `https://baijiahao.baidu.com/pcui/picture/processproxy` | 上传横版/竖版封面 |
| POST | `https://rsbjh10.baidu.com/materialui/video/uploadvideo` | 上传视频分片 |
| POST | `https://baijiahao.baidu.com/materialui/video/compuploadvideo` | 完成视频上传 |
| GET | `https://baijiahao.baidu.com/pcui/pcpublisher/searchtopic` | 搜索话题 |
| POST | `https://baijiahao.baidu.com/pcui/article/publish` | 最终发布 |
| GET | `https://baijiahao.baidu.com/pcui/article/lists` | 查询作品状态 |

### 3.3 在线检测与获取 app_id

```http
GET /builder/app/appinfo HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
User-Agent: <UA>
```

- 在线检测：`data.user` 为对象即在线，昵称取 `data.user.name`；HTTP 401/403 为离线。
- 发布准备：读取 `data.user.app_id`，缺失时终止发布。
- 在线检测整体超时 20 秒，最多尝试 3 次。

### 3.4 创建视频上传任务

```http
POST /materialui/video/preuploadvideo?app_id=<APP_ID> HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
Content-Type: application/json

{
  "app_id": "<APP_ID>",
  "md5": "<FILE_MD5>",
  "is_pay_column": "0",
  "video_type": "short",
  "column_videotype": "",
  "size": "<FILE_SIZE>",
  "org_file_name": "<VIDEO_NAME>"
}
```

横版 `video_type=short`，竖版 `video_type=tiny`。成功条件为 `error_code === 20000`，并返回 `mediaId` 和 `upload_key`。

### 3.5 上传封面

源封面会生成两张 JPEG：横版 1280×720、竖版 1080×1440，并依次调用同一接口。

```http
POST /pcui/picture/processproxy HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
Content-Type: multipart/form-data

action[]=save
base64=<JPEG_BASE64>
videoCover=frontend
```

成功条件为 `errno === 0`，Body 含 `ret.original_url` 和 `ret.url`，响应 Header 还必须包含 `token`。最终发布使用横版封面请求返回的 `token`。

### 3.6 上传和完成视频

项目按 2 MiB 切片、并发数 3 上传：

```http
POST /materialui/video/uploadvideo?app_id=<APP_ID> HTTP/1.1
Host: rsbjh10.baidu.com
Cookie: <COOKIE>
Content-Type: multipart/form-data

app_id=<APP_ID>
md5=<FILE_MD5>
id=WU_FILE_0
name=<VIDEO_NAME>
type=video/mp4
lastModifiedDate=<ISO_TIME>
size=<FILE_SIZE>
chunks=<CHUNK_COUNT>
chunk=<ZERO_BASED_INDEX>
upload_key=<UPLOAD_KEY>
file=<CHUNK_BINARY>
```

单片成功条件为 `error_code === 20000`。全部分片完成后：

```http
POST /materialui/video/compuploadvideo?app_id=<APP_ID> HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
Content-Type: multipart/form-data

upload_key=<UPLOAD_KEY>
chunks=<CHUNK_COUNT>
name=<VIDEO_NAME>
size=<FILE_SIZE>
is_pay_column=0
column_videotype=
type=video
video_type=<short|tiny>
duration=<CEIL_SECONDS>
```

完成成功条件为 `error_code === 0`。

### 3.7 搜索话题

项目从简介提取最多可用的 `#话题`，每个话题独立请求：

```http
GET /pcui/pcpublisher/searchtopic?content=<TOPIC>&resource_type=3&title= HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
```

仅当 `errno === 0` 时处理响应。优先搜索 `data.recommend`；它为空时使用 `data.hot`，并只接受 `title` 完全匹配。多个结果中最终只使用第一个成功话题；话题请求失败不阻断发布。

### 3.8 最终发布

```http
POST /pcui/article/publish?callback=bjhpublish&type=<video|ugc_video> HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
token: <HORIZONTAL_COVER_TOKEN>
Content-Type: application/x-www-form-urlencoded
```

Body 由发布对象 URL 编码。公共关键字段：

| 字段 | 用法 |
| --- | --- |
| `type` | 横版 `video`；竖版 `ugc_video` |
| `content` | JSON 字符串，包含 `mediaId`；横版还含文件名和简介 |
| `title` | 当前实现传清理话题后的简介，不是输入标题 |
| `video_duration` | 向上取整的秒数 |
| `cover_images` | 横版封面或竖版裁剪信息的 JSON 字符串 |
| `vertical_cover_images` | 仅竖版，包含原图、处理图和 1080×1440 裁剪数据 |
| `bjhtopic_id` / `bjhtopic_info` | 存在完全匹配话题时填写 |
| `timer_time` | 定时发布 Unix 秒；立即发布不传 |
| `activity_list` | `[{"id":"aigc_bjh_status","is_checked":0}]` |
| `publish_statement` / `publish_statement_sub` | 均为 `0` |

横竖版的全部默认字段、差异字段和嵌套结构见 6.2.7。

成功条件为 `errno === 0` 且存在 `ret.nid`；`nid` 作为作品 ID。

### 3.9 查询作品状态

```http
GET /pcui/article/lists?collection=&currentPage=1&dynamic=1&pageSize=10&search=&type= HTTP/1.1
Host: baijiahao.baidu.com
Cookie: <COOKIE>
Referer: https://baijiahao.baidu.com/builder/rc/content
User-Agent: <UA>
```

- 响应要求 `errno === 0` 且 `data.list` 为数组。
- 只查询首页 10 条，按 `nid` 精确匹配。
- `publish`、`pre_publish`：`public`。
- `rejected`：`non_public`，原因取 `audit_msg`。
- `withdraw`：`non_public`。
- 其他状态：`reviewing`。
- 未找到：`non_public`。

## 4. 搜狐号

### 4.1 认证与公共请求配置

搜狐请求除 Cookie 外，还依赖 storage-state 的 localStorage：

| 值 | 来源 |
| --- | --- |
| `accountId` | `vuex.app.userInfo.id` |
| `sp-cm` | `${userCode}-sp-cm`，其次 `preview-sp-cm`，再次 `mp-cv` Cookie |
| `dv-id` | `preview-dv-id` |
| `mp-cv` | 同名 Cookie，可选 |

发布链路公共 Header：

```http
Cookie: <COOKIE>
Referer: https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo
User-Agent: <UA>
dv-id: <DV_ID>
sp-cm: <SP_CM>
mp-cv: <MP_CV_IF_PRESENT>
```

- Axios 超时 120 秒。
- 仅 GET 对网络错误、429 和 5xx 自动重试 2 次，指数退避；状态监控关闭此内层重试。
- POST 不自动重试，避免重复创建、上传或发布。
- 通用业务成功码是 `code === 2000000`；视频分片接口成功码是 `100`。

### 4.2 接口总览

| 方法 | URL | 用途 |
| --- | --- | --- |
| GET | `https://mp.sohu.com/mpbp/bp/account/check/user` | 在线检测/发布前鉴权 |
| GET | `https://mp.sohu.com/mpbp/bp/account/info` | 获取账号昵称 |
| GET | `https://mp.sohu.com/mpbp/bp/account/common/channels-data-api` | 一级频道 |
| GET | `https://mp.sohu.com/mpbp/bp/news/v4/videoChannels` | 二级视频频道 |
| POST | `https://mp.sohu.com/commons/mp/createVideo` | 创建视频上传任务 |
| POST | 动态 `vto` 地址 | 上传视频分片 |
| POST | `https://mp.sohu.com/commons/mp/chunkUploadDone` | 合并视频分片 |
| POST | `https://mp.sohu.com/commons/front/outerUpload/image/file` | 上传封面 |
| POST | `https://mp.sohu.com/commons/front/outerUpload/image/thumbnail/url` | 生成裁剪压缩封面 |
| GET | `https://mp.sohu.com/mpbp/bp/news/v4/news/publishLimit` | 查询发布额度 |
| POST | `https://mp.sohu.com/mpbp/bp/news/v4/news/publishVideo/v2` | 最终发布 |
| GET | `https://mp.sohu.com/mpbp/bp/news/v4/users/news` | 查询作品状态 |

### 4.3 在线检测和账号信息

鉴权：

```http
GET /mpbp/bp/account/check/user?accountId=<ACCOUNT_ID>&_=<MILLISECONDS> HTTP/1.1
Host: mp.sohu.com
Referer: https://mp.sohu.com/mpfe/v4/contentManagement/news/addvideo
<公共认证 Header>
```

账号在线检测在鉴权成功后继续请求：

```http
GET /mpbp/bp/account/info?accountId=<ACCOUNT_ID>&_=<MILLISECONDS> HTTP/1.1
Host: mp.sohu.com
<公共认证 Header>
```

- 两个接口都要求 `code === 2000000`。
- 昵称取 `data.nickName`。
- 鉴权 HTTP 401/403 视为离线；整体超时 20 秒，最多尝试 3 次。
- 发布准备阶段只调用 `check/user`，不调用 `account/info`，且不附加 `_`。

### 4.4 获取频道树

两个 GET 并行执行：

```http
GET /mpbp/bp/account/common/channels-data-api?accountId=<ACCOUNT_ID>&status=1
GET /mpbp/bp/news/v4/videoChannels?accountId=<ACCOUNT_ID>
```

项目把一级频道与 `videoChannel.channelId` 相同的二级频道组合成树。最终发布提供的 `channelId` 和 `videoChannelId` 必须属于同一父子组合。

### 4.5 创建视频任务

```http
POST /commons/mp/createVideo?accountId=<ACCOUNT_ID> HTTP/1.1
Host: mp.sohu.com
Content-Type: application/x-www-form-urlencoded
<公共认证 Header>

accountId=<ACCOUNT_ID>
authKey=<TIMESTAMP>_<MD5>
cateCode=329
delayAudit=true
nameMd5=<MD5_OF_VIDEO_NAME_UNDERSCORE_SIZE>
title=
uploadFrom=277
uploadSource=mp
uploadType=2
videoName=<VIDEO_NAME>
videoSize=<FILE_SIZE>
```

`authKey` 算法：

```text
timestamp + "_" + md5("sohu-mp-" + accountId + "-" + timestamp)
```

成功响应必须包含 `data.id`、`data.vto` 和 `data.token`，分别作为视频 ID、动态分片地址和合并 token。

### 4.6 上传和合并视频

项目按 512 KiB 切片、并发数 3 上传。动态 `vto` 地址可能已有 Query，项目使用 `?` 或 `&` 继续追加：

```http
POST <VTO><SEPARATOR>id=<VIDEO_ID>&type=6&partNo=<ONE_BASED_INDEX>&outType=3&partsize=524288&accountId=<ACCOUNT_ID> HTTP/1.1
Content-Type: multipart/form-data
<公共认证 Header>

file=<CHUNK_BINARY>
```

每片成功条件为 `code === 100`。全部分片上传后：

```http
POST /commons/mp/chunkUploadDone?accountId=<ACCOUNT_ID> HTTP/1.1
Host: mp.sohu.com
Content-Type: application/x-www-form-urlencoded
<公共认证 Header>

accountId=<ACCOUNT_ID>
authKey=<TIMESTAMP>_<MD5>
token=<CREATE_VIDEO_TOKEN>
vid=<VIDEO_ID>
videoName=<VIDEO_NAME>
videoSize=<FILE_SIZE>
vto=<VTO>
```

成功响应要求 `code === 2000000` 并存在 `data.videoHtml`；项目去掉其中的换行后作为最终发布 `content`。

### 4.7 上传和压缩封面

封面必须至少 450×300，项目统一转为质量 90 的 JPEG：

```http
POST /commons/front/outerUpload/image/file HTTP/1.1
Host: mp.sohu.com
Content-Type: multipart/form-data
<公共认证 Header>

accountId=<ACCOUNT_ID>
file=<JPEG_BINARY>
```

响应 URL 可能位于根级 `url` 或 `data.url`。项目根据原图宽高居中计算 3:2 裁剪区域，生成带 `a_auto,c_cut,q_70,x_...,y_...,w_...,h_...` 的转换 URL，再调用：

```http
POST /commons/front/outerUpload/image/thumbnail/url HTTP/1.1
Host: mp.sohu.com
Content-Type: application/x-www-form-urlencoded
<公共认证 Header>

accountId=<ACCOUNT_ID>&url=<TRANSFORMED_URL>
```

最终封面 URL 同样从根级 `url` 或 `data.url` 获取。

### 4.8 查询额度和最终发布

先查询视频发布额度：

```http
GET /mpbp/bp/news/v4/news/publishLimit?accountId=<ACCOUNT_ID>&type=3 HTTP/1.1
Host: mp.sohu.com
<公共认证 Header>
```

`data[3]` 必须大于 0。然后发送唯一一次发布请求：

```http
POST /mpbp/bp/news/v4/news/publishVideo/v2?accountId=<ACCOUNT_ID> HTTP/1.1
Host: mp.sohu.com
Content-Type: application/json
<公共认证 Header>
```

JSON Body：

```json
{
  "accountId": "<ACCOUNT_ID>",
  "brief": "#tag1 #tag2\n<INTRODUCTION>",
  "channelId": 1,
  "columnNewsIds": [],
  "content": "<VIDEO_HTML>",
  "cover": "<COVER_URL>",
  "headImage": "",
  "id": 0,
  "infoResource": 0,
  "mobileTitle": "",
  "modelId": "",
  "sourceUrl": "",
  "title": "<TITLE>",
  "topicIds": [],
  "userColumnId": 0,
  "userLabels": "[]",
  "videoChannelId": 2,
  "videoId": "<VIDEO_ID>"
}
```

搜狐当前只支持立即发布。成功条件为 `code === 2000000`；响应的标量 `data` 转成字符串后作为作品 ID。

### 4.9 查询作品状态

```http
GET /mpbp/bp/news/v4/users/news?psize=10&newsType=4&statusType=1&columnId=&pno=<1..3>&streamId=<PREVIOUS_STREAM_ID>&accountId=<ACCOUNT_ID>&_=<MILLISECONDS> HTTP/1.1
Host: mp.sohu.com
Referer: https://mp.sohu.com/mpfe/v4/contentManagement/first/page
<其余公共认证 Header>
```

- 最多 3 页；第二页起使用上一页 `data.streamId`。
- 响应要求 `code === 2000000`、`success === true`，列表读取 `data.news` 或 `data.videos`。
- 按 `record.id` 精确匹配发布作品 ID。
- 状态：`1/3/7/9` 为 `non_public`，`2/5` 为 `reviewing`，`4/16` 为 `public`。
- 未知状态码会直接报错，防止错误地把新状态判为成功。
- 三页未找到作品时返回 `non_public`。

## 5. 抖音

### 5.1 运行环境、认证和签名

抖音发布链路必须运行在隐藏 Electron renderer 中，使用项目 `assets/browser-identity/browser-identity.*.json` 中的共享 Chrome 138 身份。原因是：

- Creator API 依赖会话 Cookie、`msToken`、浏览器身份和 CSRF；
- VOD 与 ImageX 使用临时 AK/SK/SessionToken，并要求 AWS Signature V4 风格签名；
- 最终 `create_v2` URL 的 `a_bogus` 必须由 Creator 官方 BDMS 脚本在页面环境中生成；
- Electron 的请求桥接负责写入浏览器禁止前端直接设置的 Cookie、Host、Origin、Referer 和 User-Agent。

Creator 公共 Query：

| 字段 | 值/来源 |
| --- | --- |
| `cookie_enabled` | `true` |
| `screen_width`, `screen_height` | renderer 屏幕尺寸，缺失时 1920×1080 |
| `browser_language` | `zh-CN` |
| `browser_platform` | `MacIntel` 或 `Win32` |
| `browser_name` | UA 第一个 `/` 前的内容 |
| `browser_version` | UA 第一个 `/` 后的内容 |
| `browser_online` | `true` |
| `timezone_name` | 宿主时区，缺失时 `Asia/Shanghai` |
| `aid` | `1128` |
| `support_h265` | `1` |

发布 renderer 的 Axios 超时为 10 分钟，不自动重试；视频分片由业务代码按 1/2/4 秒退避，单片最多请求 4 次。

### 5.2 接口总览

| 方法 | URL/Action | 用途 |
| --- | --- | --- |
| GET | `https://creator.douyin.com/web/api/media/user/info/` | 在线检测、获取 UID |
| HEAD | `https://creator.douyin.com/web/api/media/anchor/search` | 获取 CSRF Token |
| GET | `https://creator.douyin.com/web/api/media/upload/auth/v5/` | 获取 VOD/ImageX 临时密钥 |
| GET | `https://vod.bytedanceapi.com/?Action=ApplyUploadInner...` | 申请视频上传节点 |
| POST | 动态视频上传地址，`phase=init` | 初始化 multipart |
| POST | 动态视频上传地址 | 上传视频分片 |
| POST | 动态视频上传地址，`phase=finish` | 合并 multipart |
| POST | `https://vod.bytedanceapi.com/?Action=CommitUploadInner...` | 提交视频会话 |
| GET | `https://creator.douyin.com/web/api/media/video/enable/` | 启用视频 |
| GET | `https://creator.douyin.com/web/api/media/video/transend/` | 通知转码上传结束 |
| GET | `https://imagex.bytedanceapi.com?Action=ApplyImageUpload...` | 申请封面上传节点 |
| POST | 动态 ImageX 上传地址 | 上传封面二进制 |
| POST | `https://imagex.bytedanceapi.com?Action=CommitImageUpload...` | 提交封面会话 |
| GET | `https://creator.douyin.com/aweme/v1/creator/get/url/` | 把 ImageX URI 换成 URL |
| GET | `https://creator.douyin.com/aweme/v1/search/challengesug/` | 搜索话题 |
| POST | `https://creator.douyin.com/web/api/media/aweme/create_v2/` | 最终发布 |
| GET | `https://creator.douyin.com/web/api/media/aweme/post/` | 查询作品状态 |

### 5.3 在线检测和获取 UID

账号在线检测：

```http
GET /web/api/media/user/info/?msToken=<MS_TOKEN>&a_bogus= HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
User-Agent: <UA>
```

`user` 为对象即在线，昵称取 `user.nickname`；HTTP 401/403 为离线。整体超时 20 秒，最多尝试 3 次。

发布链路再次调用同一接口获取 VOD 所需 UID；Query 仍为 `msToken` 和空 `a_bogus`，成功响应必须包含 `user.uid`。

### 5.4 获取 CSRF 和临时上传密钥

CSRF 请求：

```http
HEAD /web/api/media/anchor/search HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
Referer: https://creator.douyin.com/creator-micro/content/publish
User-Agent: <UA>
X-Secsdk-Csrf-Request: 1
X-Secsdk-Csrf-Version: 1.2.22
```

从响应 Header `x-ware-csrf-token` 的最后一个逗号分段取得 token。

临时密钥请求：

```http
GET /web/api/media/upload/auth/v5/?<COMMON_PARAMS>&msToken=<MS_TOKEN> HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
Referer: https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page
User-Agent: <UA>
X-Secsdk-Csrf-Token: <CSRF>
```

响应 `auth` 是 JSON 字符串，必须包含 `AccessKeyID`、`SecretAccessKey` 和 `SessionToken`。

### 5.5 申请视频上传节点

请求 Query：

| 字段 | 值 |
| --- | --- |
| `Action` | `ApplyUploadInner` |
| `FileSize` | 视频字节数 |
| `FileType` | `video` |
| `IsInner` | `1` |
| `SpaceName` | `aweme` |
| `Version` | `2020-11-19` |
| `app_id` | `2906` |
| `s` | 随机 base36 字符串 |
| `user_id` | 账号 UID |

使用临时 AK/SK 以 `serviceName=vod`、`region=cn-north-1`、HTTP GET 进行 SigV4 签名：

```http
GET /?<SIGNED_QUERY> HTTP/1.1
Host: vod.bytedanceapi.com
Authorization: <SIGV4_AUTHORIZATION>
X-Amz-Date: <AMZ_DATE>
X-Amz-Security-Token: <SESSION_TOKEN>
Origin: https://creator.douyin.com
Referer: https://creator.douyin.com/
```

项目读取 `Result.InnerUploadAddress.UploadNodes[0]`，要求包含 `UploadHost`、`SessionKey`、`StoreInfos[0].StoreUri` 和 `StoreInfos[0].Auth`。

### 5.6 上传视频

动态上传地址：

```text
https://<UploadHost>/upload/v1/<StoreUri>
```

视频按 5 MiB 切片、并发数 3。超过一片时先初始化：

```http
POST <UPLOAD_URL>?phase=init&uploadmode=part HTTP/1.1
Authorization: <STORE_AUTH>
Host: <UPLOAD_HOST>
X-Storage-U: <UID>
Content-Type: multipart/form-data
```

成功条件为 `code === 2000` 且存在 `data.uploadid`。

上传单片：

```http
POST <UPLOAD_URL>?phase=transfer&part_number=<ONE_BASED_INDEX>&part_offset=<START>&uploadid=<UPLOAD_ID> HTTP/1.1
Authorization: <STORE_AUTH>
Host: <UPLOAD_HOST>
X-Storage-U: <UID>
Content-Crc32: <LOWER_HEX_CRC32>
Content-Disposition: attachment; filename="undefined"
Content-Type: application/octet-stream

<CHUNK_BINARY>
```

- 单分片视频不传 `phase/part_number/part_offset/uploadid`。
- 每片响应要求 `code === 2000`；multipart 响应还必须返回 `data.part_number` 和 `data.crc32`。

multipart 完成请求：

```http
POST <UPLOAD_URL>?phase=finish&uploadid=<UPLOAD_ID>&uploadmode=partial HTTP/1.1
Authorization: <STORE_AUTH>
Host: <UPLOAD_HOST>
X-Storage-U: <UID>
Content-Type: text/plain;charset=UTF-8

1:<CRC32>,2:<CRC32>,...
```

若响应带 `code`，其值必须为 `2000`。

### 5.7 提交 VOD 会话并验证视频

VOD Commit Query：

```text
Action=CommitUploadInner
SpaceName=aweme
Version=2020-11-19
app_id=2906
user_id=<UID>
```

Body：

```json
{
  "SessionKey": "<VIDEO_SESSION_KEY>",
  "Functions": [
    { "name": "GetMeta" },
    { "name": "Snapshot", "input": { "SnapshotTime": 0 } }
  ]
}
```

请求以 `serviceName=vod` 做 SigV4 POST 签名，并签入 `x-amz-content-sha256`：

```http
POST /?<SIGNED_QUERY> HTTP/1.1
Host: vod.bytedanceapi.com
Authorization: <SIGV4_AUTHORIZATION>
X-Amz-Content-Sha256: <PAYLOAD_HASH>
X-Amz-Date: <AMZ_DATE>
X-Amz-Security-Token: <SESSION_TOKEN>
Content-Type: application/json
Origin: https://creator.douyin.com
Referer: https://creator.douyin.com/
```

成功时从 `Result.Results[0].Vid` 取得 `video_id`，可选读取 `PosterUri`。随后按顺序调用：

```http
GET /web/api/media/video/enable/?<COMMON_PARAMS>&msToken=<MS_TOKEN>&video_id=<VID>
GET /web/api/media/video/transend/?<COMMON_PARAMS>&msToken=<MS_TOKEN>&video_id=<VID>
```

两次请求都携带 Creator Cookie、发布 Referer、UA 和 `X-Secsdk-Csrf-Token`。项目只要求 HTTP 请求成功，不解释 Body。

### 5.8 上传封面

申请 ImageX 节点的 Query：

```text
Action=ApplyImageUpload
ServiceId=jm8ajry58r
Version=2018-08-01
app_id=2906
s=<RANDOM>
user_id=
```

使用临时 AK/SK 以 `serviceName=imagex`、`region=cn-north-1` 做 SigV4 GET 签名，请求 `https://imagex.bytedanceapi.com?<SIGNED_QUERY>`。节点响应结构与视频节点相同。

上传原始封面二进制：

```http
POST https://<UploadHost>/upload/v1/<StoreUri> HTTP/1.1
Authorization: <STORE_AUTH>
Content-Crc32: <LOWER_HEX_CRC32>
Content-Type: application/octet-stream
Origin: https://creator.douyin.com
Referer: https://creator.douyin.com/

<COVER_BINARY>
```

成功条件为 `code === 2000`。然后提交 ImageX 会话：

```text
POST https://imagex.bytedanceapi.com?<SIGNED_QUERY>
Action=CommitImageUpload
ServiceId=jm8ajry58r
Version=2018-08-01
app_id=2906
user_id=
Body={"SessionKey":"<IMAGE_SESSION_KEY>"}
```

该请求以 `serviceName=imagex` 做 SigV4 POST 签名并签入 Body Hash。成功条件为 `Result.Results[0].UriStatus === 2000` 且存在 `Uri`。

最后把 ImageX URI 换成 URL：

```http
GET /aweme/v1/creator/get/url/?<COMMON_PARAMS>&uri=<IMAGE_URI> HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
Origin: https://creator.douyin.com
Referer: https://creator.douyin.com/
User-Agent: <UA>
```

只有 `status_code === 0` 且存在 `url` 时使用该 URL，否则项目保留空字符串继续构造发布 Body。

### 5.9 搜索话题

项目从描述提取最多 5 个不同 hashtag，每个话题独立请求：

```http
GET /aweme/v1/search/challengesug/?<COMMON_PARAMS>&aid=2906&keyword=<TOPIC>&source=challenge_create HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
Referer: https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page
User-Agent: <UA>
```

仅处理 `status_code === 0` 的 `sug_list`，只接受 `cha_name` 完全匹配，并读取 `cid` 或 `challenge_id`。单个请求失败或未匹配不阻断发布。

### 5.10 最终发布

未签名 URL：

```text
https://creator.douyin.com/web/api/media/aweme/create_v2/?<COMMON_PARAMS>&read_aid=2906&msToken=<MS_TOKEN>
```

项目先在签名窗口中用完全相同的 JSON Body 发起一次 `window.fetch()`。Creator 官方 BDMS 在页面内为 URL 添加 `a_bogus` 后，CDP 在请求真正上网前捕获并主动中止这次签名请求；因此它是一个被拦截的 HTTP 请求构造动作，不会在平台侧创建作品。随后项目使用捕获到的 `signedUrl` 和可能的 ticket Header，发送唯一一次真正的发布请求：

```http
POST /web/api/media/aweme/create_v2/?...&a_bogus=<BDMS_SIGNATURE> HTTP/1.1
Host: creator.douyin.com
Cookie: <COOKIE>
Content-Type: application/json
Referer: https://creator.douyin.com/creator-micro/content/publish?enter_from=publish_page
User-Agent: <UA>
X-Secsdk-Csrf-Token: <CSRF>
<TICKET_HEADERS>
```

Body 顶层为 `item`，核心字段：

- `item.common`：标题、正文、结构化话题、可见性、定时时间、`media_type=4` 和 VOD `video_id`；
- `visibility_type`：公开 `0`、仅自己 `1`、朋友 `2`；
- `timing`：立即发布为 `0`，定时发布为 Unix 秒；
- `item.cover`：ImageX URI、封面尺寸、纵横双封面及两段封面工具 JSON；
- `item.chapter`、`sync`、`aigc`、`assistant`、`declare` 等固定后台字段。

完整 Body（包括两层 JSON 字符串封面字段）见 6.4.11。成功条件为 `status_code === 0` 且存在 `item_id`；`item_id` 作为作品 ID。响应 Header 出现 `x-tt-verify-passport-decision` 时转为身份验证错误，不把请求当作成功。

### 5.11 查询作品状态

```http
GET /web/api/media/aweme/post/?<COMMON_PARAMS>&count=12&max_cursor=0&scene=star_atlas&status=0 HTTP/1.1
Host: creator.douyin.com
Accept-Language: <BROWSER_IDENTITY_ACCEPT_LANGUAGE>
Cookie: <COOKIE>
Referer: https://creator.douyin.com/creator-micro/content/manage
sec-ch-ua: <CHROME_138_SEC_CH_UA>
sec-ch-ua-mobile: ?0
sec-ch-ua-platform: <PLATFORM>
User-Agent: <CHROME_138_UA>
```

- 响应要求 `status_code` 缺失或为 `0`，且 `aweme_list` 为数组。
- 列表为空时不推断成功，而是报错等待外层重试。
- 按 `aweme_id` 精确匹配作品 ID。
- `status_value === 141`：`reviewing`。
- `status_value` 为 `102/140/143`：`public`。
- 其他数字：`non_public`，原因优先读取 `review_struct.status_desc`。
- 有效非空列表找不到目标作品时，按当前业务规则视为 `public`。

## 6. 逐接口字段级请求与响应定义

本节是前述调用流程的字段级补充。定义遵循以下规则：

- 请求字段的“必传”是指当前项目每次都会发送，不代表平台公开协议的承诺。
- TypeScript 结构中的 `?` 表示平台可能不返回；项目会按对应成功条件校验。
- `unknown` 或索引签名表示平台可能返回额外字段，但当前项目不读取其业务含义。
- 所有接口还具有标准 HTTP 响应元数据 `status`、`statusText`、`headers` 和 Body；表中“响应参数”特指 Body 或项目明确读取的响应 Header。
- Axios 默认只把 HTTP 2xx 交给业务响应解析；非 2xx 会先作为 HTTP 错误抛出，401/403 等章节中明确处理的状态除外。
- `Content-Length`、multipart `boundary`、连接管理等由 Axios、XHR 或 Chromium 自动生成的传输 Header 不属于业务请求参数，其具体值随运行时变化，因此不列为固定字段。

### 6.1 哔哩哔哩字段定义

#### 6.1.1 `GET /x/web-interface/nav`

请求参数：无 Query、无 Body。

| Header | 类型 | 必传 | 来源/值 |
| --- | --- | --- | --- |
| `Cookie` | string | 是 | 有效 Bilibili Cookie 拼接值 |
| `User-Agent` | string | 是 | `loadBrowserIdentity().userAgent` |

响应参数：

```ts
interface BilibiliNavResponse {
  code?: number;
  message?: string;
  data?: {
    isLogin?: boolean;
    name?: string;
    uname?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

| 字段 | 项目用法 |
| --- | --- |
| `data.isLogin` | `true` 在线，`false` 离线；缺失时进入下一次业务尝试 |
| `data.name` | 在线昵称首选字段 |
| `data.uname` | `name` 不是字符串时的昵称备选字段 |
| `code/message` | 当前在线检测不读取，仅作为平台透传字段记录 |

#### 6.1.2 `GET /x/vupre/web/archive/human/type2/list`

请求参数：无 Query、无 Body；Header 为 `Cookie`、固定上传页 `Referer` 和公共 `User-Agent`。

响应参数：

```ts
interface BilibiliHumanTypeResponse {
  code?: number;
  message?: string;
  data?: { type_list?: BilibiliHumanType[]; [key: string]: unknown };
  type_list?: BilibiliHumanType[];
  [key: string]: unknown;
}

interface BilibiliHumanType {
  id?: string | number;
  name?: string | number;
  [key: string]: unknown;
}
```

- `code` 存在时必须为 `0`。
- 列表优先读取 `data.type_list`，其次读取根级 `type_list`。
- 每项只有 `id` 能转换为正安全整数且 `name` 转换后非空才保留。

#### 6.1.3 `GET /preupload`

完整 Query 定义：

| 字段 | 类型 | meta 请求 | 视频请求 | 必传 |
| --- | --- | --- | --- | --- |
| `build` | string | `2140000` | `2140000` | 是 |
| `name` | string | `file_meta.txt` | 本地视频文件名 | 是 |
| `probe_version` | string | `20250923` | `20250923` | 是 |
| `profile` | string | `aicovers/bup` | `ugcfx/bup` | 是 |
| `r` | string | `upos` | `upos` | 是 |
| `size` | number | `2000` | 视频字节数 | 是 |
| `ssl` | number | `0` | `0` | 是 |
| `threads` | number | `2` | `2` | 是 |
| `upcdn` | string | `estx` | `estx` | 是 |
| `version` | string | `2.14.0.0` | `2.14.0.0` | 是 |
| `webVersion` | string | `2.14.0` | `2.14.0` | 是 |
| `zone` | string | `cs` | `cs` | 是 |

响应参数：

```ts
interface BilibiliPreuploadResponse {
  OK?: number;
  auth?: string;
  biz_id?: number;
  endpoint?: string;
  upos_uri?: string;
  [key: string]: unknown;
}
```

| 字段 | meta 用法 | 视频用法 |
| --- | --- | --- |
| `OK` | 必须为 `1` | 必须为 `1` |
| `upos_uri` | 必须存在，写入视频初始化的 `meta_upos_uri` | 必须存在，用于拼接动态上传 URL |
| `auth` | 不读取 | 必须存在，作为 `X-Upos-Auth` |
| `endpoint` | 不读取 | 必须存在，作为动态上传 Host/前缀 |
| `biz_id` | 不读取 | 必须存在，作为上传与投稿视频 `cid` |

#### 6.1.4 UPOS multipart 初始化、分片和合并

初始化 Query：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `uploads` | string | 固定空字符串 |
| `output` | string | `json` |
| `profile` | string | `ugcfx/bup` |
| `filesize` | number | 视频总字节数 |
| `partsize` | number | `10485760` |
| `biz_id` | number | 视频预上传 `biz_id` |
| `meta_upos_uri` | string | meta 预上传 `upos_uri` |

初始化响应：

```ts
interface BilibiliMultipartInitResponse {
  OK?: number;
  key?: string;
  upload_id?: string;
  [key: string]: unknown;
}
```

`OK` 必须为 `1`，`key` 和 `upload_id` 必须为非空字符串。

分片 Query：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `chunk` | number | 从 0 开始的分片索引 |
| `chunks` | number | 总分片数 |
| `end` | number | 当前分片结束字节偏移，不包含该位置 |
| `partNumber` | number | 从 1 开始的分片编号 |
| `size` | number | 当前分片字节数 |
| `start` | number | 当前分片起始字节偏移 |
| `total` | number | 视频总字节数 |
| `uploadId` | string | 初始化响应 `upload_id` |

分片 Body 是 `application/octet-stream` 原始字节。项目不读取分片响应 Body，只要求 HTTP Promise 成功；因此平台响应的具体 Body 字段属于未依赖透传字段。

合并 Query：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `biz_id` | number | 视频预上传 `biz_id` |
| `name` | string | 本地视频文件名 |
| `output` | string | `json` |
| `profile` | string | `ugcfx/bup` |
| `uploadId` | string | 初始化响应 `upload_id` |

合并 Body 与响应：

```ts
interface BilibiliMultipartCompleteRequest {
  parts: Array<{ partNumber: number; eTag: "etag" }>;
}

interface BilibiliMultipartCompleteResponse {
  OK?: number;
  [key: string]: unknown;
}
```

`parts` 按成功分片顺序生成；当前实现固定发送占位 `eTag="etag"`。响应 `OK` 必须为 `1`。

#### 6.1.5 `POST /x/vu/web/cover/up`

| 位置 | 字段 | 类型 | 值/来源 |
| --- | --- | --- | --- |
| Query | `csrf` | string | `bili_jct` Cookie |
| Query | `t` | number | 当前毫秒时间戳 |
| multipart | `cover` | string | `data:<mime>;base64,<content>` |
| multipart | `csrf` | string | `bili_jct` Cookie |

响应参数：

```ts
interface BilibiliCoverResponse {
  code?: number;
  message?: string;
  data?: { url?: string; [key: string]: unknown };
  [key: string]: unknown;
}
```

成功要求 `code === 0` 且 `data.url` 非空；错误文本使用 `message`。

#### 6.1.6 `POST /x/vu/web/add/v3`

完整 Query：`b_wet=""`、`csrf=<bili_jct>`、`t=<当前毫秒>`、`web_location=1`、`w_rid=""`、`wts=1781077232`。

完整 JSON Body 定义：

```ts
interface BilibiliPublishRequest {
  cover: string;
  cover43: string;
  title: string;
  copyright: 3;
  creation_statement: { id: -1 };
  human_type2: number;
  tid: 221;
  tag: string;
  desc: string;
  dynamic: string;
  videos: Array<{
    cid: number;
    desc: "";
    filename: string;
    title: string;
  }>;
  watermark: { state: 1 };
  subtitle: { lan: ""; open: 0 };
  dtime?: number;
}
```

响应参数：

```ts
interface BilibiliPublishApiResponse {
  code?: number;
  message?: string;
  data?: { bvid?: string; [key: string]: unknown };
  [key: string]: unknown;
}
```

成功要求 `code === 0` 且 `data.bvid` 非空。

#### 6.1.7 `GET /x/web/archives`

Query 均必传：`coop=1`、`interactive=1`、`pn=1..3`、`ps=20`、`status="is_pubing,pubed,not_pubed"`。

响应参数：

```ts
interface BilibiliArchivesResponse {
  code?: number;
  message?: string;
  data?: {
    arc_audits?: BilibiliArchiveRecord[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface BilibiliArchiveRecord {
  Archive?: BilibiliArchive;
  archive?: BilibiliArchive;
  [key: string]: unknown;
}

interface BilibiliArchive {
  bvid?: string | number;
  aid?: string | number;
  state?: string | number;
  state_desc?: string | number;
  reject_reason?: string | number;
  [key: string]: unknown;
}
```

项目要求根对象存在、`code === 0`、`data.arc_audits` 为数组；记录内容优先读取 `Archive`，其次 `archive`，否则读取记录本身。

### 6.2 百家号字段定义

#### 6.2.1 `GET /builder/app/appinfo`

请求无 Query 和 Body；Header 为 `Cookie`、`User-Agent`。

```ts
interface BaijiahaoAppInfoResponse {
  errno?: number;
  errmsg?: string;
  data?: {
    user?: {
      app_id?: string | number;
      name?: string;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

在线检测只要求 `data.user` 是对象；发布准备额外要求 `data.user.app_id` 存在且字符串化后非空。`errmsg` 用作缺少 `app_id` 时的错误文本。

#### 6.2.2 `POST /materialui/video/preuploadvideo`

Query `app_id` 和 JSON Body 中 `app_id` 均必传。Body 完整字段：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `app_id` | string | appinfo 返回值 |
| `md5` | string | 视频文件小写十六进制 MD5 |
| `is_pay_column` | string | `"0"` |
| `video_type` | string | 横版 `short`，竖版 `tiny` |
| `column_videotype` | string | 空字符串 |
| `size` | string | 视频字节数转字符串 |
| `org_file_name` | string | 本地视频文件名 |

响应参数：

```ts
interface BaijiahaoPreuploadResponse {
  error_code?: number;
  error_msg?: string;
  mediaId?: string | number;
  upload_key?: string;
  [key: string]: unknown;
}
```

成功要求 `error_code === 20000`、`mediaId` 存在、`upload_key` 非空。

#### 6.2.3 `POST /pcui/picture/processproxy`

multipart Body：`action[]="save"`、`base64=<纯 JPEG Base64>`、`videoCover="frontend"`；无 Query。

```ts
interface BaijiahaoCoverResponse {
  errno?: number;
  errmsg?: string;
  ret?: {
    original_url?: string;
    url?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

除 Body 外还读取响应 Header `token` 或 `Token`。成功要求 `errno === 0`、`ret.original_url`、`ret.url` 和 token Header 全部存在。

#### 6.2.4 `POST rsbjh10.../uploadvideo`

Query：`app_id=<APP_ID>`。multipart Body 全部字段：

| 字段 | 类型 | 含义 |
| --- | --- | --- |
| `app_id` | string | 当前账号应用 ID |
| `md5` | string | 完整视频 MD5，不是分片 MD5 |
| `id` | string | 固定 `WU_FILE_0` |
| `name` | string | 视频文件名 |
| `type` | string | 固定 `video/mp4` |
| `lastModifiedDate` | string | 文件 mtime 的 ISO 字符串 |
| `size` | string | 完整视频字节数 |
| `chunks` | string | 总分片数 |
| `chunk` | string | 从 0 开始的分片索引 |
| `upload_key` | string | 预上传返回值 |
| `file` | Blob | 当前 2 MiB 或末尾不足 2 MiB 的分片 |

```ts
interface BaijiahaoChunkResponse {
  error_code?: number;
  error_msg?: string;
  [key: string]: unknown;
}
```

成功要求 `error_code === 20000`。

#### 6.2.5 `POST /materialui/video/compuploadvideo`

Query：`app_id=<APP_ID>`。multipart Body：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `upload_key` | string | 预上传返回值 |
| `chunks` | string | 已成功上传的分片总数 |
| `name` | string | 视频文件名 |
| `size` | string | 视频总字节数 |
| `is_pay_column` | string | `"0"` |
| `column_videotype` | string | 空字符串 |
| `type` | string | `video` |
| `video_type` | string | 横版 `short`，竖版 `tiny` |
| `duration` | string | 视频时长向上取整后转字符串 |

响应结构与 `BaijiahaoChunkResponse` 相同，但成功码为 `error_code === 0`。

#### 6.2.6 `GET /pcui/pcpublisher/searchtopic`

Query：`content=<不含#的话题名>`、`resource_type=3`、`title=""`。

```ts
interface BaijiahaoTopicSearchResponse {
  errno?: number;
  errmsg?: string;
  data?: {
    recommend?: BaijiahaoTopic[];
    hot?: BaijiahaoTopic[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface BaijiahaoTopic {
  id?: unknown;
  title?: unknown;
  guide?: unknown;
  cover?: unknown;
  sv_small_images?: { https?: unknown; [key: string]: unknown };
  [key: string]: unknown;
}
```

当前实现只比较 `title`，并在最终发布中使用 `id/title/guide/sv_small_images.https`；其余话题字段原样透传或忽略。

#### 6.2.7 `POST /pcui/article/publish` 完整请求 Body

Query：`callback="bjhpublish"`；`type` 横版为 `video`、竖版为 `ugc_video`。Header `token` 固定使用横版封面响应 token。

横版与竖版共同字段：

| 字段 | 类型 | 当前值/来源 |
| --- | --- | --- |
| `type` | string | `video` 或 `ugc_video` |
| `title` | string | 清除已提取话题后的简介 |
| `bjhtopic_id` | unknown/string | 命中话题的 `id`，否则空字符串 |
| `bjhtopic_info` | array/string | 命中话题的数组，否则空字符串 |
| `cover_image_source` | object | `{wide_cover_image_source:"video_cut",vertical_cover_image_source:"video_cut"}` |
| `ducut_info` | string | 空字符串 |
| `content` | string | JSON 字符串，结构见下文 |
| `video_duration` | number | 向上取整秒数 |
| `nryx_mount_list` | string | 空字符串 |
| `activity_list` | array | `[{id:"aigc_bjh_status",is_checked:0}]` |
| `source_reprinted_allow` | number | `0` |
| `is_auto_optimize_cover` | number | `1` |
| `bjh_video_finger_printing` | string | `JSON.stringify({s2l:null,s2game:null,bjh:{duration}})` |
| `fe_from` | string | `BJH_CMS_PC` |
| `auto_mount_goods` | number | `0` |
| `is_consultant_card` | number | `0` |
| `cover_layout` | string | `one` |
| `cover_images` | string | JSON 字符串，结构见下文 |
| `_cover_images_map` | string | JSON 字符串，结构见下文 |
| `cover_source` | string | `upload` |
| `clue` | string | 空字符串 |
| `bjhmt` | string | 空字符串 |
| `order_id` | string | 空字符串 |
| `BJH_FE_NOUNCE` | string | 空字符串 |
| `aigc_rebuild` | string | 空字符串 |
| `pub_source_from` | string | `pc_faburukou` |
| `image_edit_point` | string | 下述数组的 JSON 字符串 |
| `publish_statement` | number | `0` |
| `publish_statement_sub` | number | `0` |
| `timer_time` | string | 可选，定时发布 Unix 秒字符串 |

`image_edit_point` 解码后固定为：

```json
[
  {"img_type":"cover","img_num":{"template":0,"font":0,"filter":0,"paster":0,"cut":0,"any":0}},
  {"img_type":"body","img_num":{"template":0,"font":0,"filter":0,"paster":0,"cut":0,"any":0}}
]
```

横版专有/差异字段：

```ts
interface BaijiahaoHorizontalPublishFields {
  type: "video";
  vertical_cover: string; // 竖版处理图 URL
  desc: string; // 清理话题后的简介
  content: string; // JSON.stringify([{title, mediaId, videoName, local: 1, desc}])
  cover_images: string; // JSON.stringify([{src: 横版URL, isLegal: 0, cover_source_tag: "video_cut"}])
  _cover_images_map: "[]";
  usingImgFilter: false;
}
```

命中横版话题时 `bjhtopic_info` 解码后为 `[{id,title,guide:"",cover:sv_small_images.https}]`。

竖版专有/差异字段：

```ts
interface BaijiahaoVerticalPublishFields {
  type: "ugc_video";
  content: string; // JSON.stringify([{title, mediaId}])
  vertical_cover_images: string; // JSON.stringify([{content_original,src,cropData:{x:0,y:0,width:1080,height:1440},isLegal:0,cover_source_tag:"video_cut"}])
  size: number;
  width_in_pixel: number;
  height_in_pixel: number;
  cover_images: string; // JSON.stringify([{source:"local",src,cropData:{x:0,y:0,width:1080,height:1440},isLegal:0,cover_source_tag:"video_cut"}])
  _cover_images_map: string; // JSON.stringify([{src,origin_src}])
  loadComplete: true;
}
```

Body 最终编码为 `application/x-www-form-urlencoded`。对象和数组字段由 Axios 表单转换规则编码；项目显式预先 JSON 字符串化上表标注为 `string` 的字段。

响应参数：

```ts
interface BaijiahaoPublishResponse {
  errno?: number;
  errmsg?: string;
  error_msg?: string;
  ret?: { nid?: string | number; [key: string]: unknown };
  [key: string]: unknown;
}
```

成功要求 `errno === 0` 且 `ret.nid` 存在；错误文本优先 `errmsg`，其次 `error_msg`。

#### 6.2.8 `GET /pcui/article/lists`

Query 全部必传：`collection=""`、`currentPage=1`、`dynamic=1`、`pageSize=10`、`search=""`、`type=""`。

```ts
interface BaijiahaoListResponse {
  errno?: number;
  errmsg?: string;
  data?: {
    list?: BaijiahaoArticleRecord[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface BaijiahaoArticleRecord {
  nid?: string | number;
  status?: string | number;
  audit_msg?: string | number;
  share_url?: string | number;
  url?: string | number;
  [key: string]: unknown;
}
```

当前入口严格要求 `data.list` 是数组；通用收集器也兼容数字键对象。`nid` 用于唯一匹配，`status/audit_msg/share_url/url` 用于状态与链接。

### 6.3 搜狐号字段定义

#### 6.3.1 通用响应外壳

除动态分片外，搜狐业务响应统一按以下结构读取：

```ts
interface SohuResponse<T = unknown> {
  code?: number;
  data?: T;
  detail?: string;
  message?: string;
  msg?: string;
  success?: boolean;
  [key: string]: unknown;
}
```

错误文本按接口上下文从 `msg`、`message`、`detail` 中读取；一般成功码为 `2000000`。

#### 6.3.2 `GET check/user` 与 `GET account/info`

| 接口 | Query | Body |
| --- | --- | --- |
| 在线检测 `check/user` | `accountId: string`、`_: number` | 无 |
| 发布前 `check/user` | `accountId: string` | 无 |
| `account/info` | `accountId: string`、`_: number` | 无 |

`check/user` 使用通用 `SohuResponse<unknown>`，只读取 `code`。账号信息响应：

```ts
interface SohuAccountInfoResponse extends SohuResponse<{
  nickName?: string;
  [key: string]: unknown;
}> {}
```

`data` 必须是非数组对象；`nickName` 若存在必须为字符串。

#### 6.3.3 频道接口

`channels-data-api` Query：`accountId=<ACCOUNT_ID>`、`status=1`。响应兼容两种形态：

```ts
type SohuChannelsResponse =
  | Array<{ id?: number; name?: string; [key: string]: unknown }>
  | SohuResponse<Array<{ id?: number; name?: string; [key: string]: unknown }>>;
```

`videoChannels` Query：`accountId=<ACCOUNT_ID>`。响应：

```ts
type SohuVideoChannelsResponse = SohuResponse<Array<{
  id?: number;
  channelId?: number;
  name?: string;
  [key: string]: unknown;
}>>;
```

`id` 和 `channelId` 必须为正安全整数，`name` 必须非空，才进入项目频道树。

#### 6.3.4 `POST /commons/mp/createVideo`

Query：`accountId=<ACCOUNT_ID>`。URL 编码 Body：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `accountId` | string | 当前搜狐账号 ID |
| `authKey` | string | `<毫秒时间戳>_<MD5>` |
| `cateCode` | number | `329` |
| `delayAudit` | boolean | `true`，编码后为字符串 `true` |
| `nameMd5` | string | `md5(videoName + "_" + videoSize)` |
| `title` | string | 空字符串 |
| `uploadFrom` | number | `277` |
| `uploadSource` | string | `mp` |
| `uploadType` | number | `2` |
| `videoName` | string | 本地视频文件名 |
| `videoSize` | number | 视频总字节数 |

```ts
type SohuCreateVideoResponse = SohuResponse<{
  id?: string | number;
  token?: string;
  vto?: string;
  [key: string]: unknown;
}>;
```

成功要求 `code === 2000000`，且 `id/token/vto` 均存在。

#### 6.3.5 动态 `vto` 分片上传

动态 URL Query：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `id` | string | 创建视频响应 `id` |
| `type` | number | `6` |
| `partNo` | number | 从 1 开始的分片号 |
| `outType` | number | `3` |
| `partsize` | number | `524288` |
| `accountId` | string | Axios `params` 追加的账号 ID |

multipart Body 仅一个 `file` 字段，文件名为原视频文件名，MIME 为 `application/octet-stream`。

响应使用 `SohuResponse<unknown>`；成功要求 `code === 100`，其他 Body 字段不读取。

#### 6.3.6 `POST /commons/mp/chunkUploadDone`

Query：`accountId=<ACCOUNT_ID>`。URL 编码 Body：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `accountId` | string | 当前账号 ID |
| `authKey` | string | 本次完成请求新生成的 authKey |
| `token` | string | 创建视频响应 token |
| `vid` | string | 创建视频响应 id |
| `videoName` | string | 本地视频文件名 |
| `videoSize` | number | 视频总字节数 |
| `vto` | string | 创建视频响应动态上传 URL |

```ts
type SohuCompleteVideoResponse = SohuResponse<{
  videoHtml?: string;
  [key: string]: unknown;
}>;
```

成功要求 `code === 2000000` 且 `data.videoHtml` 非空。

#### 6.3.7 封面上传与压缩

`outerUpload/image/file` 无 Query，multipart Body：

| 字段 | 类型 | 值 |
| --- | --- | --- |
| `accountId` | string | 当前账号 ID |
| `file` | Blob | 质量 90 JPEG，文件名 `cover.jpg` |

响应兼容：

```ts
type SohuCoverUploadResponse = SohuResponse<{ url?: string; [key: string]: unknown }> & {
  url?: string;
};
```

URL 优先读取根级 `url`，其次 `data.url`。

`outerUpload/image/thumbnail/url` 无 Query，URL 编码 Body 只有 `accountId` 和 `url`。响应结构与封面上传相同；`url` 是以 `//host/a_auto,c_cut,q_70,x_<x>,y_<y>,w_<w>,h_<h><path>` 形式生成的转换地址。

#### 6.3.8 `GET publishLimit` 与 `POST publishVideo/v2`

额度 Query：`accountId=<ACCOUNT_ID>`、`type=3`；无 Body。

```ts
type SohuPublishLimitResponse = SohuResponse<Record<string, number>>;
```

项目读取 `data[3]`，必须大于 `0`。

发布 Query 只有 `accountId`；完整 JSON Body 已列于 4.8，字段级类型如下：

```ts
interface SohuPublishRequest {
  accountId: string;
  brief: string;
  channelId: number;
  columnNewsIds: unknown[];
  content: string;
  cover: string;
  headImage: "";
  id: 0;
  infoResource: 0;
  mobileTitle: "";
  modelId: "";
  sourceUrl: "";
  title: string;
  topicIds: unknown[];
  userColumnId: 0;
  userLabels: "[]";
  videoChannelId: number;
  videoId: string;
}

type SohuPublishResponse = SohuResponse<string | number>;
```

发布成功要求 `code === 2000000`，`data` 必须是非空字符串或有限数字，并转换为作品 ID。

#### 6.3.9 `GET /mpbp/bp/news/v4/users/news`

Query：

| 字段 | 类型 | 值/来源 |
| --- | --- | --- |
| `psize` | number | `10` |
| `newsType` | number | `4` |
| `statusType` | number | `1` |
| `columnId` | string | 空字符串 |
| `pno` | number | `1..3` |
| `streamId` | string | 第一页空；后续为上一页响应值 |
| `accountId` | string | 当前账号 ID |
| `_` | number | 当前毫秒时间戳 |

响应参数：

```ts
interface SohuNewsListResponse extends SohuResponse<{
  news?: SohuNewsRecord[] | Record<string, SohuNewsRecord>;
  videos?: SohuNewsRecord[] | Record<string, SohuNewsRecord>;
  streamId?: string | number | null;
  [key: string]: unknown;
}> {
  code: 2000000;
  success: true;
}

interface SohuNewsRecord {
  id?: string | number;
  status?: number;
  rejectReason?: string | null;
  [key: string]: unknown;
}
```

`news` 优先于 `videos`；对象形态只允许非负整数键。每条记录 `id` 必须可规范化为非空字符串，`status` 必须是整数，`rejectReason` 若存在必须为字符串或 `null`。

### 6.4 抖音字段定义

#### 6.4.1 Creator 公共 Header 与 Query

Creator 业务请求按接口选用以下 Header：

| Header | 类型 | 来源/值 |
| --- | --- | --- |
| `Cookie` | string | 当前 Electron Session 的 douyin.com Cookie |
| `User-Agent` | string | 固定 Chrome 138 身份 |
| `Referer` | string | 发布页、管理页或 Creator 根页，按接口固定 |
| `Origin` | string | 需要时为 `https://creator.douyin.com` |
| `X-Secsdk-Csrf-Token` | string | HEAD 响应 token |
| `Accept-Language` | string | 状态查询的固定浏览器身份字段 |
| `sec-ch-ua` | string | 状态查询的 Chrome 138 Client Hint |
| `sec-ch-ua-mobile` | string | 固定 `?0` |
| `sec-ch-ua-platform` | string | `"macOS"` 或 `"Windows"` |

`<COMMON_PARAMS>` 的完整类型：

```ts
interface DouyinCommonQuery {
  cookie_enabled: true;
  screen_width: number;
  screen_height: number;
  browser_language: "zh-CN";
  browser_platform: "MacIntel" | "Win32";
  browser_name: string;
  browser_version: string;
  browser_online: true;
  timezone_name: string;
  aid: 1128;
  support_h265: 1;
}
```

所有值只 URL 编码一次，按对象插入顺序序列化。

#### 6.4.2 `GET /web/api/media/user/info/`

Query：`msToken=<Cookie 中的 msToken>`、`a_bogus=""`；无 Body。

```ts
interface DouyinUserInfoResponse {
  status_code?: number;
  status_msg?: string;
  user?: {
    uid?: string;
    nickname?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

在线检测读取 `user` 和 `user.nickname`；发布准备要求 `user.uid` 非空。错误诊断读取 `status_code/status_msg`。

#### 6.4.3 `HEAD /web/api/media/anchor/search`

无 Query、无 Body。请求 Header 除 Cookie/UA/Referer 外固定：`X-Secsdk-Csrf-Request="1"`、`X-Secsdk-Csrf-Version="1.2.22"`。

项目不读取响应 Body，只读取响应 Header：

| Header | 类型 | 用法 |
| --- | --- | --- |
| `x-ware-csrf-token` | string | 按逗号切分，取最后一段并 trim，必须非空 |

#### 6.4.4 `GET /web/api/media/upload/auth/v5/`

Query 为全部 `<COMMON_PARAMS>` 加 `msToken`；无 Body。

```ts
interface DouyinUploadAuthResponse {
  auth?: string;
  [key: string]: unknown;
}

interface DouyinUploadCredentials {
  AccessKeyID: string;
  SecretAccessKey: string;
  SessionToken: string;
  [key: string]: unknown;
}
```

`auth` 必须是可解析 JSON 字符串，解析后上述三个凭证字段都必须非空。

#### 6.4.5 VOD `ApplyUploadInner`

业务 Query 已列于 5.5。SigV4 会在规范 Query 中加入或签入 `X-Amz-Algorithm`、`X-Amz-Credential`、`X-Amz-Date`、`X-Amz-Security-Token`、`X-Amz-SignedHeaders`、`X-Amz-Signature` 等签名字段，实际集合以签名器返回的 `canonicalQuery` 为准。

响应参数：

```ts
interface DouyinApplyUploadResponse {
  Result?: {
    InnerUploadAddress?: {
      UploadNodes?: Array<{
        UploadHost?: string;
        SessionKey?: string;
        StoreInfos?: Array<{
          StoreUri?: string;
          Auth?: string;
          [key: string]: unknown;
        }>;
        [key: string]: unknown;
      }>;
      [key: string]: unknown;
    };
    [key: string]: unknown;
  };
  ResponseMetadata?: unknown;
  [key: string]: unknown;
}
```

只选择第一个 `UploadNodes[0]` 和第一个 `StoreInfos[0]`，四个关键字段均必须非空。

#### 6.4.6 视频动态上传地址

multipart 初始化 Query：`phase="init"`、`uploadmode="part"`；Body 是空 `FormData`。

```ts
interface DouyinMultipartInitResponse {
  code?: number;
  message?: string;
  data?: { uploadid?: string; [key: string]: unknown };
  [key: string]: unknown;
}
```

成功要求 `code === 2000` 且 `data.uploadid` 非空。

分片 Header 全量：`Authorization`、`Host`、`X-Storage-U`、`Content-Crc32`、`Content-Disposition='attachment; filename="undefined"'`、`Content-Type='application/octet-stream'`。

multipart 分片 Query：`part_number=<1-based>`、`part_offset=<起始字节>`、`phase="transfer"`、`uploadid=<ID>`；单分片模式不发送这四项。

```ts
interface DouyinChunkResponse {
  code?: number;
  message?: string;
  data?: {
    part_number?: number;
    crc32?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

所有模式要求 `code === 2000` 且 `data` 为真值；multipart 还要求 `part_number/crc32` 为真值。单分片模式忽略平台返回的分片编号与 CRC，使用本地计算值。

finish Query：`phase="finish"`、`uploadid=<ID>`、`uploadmode="partial"`。Body 为 `part_number:crc32` 逗号串。

```ts
interface DouyinMultipartFinishResponse {
  code?: number;
  message?: string;
  [key: string]: unknown;
}
```

`code` 缺失也接受；存在时必须为 `2000`。

#### 6.4.7 VOD `CommitUploadInner`

Query：`Action="CommitUploadInner"`、`SpaceName="aweme"`、`Version="2020-11-19"`、`app_id=2906`、`user_id=<UID>`，再加入 SigV4 字段。

```ts
interface DouyinCommitVideoRequest {
  SessionKey: string;
  Functions: [
    { name: "GetMeta" },
    { name: "Snapshot"; input: { SnapshotTime: 0 } }
  ];
}

interface DouyinCommitVideoResponse {
  ResponseMetadata?: {
    Error?: { Code?: string; Message?: string; [key: string]: unknown };
    [key: string]: unknown;
  };
  Result?: {
    Results?: Array<{
      Vid?: string;
      PosterUri?: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

存在 `ResponseMetadata.Error` 即失败；成功必须有 `Result.Results[0].Vid`，`PosterUri` 可选。

#### 6.4.8 `video/enable` 与 `video/transend`

两个 GET 的 Query 完全相同：全部 `<COMMON_PARAMS>`、`msToken`、`video_id=<VOD Vid>`；无 Body。Header 为 Cookie、发布页 Referer、UA、CSRF Token。

当前项目完全不解析响应 Body，只要求 HTTP 层成功；因此不存在项目依赖的响应字段。

#### 6.4.9 ImageX `ApplyImageUpload`、动态上传和 `CommitImageUpload`

Apply 业务 Query：`Action="ApplyImageUpload"`、`ServiceId="jm8ajry58r"`、`Version="2018-08-01"`、`app_id=2906`、`s=<随机 base36>`、`user_id=""`，再加入 SigV4 字段。响应结构与 `DouyinApplyUploadResponse` 相同。

动态封面上传无 Query，Body 为原始封面字节；Header 为 `Authorization`、本地 CRC32 十六进制 `Content-Crc32`、`Content-Type`、`Origin`、`Referer`。

```ts
interface DouyinImageBinaryResponse {
  code?: number;
  message?: string;
  [key: string]: unknown;
}
```

成功要求 `code === 2000`。

Commit 业务 Query：`Action="CommitImageUpload"`、`ServiceId="jm8ajry58r"`、`Version="2018-08-01"`、`app_id=2906`、`user_id=""`，再加入 SigV4 字段。Body 为 `{ "SessionKey": "<IMAGE_SESSION_KEY>" }`。

```ts
interface DouyinCommitImageResponse {
  Result?: {
    Results?: Array<{
      Uri?: string;
      UriStatus?: number;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

成功要求 `Result.Results[0].UriStatus === 2000` 且 `Uri` 非空。

#### 6.4.10 `GET creator/get/url` 与 `GET search/challengesug`

`creator/get/url` Query 为全部 `<COMMON_PARAMS>` 加 `uri=<ImageX URI>`。

```ts
interface DouyinImageUrlResponse {
  status_code?: number;
  url?: string;
  [key: string]: unknown;
}
```

`status_code === 0` 且 `url` 非空时返回 URL，否则返回空字符串。

话题搜索 Query 为全部 `<COMMON_PARAMS>`，但 `aid` 被后写入的 `2906` 覆盖；另含 `keyword=<话题名>`、`source="challenge_create"`。

```ts
interface DouyinTopicSearchResponse {
  status_code?: number;
  sug_list?: Array<{
    cha_name?: string;
    challenge_id?: string | number;
    cid?: string | number;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}
```

匹配 `cha_name` 后 ID 优先取 `cid`，其次 `challenge_id`。

#### 6.4.11 `POST /web/api/media/aweme/create_v2/` 完整请求 Body

Query：全部 `<COMMON_PARAMS>`、`read_aid=2906`、`msToken=<TOKEN>`，BDMS 再追加唯一非空 `a_bogus`。ticket Header 的键和值由 BDMS/验证链路动态返回，项目原样附加。

Body 的完整顶层结构：

```ts
interface DouyinCreateRequest {
  item: {
    common: DouyinCreateCommon;
    cover: DouyinCreateCover;
    mix: Record<string, never>;
    selected_member: { is_selected_member_video: false };
    chapter: { chapter: string };
    anchor: Record<string, never>;
    sync: {
      dx_upgraded: 1;
      xg_user_id: "";
      should_sync: false;
      sync_to_toutiao: 0;
    };
    open_platform: Record<string, never>;
    aigc: { meta: "{}"; ContentPropagator: ""; PropagateID: ""; ReservedCode2: "{}" };
    assistant: { is_preview: 0; is_post_assistant: 1 };
    declare: { user_declare_info: "{}" };
  };
}
```

`item.common`：

```ts
interface DouyinCreateCommon {
  text: string;
  caption: string;
  item_title: string;
  activity: "[]";
  text_extra: string;
  challenges: string;
  mentions: "[]";
  hashtag_source: "";
  hot_sentence: "";
  interaction_stickers: "[]";
  visibility_type: 0 | 1 | 2;
  download: 1;
  timing: number;
  creation_id: string;
  media_type: 4;
  video_id: string;
  music_source: 0;
  music_id: null;
}
```

- `text` 为标题、清理后的描述和重新追加的已匹配话题。
- `caption` 为 `text.slice(title.length)`。
- `text_extra` 是结构化话题数组 JSON 字符串，每项完整字段为 `start/end/type=1/hashtag_name/hashtag_id/user_id=""/caption_start/caption_end`。
- `challenges` 是有效数字话题 ID 数组的 JSON 字符串。
- `creation_id` 为随机 8 位左右 base36 尾串拼接当前毫秒时间戳。

`item.cover`：

```ts
interface DouyinCreateCover {
  poster: string;
  poster_delay: 0;
  custom_cover_image_height: number;
  custom_cover_image_width: number;
  cover_tools_extend_info: string;
  cover_tools_info: string;
  horizontal_custom_cover_image_uri: string;
  horizontal_cover_tsp: 0;
  horizontal_custom_cover_image_height: number;
  horizontal_custom_cover_image_width: number;
}
```

`chapter.chapter` 解码后的完整对象：

```json
{
  "chapter_abstract": "",
  "chapter_details": [],
  "chapter_type": 0,
  "chapter_tools_info": {
    "chapter_recommend_detail": [],
    "chapter_recommend_abstract": "",
    "chapter_source": 2,
    "chapter_recommend_type": -2,
    "create_date": 0,
    "is_pc": "1",
    "is_pre_generated": "0",
    "is_syn": "1"
  }
}
```

其中 `create_date` 实际为当前 Unix 秒。

`cover_tools_info` 解码后的完整字段：

```json
{
  "video_cover_source":"pic_adjust","cover_timestamp":0,"recommend_timestamp":"{0}",
  "is_cover_edit":true,"is_cover_template":0,"is_text_template":0,"is_text":0,
  "text_num":0,"text_content":"","text_template_content":"","is_use_sticker":0,
  "sticker_id":"","sticker_tab_name":"","is_use_filter":0,"filter_id":"",
  "cover_template_id":"","cover_tab_name":"","filter_tab_name":"","tab_name":"",
  "is_cover_modify":0,"to_status":"portrait","is_use_cover_edit":1,"cover_type":1,
  "initial_cover_uri":"<IMAGE_URI>","cut_coordinate":"[0.0000,0.0000,1.0000,1.0000]",
  "cover_width":0,"cover_height":0
}
```

`cover_width/cover_height` 实际为本地封面尺寸。

`cover_tools_extend_info` 解码后的完整顶层字段：

```ts
interface DouyinCoverToolsExtendInfo {
  recommendServerInfo: { res: unknown[]; times: unknown[] };
  recommendCoverList: unknown[];
  recommendCoverInfo: {
    isFromRecommend: true;
    isDefaultSelect: false;
    isRecommendClickFrom: "";
    selectInfo: Record<string, never>;
    editingInfo: Record<string, never>;
  };
  recommendCoverTime: 0;
  coverInfo: DouyinCoverInfo;
  coverUrl: string;
  coverHorizontalInfo: DouyinCoverInfo;
  coverHorizontalUrl: string;
  pasterInfo: Record<string, never>;
  stateInfo: null;
  croppedCoverInfo: null;
  uploadBackgroundInfo: null;
  uploadPasterInfo: null;
  uploadCoverStateInfo: null;
  xiguaCoverInfo: { posterDelay: 0 };
  xiguaPasterInfo: null;
  xiguaStateInfo: null;
  xiguaUploadCoverStateInfo: null;
  xiguaUploadBackgroundInfo: null;
  xiguaUploadPasterInfo: null;
  editXigua: false;
  coverSource: "";
  previewVideoList: [{ isCurrent: true }];
}
```

`coverInfo`/`coverHorizontalInfo` 字段：

```ts
interface DouyinCoverInfo {
  videoName: "";
  verticalLocalEditorCoverData: 1;
  horizontalLocalEditorCoverData: 1;
  coverEditLogInfo: DouyinCoverEditLog;
  posterDelay: 0;
  uri: string;
  customCoverImageHeight: number;
  customCoverImageWidth: number;
  edited: true;
  coverText: "";
  type: 2;
  defaultUri: string;
  horizontalDefaultUri?: string;
  cropedUri: string;
  aiGenCoverId: "";
  url: string;
}
```

`coverHorizontalInfo` 在 JSON 序列化时不含 `horizontalDefaultUri`。`coverEditLogInfo` 字段：

```ts
interface DouyinCoverEditLog {
  video_cover_source: "pic_adjust";
  cover_timestamp: 0;
  recommend_timestamp: "0";
  is_cover_edit: "true";
  is_cover_template: 0;
  cover_template_id: "";
  is_text_template: 0;
  text_template_id: "";
  text_template_content: "";
  is_text: 0;
  text_num: 0;
  text_content: "";
  is_use_sticker: 0;
  sticker_id: "";
  sticker_tab_name: "";
  is_use_filter: 0;
  filter_id: "";
  cover_tab_name: "";
  filter_tab_name: "";
  is_cover_modify: 0;
  to_status: "portrait";
  tab_name: "";
  is_setting_double_cover: 1;
  second_cover_details: string;
}
```

`second_cover_details` 解码后包含：`video_cover_source_landscape="pic_adjust"`、`cover_timestamp_landscape=0`、`recommend_timestamp_landscape="0"`、`is_cover_edit_landscape=true`、`is_cover_template_landscape=0`、`cover_template_id_landscape=""`、`is_text_template_landscape=0`、`text_template_id_landscape=""`、`text_template_content_landscape=""`、`is_text_landscape=0`、`text_num_landscape=0`、`text_content_landscape=""`、`is_use_sticker_landscape=0`、`sticker_id_landscape=""`、`sticker_tab_name_landscape=""`、`is_use_filter_landscape=0`、`filter_id_landscape=""`、`cover_tab_name_landscape=""`、`filter_tab_name_landscape=""`、`is_cover_modify_landscape=0`、`to_status_landscape="portrait"`、`tab_name_landscape=""`。

发布响应：

```ts
interface DouyinCreateResponse {
  item_id?: string | number;
  status_code?: number;
  status_msg?: string;
  [key: string]: unknown;
}
```

成功要求 `status_code === 0` 且 `item_id` 为真值。响应 Header `x-tt-verify-passport-decision` 若存在，会先解析身份验证信息并按失败处理。

该 Header 的值是 JSON 字符串，当前项目读取的完整结构为：

```ts
interface DouyinVerifyPassportDecision {
  account_flow?: unknown; // 只有严格等于 "verify" 才进入验证错误流程
  user_info?: {
    nickname?: unknown; // 字符串时用于错误提示
    [key: string]: unknown;
  };
  event_params?: {
    verify_reason?: unknown; // 字符串时用于错误提示
    verify_scene?: unknown; // 字符串时用于错误提示
    [key: string]: unknown;
  };
  verify_way_name_list?: string | unknown[];
  [key: string]: unknown;
}
```

`verify_way_name_list` 为数组时只保留非空字符串并用逗号连接；Header 不是合法 JSON、不是对象或 `account_flow !== "verify"` 时忽略。

#### 6.4.12 `GET /web/api/media/aweme/post/`

Query 为全部 `<COMMON_PARAMS>` 加 `count=12`、`max_cursor=0`、`scene="star_atlas"`、`status="0"`。

```ts
interface DouyinPostListResponse {
  status_code?: number;
  status_msg?: string;
  aweme_list?: DouyinPostRecord[];
  [key: string]: unknown;
}

interface DouyinPostRecord {
  aweme_id?: string | number;
  status_value?: string | number;
  share_url?: string | number;
  review_struct?: {
    status_desc?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
```

根响应必须为对象；`status_code` 存在时必须能转换为 `0`；`aweme_list` 必须为数组。记录只依赖上述四组字段，其他作品详情不参与判断。

## 7. 安全、日志与维护注意事项

1. 不要把 Cookie、`bili_jct`、搜狐 `dv-id/sp-cm/mp-cv`、百家号封面 token、抖音临时 AK/SK/SessionToken 或上传节点 Auth 写入文档、测试快照和普通日志。
2. 动态上传 URL 和临时授权应在同一次准备流程内使用；过期后重新执行预上传/申请节点，不要缓存复用。
3. 最终发布类 POST 默认不可安全重试。网络超时时应先查询作品列表确认是否已创建，不能直接重复 POST。
4. 平台接口发生字段或状态码变化时应尽早报错，并同步更新本文及对应解析测试，避免把未知状态误判为公开。
5. 抖音 `a_bogus` 和 SigV4 的 Query/Body/Header 必须与签名输入逐字节一致；序列化顺序或 Body 变化后必须重新签名。

## 8. 代码索引

| 平台 | 账号请求 | 发布与状态请求 |
| --- | --- | --- |
| 哔哩哔哩 | `src/infra/account/bilibili-account.ts` | `src/infra/video/bilibili-video.ts` |
| 百家号 | `src/infra/account/baijiahao-account.ts` | `src/infra/video/baijiahao-video.ts` |
| 搜狐号 | `src/infra/account/sohu-account.ts` | `src/infra/video/sohu-video.ts` |
| 抖音 | `src/infra/account/douyin-account.ts` | `src/infra/video/douyin-video.ts` |
