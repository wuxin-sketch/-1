# 月值好车二手 SUV 终端

React + Vite + TypeScript 网站，用来展示中国 10-20 万二手 SUV 的月度综合价值榜，并提供 CADA 官方二手车大盘作为独立参考。

本项目不声称公开官方数据具备“10-20 万二手 SUV 单车型真实销量”粒度。官方销量只来自 CADA 官方公开数据，并且只在“官方二手车大盘”中展示；车型榜是非官方销量榜。

## 本地运行

```bash
npm install
npm run dev
```

前端默认运行在 `http://127.0.0.1:5175`，API 默认运行在 `http://127.0.0.1:8787`。

服务启动后会默认执行一次统一数据刷新：同时刷新 CADA 官方大盘和公开观察源。若只想启动服务、不做启动刷新，可设置：

```bash
$env:YUEZHI_AUTO_REFRESH='0'
npm run dev
```

## 脚本

- `npm run dev`：同时启动 Vite 前端和 Express API，并默认触发启动自动刷新。
- `npm run build`：执行 TypeScript 检查并构建前端。
- `npm run start`：启动 Express API；如果已存在 `dist`，会同时托管生产前端。
- `npm run serve:prod`：先构建前端，再用 Express 启动 `dist + API` 一体化生产预览。
- `npm run health`：请求 `http://127.0.0.1:8787/api/health` 并输出关键运行状态。
- `npm run test`：运行评分、CSV、数据管线、官方缓存、统一刷新和公开源适配器测试。
- `npm run official:refresh`：手动刷新 CADA 官方二手车大盘缓存。
- `npm run pipeline:refresh -- --month=2026-06`：刷新公开观察源并生成价值榜 live 缓存，失败后查找 `data/imports/<month>.csv` 或 `.json` 兜底。
- `npm run pipeline:status`：查看最近一次导入或公开观察源刷新任务。
- `npm run import:data -- --month=2026-06 --file=data/imports/2026-06.csv`：导入月度 CSV 或 JSON 并生成 `data/cache/<month>.json`。
- `npm run crawl:fixtures`：用本地 fixture 验证公开源解析。
- `npm run crawl:live`：尝试请求公开源，不绕过登录、验证码、风控或反爬。

## 数据目录

- `data/imports`：放置人工整理的月度 CSV/JSON 导入文件，`2026-06-template.csv` 可作为字段模板。
- `data/cache`：保存 API 优先读取的月度榜单缓存和 `official-used-car-latest.json` 官方大盘缓存。
- `data/runs`：保存最近一次公开观察源任务和统一刷新记录，包括 `latest-data-refresh.json`、`latest-data-refresh-startup.json`、`latest-data-refresh-manual.json`。

`/api/rankings` 会优先读取 `data/cache/<month>.json`。没有真实缓存时，接口和前端会回退到示例数据，并显示 `示例数据` 状态，不会伪装成真实销量。

## 自动刷新

页面顶部“刷新数据”会调用：

```http
POST /api/data/refresh?month=2026-06
```

该接口会同时刷新：

- CADA 官方二手车大盘：全国月度交易量、环比、省份 Top、转籍率、经理人指数和官方车型 Top10 参考。
- 公开观察源：瓜子、易车、汽车之家、懂车帝等无需登录的公开页面信号，用于 10-20 万二手 SUV 综合价值榜。

`GET /api/sources/status?month=2026-06` 会返回 `dataRefresh` 字段，用于解释最近统一刷新历史：

- `startup`：服务器启动后自动刷新。
- `manual`：页面按钮或手动接口触发刷新。
- `latest`：最近一次统一刷新，不区分触发方式。

来源监控会展示 CADA 缓存时间、公开源覆盖度、partial/offline 状态和失败原因。公开源不可用时只记录降级状态，不绕过平台限制。

### Vercel Cron

生产环境使用 `vercel.json` 中的 Cron 配置每天 UTC 20:00（北京时间 04:00）触发：

```http
GET /api/cron/data-refresh
```

该接口使用独立的 `CRON_SECRET` Bearer 令牌鉴权，只写入 `scheduled` 类型刷新记录，不改变 CADA 未发布月份的严格口径。

## 运行健康检查

- `GET /api/ready`：轻量就绪检查，只确认 API 进程、`dist` 静态目录和关键数据目录是否可用。
- `GET /api/health`：只读健康检查，返回服务运行时间、当前月份、CADA 缓存状态、榜单缓存状态、最近统一刷新记录和来源覆盖度，不触发 CADA 或公开源抓取。
- `npm run health`：命令行健康检查，API 未启动时会返回非零退出码和可读错误。

更多运行、恢复和降级说明见 `OPERATIONS.md`。

## 数据口径

综合价值分采用：

`45% 价格价值 + 25% 保值率 + 20% 车龄里程健康度 + 10% 来源置信度`

CADA 官方公开数据没有当前筛选粒度下的 10-20 万二手 SUV 单车型真实成交量，因此：

- “综合价值榜”不是官方销量榜。
- 公开观察源只作为车型价值榜观察信号。
- CADA 官方车型 Top10 是独立参考，不限 SUV，也不限 10-20 万价格区间。
