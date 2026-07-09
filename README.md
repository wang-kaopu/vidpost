## 启动
vite启动：
`
cd app
`

`
npm run dev
`

electron启动：
`pnpm start`

## 账号浏览器环境隔离

平台账号登录窗口使用账号级 Electron `persist:` partition 隔离浏览器状态。partition 映射持久化在本机：

`~/.agenthunt/partition-map.json`

旧目录 `~/.matrix-account` 不再作为账号状态读写路径。

映射表结构：

```json
{
  "partition_map_table": {
    "1001": "persist:rpa-MTAwMQ"
  }
}
```

规则：

- 同一个账号 ID 会复用同一个 partition，重启应用后仍从本地映射恢复。
- 不同账号 ID 默认分配不同 partition，避免 Cookie、localStorage、sessionStorage、IndexedDB、CacheStorage 串号。
- 主应用窗口使用 `persist:app-main`，不和平台账号页面共用。
- 登录窗口关闭不会删除账号 partition。
