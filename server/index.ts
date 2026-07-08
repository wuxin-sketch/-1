import cors from 'cors'
import express, { type Request, type Response } from 'express'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRankingCsv } from '../src/lib/csv.ts'
import { buildDefaultRankingQuery, defaultRankingQuery, findVehicleById, createRankingResponse, sampleSourceCoverage } from '../src/lib/rankingEngine.ts'
import { buildMonthOptions } from '../src/lib/monthOptions.ts'
import type { GalleryCropMode, GalleryCropSelection, RankingMetric, RankingQuery, RankingScope } from '../src/types.ts'
import { collectFixtureSourceStatuses, collectLiveSourceStatuses, getFallbackSourceStatuses } from './sources/collector.ts'
import { buildSourceCoverage, listRankingCacheSummaries, readLatestPipelineRun, readRankingCache } from './pipeline/cache.ts'
import { assertValidPipelineMonth, ensureDataDirectories } from './pipeline/paths.ts'
import { refreshPipeline } from './pipeline/refresh.ts'
import { commitImportPreview, previewImportData } from './pipeline/importWorkflow.ts'
import { getOfficialUsedCarMarket, refreshOfficialUsedCarMarket } from './official/service.ts'
import { readOfficialUsedCarCache } from './official/cache.ts'
import { readLatestDataRefreshHistory, refreshUnifiedData } from './dataRefresh.ts'
import { createDataRefreshScheduler } from './dataRefreshScheduler.ts'
import { buildServiceHealth, buildServiceReady } from './health.ts'
import {
  approveGalleryCandidate,
  discoverAndStoreGalleryCandidates,
  getGalleryStatus,
  readGalleryCandidatePreviewImage,
  rejectGalleryCandidate,
} from './gallery/store.ts'
import { createCorsOptionsDelegate, isAdminRequestAllowed, readCronSecret, requireAdminRequest, requireCronRequest } from './security.ts'

// 定位服务端入口所在目录。
const serverDir = dirname(fileURLToPath(import.meta.url))

// 定位生产构建后的静态资源目录。
const distPath = resolve(serverDir, '..', 'dist')

// 创建 Express 应用实例。
const app = express()
const port = Number(process.env.PORT ?? 8787)
const host = process.env.YUEZHI_HOST ?? process.env.HOST ?? '127.0.0.1'
const serviceStartedAtMs = Date.now()
const vercelCronSchedule = '0 20 * * *'

// 创建服务级数据自动刷新调度器。
const dataRefreshScheduler = createDataRefreshScheduler({
  onResult: (result) => {
    console.log(result.message)
  },
  onError: (error: unknown) => {
    console.error(error instanceof Error ? error.message : 'scheduled data refresh unavailable')
  },
})

// 配置跨域和 JSON 解析中间件。
app.use(cors(createCorsOptionsDelegate()))
app.use(express.json({ limit: '5mb' }))

// 将安全校验错误映射为客户端可理解的状态码。
function getRequestErrorStatus(error: unknown) {
  return error instanceof Error && (error.message.includes('YYYY-MM') || error.message.includes('数据目录') || error.message.includes('只能包含')) ? 400 : 500
}

// 解析榜单接口查询参数。
function parseRankingQuery(request: Request): RankingQuery {
  const metric = String(request.query.metric ?? defaultRankingQuery.metric) as RankingMetric
  const scope = String(request.query.scope ?? defaultRankingQuery.scope) as RankingScope
  const month = String(request.query.month ?? defaultRankingQuery.month)
  const priceMin = Number(request.query.priceMin ?? defaultRankingQuery.priceMin)
  const priceMax = Number(request.query.priceMax ?? defaultRankingQuery.priceMax)

  return {
    month,
    metric: metric === 'heat' ? 'heat' : 'value',
    scope: scope === 'complete' ? 'complete' : 'mtd',
    priceMin: Number.isFinite(priceMin) ? priceMin : defaultRankingQuery.priceMin,
    priceMax: Number.isFinite(priceMax) ? priceMax : defaultRankingQuery.priceMax,
  }
}

// 根据查询参数读取缓存优先的榜单响应。
async function buildCachedRankingResponse(query: RankingQuery) {
  const cache = await readRankingCache(query.month)
  if (!cache) {
    return {
      items: [],
      scope: query.scope,
      metric: query.metric,
      month: query.month,
      updatedAt: new Date().toISOString(),
      notice: '当前月份暂无真实榜单缓存，请先刷新公开观察源或导入该月真实数据。',
      dataMode: 'unavailable' as const,
      sourceCoverage: buildSourceCoverage({
        modeNote: '当前月份暂无真实榜单缓存，未展示示例车型。',
      }),
    }
  }

  return createRankingResponse(query, cache.items, {
    dataMode: cache.dataMode,
    sourceCoverage: cache.sourceCoverage,
    pipelineRunId: cache.pipelineRunId,
    updatedAt: cache.updatedAt,
  })
}

// 获取官方大盘缓存，缺失时回退一次实时官方读取。
async function readOfficialMarketForMonthOptions() {
  const cache = await readOfficialUsedCarCache()
  return cache?.market ?? getOfficialUsedCarMarket('latest')
}

// 返回今年所有月份的数据可用状态。
async function handleMonths(request: Request, response: Response) {
  const currentDate = new Date()
  const requestedYear = Number(request.query.year ?? currentDate.getFullYear())
  const year = Number.isFinite(requestedYear) ? requestedYear : currentDate.getFullYear()
  const [officialMarket, rankingCaches] = await Promise.all([readOfficialMarketForMonthOptions(), listRankingCacheSummaries()])

  response.json(
    buildMonthOptions({
      year,
      currentDate,
      officialMarket,
      rankingCaches,
    }),
  )
}

// 桥接异步月份状态处理器到 Express 路由。
function handleMonthsRoute(request: Request, response: Response) {
  void handleMonths(request, response).catch(() => {
    response.status(500).json({ message: 'months unavailable' })
  })
}

// 从月度缓存或示例数据中查找车型详情。
async function findCachedVehicleById(modelId: string, month: string) {
  const cache = await readRankingCache(month)
  return findVehicleById(modelId, cache?.items)
}

// 根据最近管线任务生成无缓存时的来源覆盖摘要。
function buildLatestRunCoverage(run: Awaited<ReturnType<typeof readLatestPipelineRun>>) {
  if (!run) {
    return sampleSourceCoverage
  }

  return buildSourceCoverage({
    sourceCount: run.sources.length,
    availableSourceCount: run.sources.filter((source) => source.health === 'normal').length,
    blockedSourceCount: run.sources.filter((source) => source.health === 'blocked').length,
    sampleCount: run.sources.reduce((total, source) => total + source.sampleCount, 0),
    importedRecordCount: 0,
    updatedAt: run.finishedAt,
    modeNote: run.messages.join(' '),
  })
}

// 读取最近统一刷新历史并在失败时安全兜底。
async function readSafeDataRefreshHistory() {
  try {
    return await readLatestDataRefreshHistory()
  } catch {
    return { latest: null, startup: null, manual: null, scheduled: null }
  }
}

// 返回月度榜单 API 响应。
async function handleRankings(request: Request, response: Response) {
  response.json(await buildCachedRankingResponse(parseRankingQuery(request)))
}

// 桥接异步榜单处理器到 Express 路由。
function handleRankingsRoute(request: Request, response: Response) {
  void handleRankings(request, response).catch(() => {
    response.status(500).json({ message: 'rankings unavailable' })
  })
}

// 返回单个车型详情 API 响应。
async function handleVehicle(request: Request, response: Response) {
  const month = String(request.query.month ?? defaultRankingQuery.month)
  const vehicle = await findCachedVehicleById(String(request.params.modelId ?? ''), month)

  if (!vehicle) {
    response.status(404).json({ message: 'vehicle not found' })
    return
  }

  response.json(vehicle)
}

// 桥接异步车型详情处理器到 Express 路由。
function handleVehicleRoute(request: Request, response: Response) {
  void handleVehicle(request, response).catch(() => {
    response.status(500).json({ message: 'vehicle unavailable' })
  })
}

// 返回来源状态 API 响应。
async function handleSourcesStatus(request: Request, response: Response) {
  try {
    const month = String(request.query.month ?? defaultRankingQuery.month)
    const useLiveSources = request.query.live === '1'
    if (useLiveSources && !isAdminRequestAllowed(request)) {
      response.status(403).json({ message: '实时来源刷新需要管理员权限。' })
      return
    }

    const latestRun = await readLatestPipelineRun()
    const dataRefresh = await readSafeDataRefreshHistory()
    const cache = await readRankingCache(month)
    const statuses =
      latestRun?.month === month && latestRun.sources.length > 0
        ? latestRun.sources
        : useLiveSources
          ? await collectLiveSourceStatuses()
          : await collectFixtureSourceStatuses()

    response.json({
      sources: statuses,
      latestRun,
      dataMode: cache?.dataMode ?? 'unavailable',
      sourceCoverage: cache?.sourceCoverage ?? buildLatestRunCoverage(latestRun?.month === month ? latestRun : null),
      dataRefresh,
    })
  } catch {
    response.json({
      sources: getFallbackSourceStatuses(),
      latestRun: await readLatestPipelineRun(),
      dataMode: 'sample',
      sourceCoverage: sampleSourceCoverage,
      dataRefresh: await readSafeDataRefreshHistory(),
    })
  }
}

// 桥接异步来源状态处理器到 Express 路由。
function handleSourcesStatusRoute(request: Request, response: Response) {
  void handleSourcesStatus(request, response).catch(() => {
    response.status(500).json({ message: 'source status unavailable' })
  })
}

// 返回只读健康检查 API 响应。
async function handleHealth(_request: Request, response: Response) {
  response.json(
    await buildServiceHealth({
      month: defaultRankingQuery.month,
      port,
      startedAtMs: serviceStartedAtMs,
    }),
  )
}

// 桥接异步健康检查处理器到 Express 路由。
function handleHealthRoute(request: Request, response: Response) {
  void handleHealth(request, response).catch((error: unknown) => {
    response.status(500).json({ status: 'degraded', message: error instanceof Error ? error.message : 'health unavailable' })
  })
}

// 返回轻量就绪检查 API 响应。
async function handleReady(_request: Request, response: Response) {
  await ensureDataDirectories()
  response.json(
    buildServiceReady({
      startedAtMs: serviceStartedAtMs,
      distPath,
    }),
  )
}

// 返回 CADA 官方二手车大盘 API 响应。
async function handleOfficialUsedCar(request: Request, response: Response) {
  const month = String(request.query.month ?? 'latest')
  response.json(await getOfficialUsedCarMarket(month))
}

// 桥接异步官方大盘处理器到 Express 路由。
function handleOfficialUsedCarRoute(request: Request, response: Response) {
  void handleOfficialUsedCar(request, response).catch(() => {
    response.json({
      dataMode: 'official',
      dataFreshness: 'unavailable',
      officialSource: 'CADA',
      latestAvailableMonth: '暂无',
      nationalVolumeWan: null,
      momPercent: null,
      monthlyVolumeTrend: [],
      provinceTop: [],
      officialModelTopTen: [],
      transferRateTrend: [],
      managerIndexTrend: [],
      sourceUrl: 'https://data.cada.cn/main/usedCar.do',
      updatedAt: new Date().toISOString(),
      unavailableReason: '官方数据暂不可用。',
    })
  })
}

// 手动刷新 CADA 官方二手车大盘并返回缓存状态。
async function handleOfficialUsedCarRefresh(request: Request, response: Response) {
  const month = String(request.query.month ?? request.body?.month ?? 'latest')
  response.json(await refreshOfficialUsedCarMarket(month))
}

// 桥接异步官方刷新处理器到 Express 路由。
function handleOfficialUsedCarRefreshRoute(request: Request, response: Response) {
  void handleOfficialUsedCarRefresh(request, response).catch(() => {
    response.json({
      dataMode: 'official',
      dataFreshness: 'unavailable',
      officialSource: 'CADA',
      latestAvailableMonth: '暂无',
      nationalVolumeWan: null,
      momPercent: null,
      monthlyVolumeTrend: [],
      provinceTop: [],
      officialModelTopTen: [],
      transferRateTrend: [],
      managerIndexTrend: [],
      sourceUrl: 'https://data.cada.cn/main/usedCar.do',
      updatedAt: new Date().toISOString(),
      unavailableReason: '官方数据暂不可用。',
    })
  })
}

// 触发公开源自动刷新并返回最新任务。
async function handlePipelineRefresh(request: Request, response: Response) {
  const month = String(request.query.month ?? request.body?.month ?? defaultRankingQuery.month)
  assertValidPipelineMonth(month)
  response.json(await refreshPipeline(month))
}

// 桥接异步公开源刷新处理器到 Express 路由。
function handlePipelineRefreshRoute(request: Request, response: Response) {
  void handlePipelineRefresh(request, response).catch((error: unknown) => {
    response.status(getRequestErrorStatus(error)).json({ message: error instanceof Error ? error.message : 'pipeline refresh unavailable' })
  })
}

// 同时触发 CADA 官方和公开观察源刷新。
async function handleDataRefresh(request: Request, response: Response) {
  const month = String(request.query.month ?? request.body?.month ?? defaultRankingQuery.month)
  assertValidPipelineMonth(month)
  response.json(await refreshUnifiedData(month, 'manual'))
}

// 解析 Vercel Cron 定时刷新需要处理的目标月份。
function parseCronRefreshMonth(request: Request) {
  const month = String(request.query.month ?? buildDefaultRankingQuery().month)
  assertValidPipelineMonth(month)
  return month
}

// 执行 Vercel Cron 触发的统一数据刷新。
async function handleCronDataRefresh(request: Request, response: Response) {
  const result = await refreshUnifiedData(parseCronRefreshMonth(request), 'scheduled')
  response.json({
    ok: result.status !== 'failed',
    result,
  })
}

// 桥接异步统一刷新处理器到 Express 路由。
function handleDataRefreshRoute(request: Request, response: Response) {
  void handleDataRefresh(request, response).catch((error: unknown) => {
    response.status(getRequestErrorStatus(error)).json({ message: error instanceof Error ? error.message : 'data refresh unavailable' })
  })
}

// 桥接 Vercel Cron 统一刷新处理器到 Express 路由。
function handleCronDataRefreshRoute(request: Request, response: Response) {
  void handleCronDataRefresh(request, response).catch((error: unknown) => {
    response.status(getRequestErrorStatus(error)).json({ message: error instanceof Error ? error.message : 'cron data refresh unavailable' })
  })
}

// 根据 Vercel Cron 的每日计划计算下一次触发时间。
function getNextDailyCronRunAt(now = new Date()) {
  const [minuteText, hourText] = vercelCronSchedule.split(' ')
  const nextRun = new Date(now)
  nextRun.setUTCHours(Number(hourText), Number(minuteText), 0, 0)

  if (nextRun <= now) {
    nextRun.setUTCDate(nextRun.getUTCDate() + 1)
  }

  return nextRun.toISOString()
}

// 返回统一数据刷新历史和自动调度器状态。
async function handleDataRefreshStatus(_request: Request, response: Response) {
  const status = await dataRefreshScheduler.getStatus()
  const cronEnabled = Boolean(process.env.VERCEL && readCronSecret())
  response.json(
    cronEnabled
      ? {
          ...status,
          scheduler: {
            ...status.scheduler,
            enabled: true,
            started: true,
            nextRunAt: getNextDailyCronRunAt(),
          },
        }
      : status,
  )
}

// 桥接异步数据刷新状态处理器到 Express 路由。
function handleDataRefreshStatusRoute(request: Request, response: Response) {
  void handleDataRefreshStatus(request, response).catch((error: unknown) => {
    response.status(500).json({ message: error instanceof Error ? error.message : 'data refresh status unavailable' })
  })
}

// 预览真实月度数据导入文件。
function handleImportPreview(request: Request, response: Response) {
  const body = request.body as { month?: string; fileName?: string; content?: string }
  response.json(
    previewImportData({
      month: String(body?.month ?? ''),
      fileName: String(body?.fileName ?? ''),
      content: String(body?.content ?? ''),
    }),
  )
}

// 桥接导入预览处理器到 Express 路由。
function handleImportPreviewRoute(request: Request, response: Response) {
  try {
    handleImportPreview(request, response)
  } catch (error) {
    response.status(500).json({ message: error instanceof Error ? error.message : 'import preview unavailable' })
  }
}

// 确认真实月度数据导入并写入缓存。
async function handleImportCommit(request: Request, response: Response) {
  const previewId = String(request.body?.previewId ?? '')
  response.json(await commitImportPreview(previewId))
}

// 桥接确认导入处理器到 Express 路由。
function handleImportCommitRoute(request: Request, response: Response) {
  void handleImportCommit(request, response).catch((error: unknown) => {
    response.status(400).json({ message: error instanceof Error ? error.message : 'import commit unavailable' })
  })
}

// 返回授权图库覆盖率、候选队列和审核状态。
async function handleGalleryStatus(_request: Request, response: Response) {
  response.json(await getGalleryStatus())
}

// 桥接图库状态处理器到 Express 路由。
function handleGalleryStatusRoute(request: Request, response: Response) {
  void handleGalleryStatus(request, response).catch((error: unknown) => {
    response.status(500).json({ message: error instanceof Error ? error.message : 'gallery status unavailable' })
  })
}

// 触发开放授权图库候选发现。
async function handleGalleryDiscover(_request: Request, response: Response) {
  response.json(await discoverAndStoreGalleryCandidates())
}

// 校验图库批准请求中的人工裁切确认。
function parseGalleryCropSelection(value: unknown): GalleryCropSelection | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  const cropValue = value as { mode?: unknown; note?: unknown }
  const allowedModes: GalleryCropMode[] = ['source', 'center-crop', 'console-crop', 'detail-crop']
  if (typeof cropValue.mode !== 'string' || !allowedModes.includes(cropValue.mode as GalleryCropMode)) {
    return undefined
  }

  return {
    mode: cropValue.mode as GalleryCropMode,
    note: typeof cropValue.note === 'string' ? cropValue.note : '人工裁切确认。',
  }
}

// 桥接图库候选发现处理器到 Express 路由。
function handleGalleryDiscoverRoute(request: Request, response: Response) {
  void handleGalleryDiscover(request, response).catch((error: unknown) => {
    response.status(500).json({ message: error instanceof Error ? error.message : 'gallery discover unavailable' })
  })
}

// 批准候选图并写入本地图库资产。
async function handleGalleryCandidateApprove(request: Request, response: Response) {
  response.json(
    await approveGalleryCandidate(String(request.params.id ?? ''), {
      reviewerNote: typeof request.body?.note === 'string' ? request.body.note : undefined,
      cropSelection: parseGalleryCropSelection(request.body?.cropSelection),
    }),
  )
}

// 桥接图库候选批准处理器到 Express 路由。
function handleGalleryCandidateApproveRoute(request: Request, response: Response) {
  void handleGalleryCandidateApprove(request, response).catch((error: unknown) => {
    response.status(400).json({ message: error instanceof Error ? error.message : 'gallery approve unavailable' })
  })
}

// 拒绝候选图并记录原因。
async function handleGalleryCandidateReject(request: Request, response: Response) {
  response.json(
    await rejectGalleryCandidate(String(request.params.id ?? ''), {
      reason: typeof request.body?.reason === 'string' ? request.body.reason : undefined,
    }),
  )
}

// 桥接图库候选拒绝处理器到 Express 路由。
function handleGalleryCandidateRejectRoute(request: Request, response: Response) {
  void handleGalleryCandidateReject(request, response).catch((error: unknown) => {
    response.status(400).json({ message: error instanceof Error ? error.message : 'gallery reject unavailable' })
  })
}

// 通过本地 API 代理候选预览图，避免前端直接热链外部图片。
async function handleGalleryCandidatePreview(request: Request, response: Response) {
  const preview = await readGalleryCandidatePreviewImage(String(request.params.id ?? ''))
  if (!preview) {
    response.status(404).json({ message: 'candidate not found' })
    return
  }

  response.setHeader('content-type', preview.contentType)
  response.setHeader('cache-control', 'no-store')
  response.send(preview.buffer)
}

// 桥接候选预览代理处理器到 Express 路由。
function handleGalleryCandidatePreviewRoute(request: Request, response: Response) {
  void handleGalleryCandidatePreview(request, response).catch((error: unknown) => {
    response.status(500).json({ message: error instanceof Error ? error.message : 'candidate preview unavailable' })
  })
}

// 返回当前榜单 CSV 导出。
function handleRankingCsv(request: Request, response: Response) {
  void sendRankingCsv(request, response).catch(() => {
    response.status(500).send('csv unavailable')
  })
}

// 异步生成并发送当前榜单 CSV。
async function sendRankingCsv(request: Request, response: Response) {
  const ranking = await buildCachedRankingResponse(parseRankingQuery(request))
  response.setHeader('content-type', 'text/csv;charset=utf-8')
  response.setHeader('content-disposition', 'attachment; filename="yuezhi-haoche-rankings.csv"')
  response.send(`\uFEFF${buildRankingCsv(ranking.items)}`)
}

// 返回前端单页应用入口。
function handleStaticFallback(_request: Request, response: Response) {
  response.sendFile(resolve(distPath, 'index.html'))
}

// 输出本地 API 服务启动地址。
function handleServerListening() {
  console.log(`Yuezhi Haoche API listening on http://${host}:${port}`)

  const startupRefresh = dataRefreshScheduler.start()
  if (!startupRefresh) {
    console.log('Yuezhi Haoche data auto refresh disabled')
  }
}

// 注册 API 路由。
app.get('/api/rankings', handleRankingsRoute)
app.get('/api/vehicles/:modelId', handleVehicleRoute)
app.get('/api/sources/status', handleSourcesStatusRoute)
app.get('/api/months', handleMonthsRoute)
app.get('/api/health', handleHealthRoute)
app.get('/api/ready', handleReady)
app.get('/api/official/used-car', handleOfficialUsedCarRoute)
app.post('/api/official/used-car/refresh', requireAdminRequest, handleOfficialUsedCarRefreshRoute)
app.post('/api/pipeline/refresh', requireAdminRequest, handlePipelineRefreshRoute)
app.post('/api/data/refresh', requireAdminRequest, handleDataRefreshRoute)
app.get('/api/cron/data-refresh', requireCronRequest, handleCronDataRefreshRoute)
app.get('/api/data/refresh/status', handleDataRefreshStatusRoute)
app.post('/api/imports/preview', requireAdminRequest, handleImportPreviewRoute)
app.post('/api/imports/commit', requireAdminRequest, handleImportCommitRoute)
app.get('/api/gallery/status', requireAdminRequest, handleGalleryStatusRoute)
app.post('/api/gallery/discover', requireAdminRequest, handleGalleryDiscoverRoute)
app.get('/api/gallery/candidates/:id/preview', handleGalleryCandidatePreviewRoute)
app.post('/api/gallery/candidates/:id/approve', requireAdminRequest, handleGalleryCandidateApproveRoute)
app.post('/api/gallery/candidates/:id/reject', requireAdminRequest, handleGalleryCandidateRejectRoute)
app.get('/api/export/rankings.csv', handleRankingCsv)

// 在生产构建后托管静态前端资源。
if (existsSync(distPath)) {
  app.use(express.static(distPath))
  app.get(/.*/, handleStaticFallback)
}

// 在 Vercel Serverless 导入时禁用端口监听，保留本地启动行为。
if (process.env.VERCEL) {
  app.listen = ((..._args: unknown[]) => app) as unknown as typeof app.listen
}

// 导出 Express 应用，供 Vercel Serverless 入口复用。
export default app

// 启动本地 API 服务。
app.listen(port, host, handleServerListening)
