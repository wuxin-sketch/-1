# 月值好车运行手册

## 开发启动

```powershell
npm install
npm run dev
```

- 前端开发地址：`http://127.0.0.1:5175/`
- Express API 地址：`http://127.0.0.1:8787/`
- 默认启动后会自动执行一次统一刷新：CADA 官方大盘 + 公开观察源。

## 生产一体化预览

```powershell
npm run serve:prod
```

## 管理接口令牌

生产环境和 Vercel 部署必须配置管理员令牌，否则刷新、导入、图库审核等写操作接口会被拒绝：

```powershell
$env:YUEZHI_ADMIN_TOKEN='<换成高强度随机令牌>'
npm run start
```

前端浏览器需要保存同一令牌后再执行导入、刷新和图库审核：

```js
localStorage.setItem('yuezhi-admin-token', '<同一个令牌>')
```

如需允许指定线上域名跨域访问 API，可配置逗号分隔的来源：

```powershell
$env:YUEZHI_CORS_ORIGINS='https://example.com,https://www.example.com'
```

本地非生产环境的 `127.0.0.1`/`localhost` 回环请求默认允许免令牌，方便单机开发和验收。

该命令会先执行 `npm run build`，再由 Express 在 `http://127.0.0.1:8787/` 同时托管 `dist` 前端和 API。

也可以使用本地预览脚本：

```powershell
.\local-preview.ps1 -Mode preview
```

## Vercel Cron 定时刷新

线上生产部署通过 Vercel Cron 每天 UTC 20:00（北京时间 04:00）调用：

```http
GET /api/cron/data-refresh
```

该接口只接受 Vercel Cron 自动携带的 `Authorization: Bearer <CRON_SECRET>`，需要在 Vercel Production 环境变量中配置：

```powershell
vercel env add CRON_SECRET production
```

`CRON_SECRET` 应使用独立高强度随机值，不要复用浏览器端保存的 `YUEZHI_ADMIN_TOKEN`。Cron 执行成功后会写入 `data/runs/latest-data-refresh-scheduled.json`，页面消息中心和 `/api/data/refresh/status` 会读取该记录。

## 关闭启动自动刷新

```powershell
$env:YUEZHI_AUTO_REFRESH='0'
npm run start
```

关闭启动自动刷新只影响服务器启动时的自动任务，不影响页面“刷新数据”按钮和手动刷新 API。

## 健康检查

```powershell
npm run health
```

健康检查请求固定地址：`http://127.0.0.1:8787/api/health`。API 未启动时命令会返回非零退出码。

- `GET /api/ready`：轻量探活，只检查 API 进程、`dist` 静态资源目录和关键数据目录。
- `GET /api/health`：只读健康检查，返回运行时间、当前月份、CADA 缓存、榜单缓存、最近统一刷新和来源覆盖度。
- 健康检查不会触发 CADA 或公开源请求，避免监控请求造成抓取压力。

## 常见 degraded 原因

- `CADA官方缓存缺失`：还没有成功写入 `data/cache/official-used-car-latest.json`。
- `榜单缓存缺失`：当前月份没有 `data/cache/<month>.json`，页面会回退示例数据并明确标注。
- `暂无统一数据刷新记录`：服务器尚未自动或手动执行过统一刷新。
- `最近统一刷新为 partial`：CADA 可能使用缓存，或部分公开观察源被 blocked/offline。
- `最近统一刷新失败`：CADA 官方大盘和公开观察源都没有可用结果。

## 恢复步骤

```powershell
npm run official:refresh
npm run pipeline:refresh -- --month=2026-06
npm run health
```

也可以在页面顶部点击“刷新数据”，它会调用：

```http
POST /api/data/refresh?month=2026-06
```

官方销量仍只来自 CADA 官方公开数据。公开观察源只参与 10-20 万二手 SUV 综合价值榜观察信号；遇到登录、验证码、风控或反爬时只记录失败原因，不绕过限制。
