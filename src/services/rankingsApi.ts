import { sourceStatuses } from '../data/vehicles'
import { buildMonthOptions } from '../lib/monthOptions'
import { createRankingResponse, defaultRankingQuery, findVehicleById, sampleSourceCoverage } from '../lib/rankingEngine'
import { buildAdminHeaders } from './adminAuth'
import type {
  DataRefreshStatusResponse,
  ImportCommitResponse,
  ImportPreviewResponse,
  MonthOption,
  OfficialUsedCarMarket,
  PipelineRun,
  RankingQuery,
  RankingResponse,
  SourceStatusResponse,
  UnifiedDataRefreshHistory,
  UnifiedDataRefreshResponse,
  VehicleRankItem,
} from '../types'

// 将查询参数转换成接口查询字符串。
export function buildRankingSearchParams(query: RankingQuery) {
  const params = new URLSearchParams()
  params.set('month', query.month)
  params.set('scope', query.scope)
  params.set('metric', query.metric)
  params.set('priceMin', String(query.priceMin))
  params.set('priceMax', String(query.priceMax))
  return params
}

// 构建月份状态接口失败时的前端兜底响应。
function buildFallbackMonthOptions(): MonthOption[] {
  return buildMonthOptions({
    year: new Date().getFullYear(),
    currentDate: new Date(),
    officialMarket: buildFallbackOfficialMarket(),
    rankingCaches: [{ month: defaultRankingQuery.month, dataMode: 'live' }],
  })
}

// 构建来源状态接口失败时的兜底响应。
function buildFallbackSourceStatusResponse(): SourceStatusResponse {
  return {
    sources: sourceStatuses,
    latestRun: null,
    dataMode: 'sample',
    sourceCoverage: sampleSourceCoverage,
    dataRefresh: buildEmptyDataRefreshHistory(),
  }
}

// 构建没有统一刷新历史时的空状态。
function buildEmptyDataRefreshHistory(): UnifiedDataRefreshHistory {
  return {
    latest: null,
    startup: null,
    manual: null,
    scheduled: null,
  }
}

// 构建 CADA 官方接口失败时的前端兜底响应。
function buildFallbackOfficialMarket(): OfficialUsedCarMarket {
  return {
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
  }
}

// 构建统一刷新接口失败时的前端兜底响应。
function buildFallbackUnifiedRefresh(month = defaultRankingQuery.month): UnifiedDataRefreshResponse {
  const now = new Date().toISOString()
  return {
    status: 'failed',
    trigger: 'manual',
    month,
    startedAt: now,
    finishedAt: now,
    official: buildFallbackOfficialMarket(),
    pipelineRun: null,
    sourceCoverage: sampleSourceCoverage,
    sourceSummary: {
      sourceCount: 0,
      successCount: 0,
      failureCount: 0,
      failureReasons: ['统一刷新接口暂不可用。'],
    },
    message: '统一刷新接口暂不可用。',
  }
}

// 构建统一刷新状态接口失败时的前端兜底响应。
function buildFallbackDataRefreshStatus(): DataRefreshStatusResponse {
  return {
    scheduler: {
      enabled: false,
      started: false,
      isRunning: false,
      intervalMs: 0,
      targetMonth: defaultRankingQuery.month,
      nextRunAt: null,
    },
    history: buildEmptyDataRefreshHistory(),
  }
}

// 构建导入预览接口失败时的前端兜底响应。
function buildFallbackImportPreview(month: string, fileName: string, message = '导入预览接口暂不可用。'): ImportPreviewResponse {
  return {
    previewId: null,
    month,
    fileName,
    recordCount: 0,
    validRecordCount: 0,
    warnings: [],
    errors: [message],
    previewItems: [],
  }
}

// 从本地 API 获取榜单数据，失败时回退到项目内样本。
export async function fetchRankings(query: RankingQuery): Promise<RankingResponse> {
  try {
    const response = await fetch(`/api/rankings?${buildRankingSearchParams(query).toString()}`)
    if (!response.ok) {
      throw new Error(`rankings request failed: ${response.status}`)
    }

    return (await response.json()) as RankingResponse
  } catch {
    return createRankingResponse({ ...defaultRankingQuery, ...query })
  }
}

// 从本地 API 获取来源和管线状态，失败时回退到项目内样本。
export async function fetchSourceStatuses(month = defaultRankingQuery.month): Promise<SourceStatusResponse> {
  try {
    const response = await fetch(`/api/sources/status?month=${encodeURIComponent(month)}`)
    if (!response.ok) {
      throw new Error(`sources request failed: ${response.status}`)
    }

    const payload = (await response.json()) as SourceStatusResponse
    if (!Array.isArray(payload.sources)) {
      throw new Error('invalid source status payload')
    }

    return payload
  } catch {
    return buildFallbackSourceStatusResponse()
  }
}

// 从本地 API 获取今年所有月份的数据可用状态。
export async function fetchMonthOptions(year = new Date().getFullYear()): Promise<MonthOption[]> {
  try {
    const response = await fetch(`/api/months?year=${encodeURIComponent(String(year))}`)
    if (!response.ok) {
      throw new Error(`months request failed: ${response.status}`)
    }

    const payload = (await response.json()) as MonthOption[]
    if (!Array.isArray(payload)) {
      throw new Error('invalid months payload')
    }

    return payload
  } catch {
    return buildFallbackMonthOptions()
  }
}

// 从本地 API 获取统一刷新历史和自动调度器状态。
export async function fetchDataRefreshStatus(): Promise<DataRefreshStatusResponse> {
  try {
    const response = await fetch('/api/data/refresh/status')
    if (!response.ok) {
      throw new Error(`data refresh status failed: ${response.status}`)
    }

    return (await response.json()) as DataRefreshStatusResponse
  } catch {
    return buildFallbackDataRefreshStatus()
  }
}

// 请求服务端预览真实月度导入文件。
export async function previewImportData(params: { month: string; fileName: string; content: string }): Promise<ImportPreviewResponse> {
  try {
    const response = await fetch('/api/imports/preview', {
      method: 'POST',
      headers: buildAdminHeaders({
        'content-type': 'application/json',
      }),
      body: JSON.stringify(params),
    })

    if (!response.ok) {
      throw new Error(`import preview failed: ${response.status}`)
    }

    return (await response.json()) as ImportPreviewResponse
  } catch (error) {
    return buildFallbackImportPreview(params.month, params.fileName, error instanceof Error ? error.message : undefined)
  }
}

// 请求服务端确认导入预览并写入真实缓存。
export async function commitImportPreview(previewId: string): Promise<ImportCommitResponse> {
  const response = await fetch('/api/imports/commit', {
    method: 'POST',
    headers: buildAdminHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ previewId }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? `import commit failed: ${response.status}`)
  }

  return (await response.json()) as ImportCommitResponse
}

// 从本地 API 获取 CADA 官方二手车大盘。
export async function fetchOfficialUsedCarMarket(month = 'latest'): Promise<OfficialUsedCarMarket> {
  try {
    const response = await fetch(`/api/official/used-car?month=${encodeURIComponent(month)}`)
    if (!response.ok) {
      throw new Error(`official used car request failed: ${response.status}`)
    }

    return (await response.json()) as OfficialUsedCarMarket
  } catch {
    return buildFallbackOfficialMarket()
  }
}

// 触发服务端刷新 CADA 官方二手车大盘缓存。
export async function refreshOfficialUsedCarMarket(month = 'latest'): Promise<OfficialUsedCarMarket> {
  try {
    const response = await fetch(`/api/official/used-car/refresh?month=${encodeURIComponent(month)}`, {
      method: 'POST',
      headers: buildAdminHeaders({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ month }),
    })

    if (!response.ok) {
      throw new Error(`official refresh request failed: ${response.status}`)
    }

    return (await response.json()) as OfficialUsedCarMarket
  } catch {
    return buildFallbackOfficialMarket()
  }
}

// 触发服务端统一刷新 CADA 官方和公开观察源。
export async function refreshUnifiedData(month = defaultRankingQuery.month): Promise<UnifiedDataRefreshResponse> {
  try {
    const response = await fetch(`/api/data/refresh?month=${encodeURIComponent(month)}`, {
      method: 'POST',
      headers: buildAdminHeaders({
        'content-type': 'application/json',
      }),
      body: JSON.stringify({ month }),
    })

    if (!response.ok) {
      throw new Error(`data refresh failed: ${response.status}`)
    }

    return (await response.json()) as UnifiedDataRefreshResponse
  } catch {
    return buildFallbackUnifiedRefresh(month)
  }
}

// 触发服务端自动抓取公开源并刷新缓存。
export async function refreshPublicPipeline(month = defaultRankingQuery.month): Promise<{ cacheFile?: string; run: PipelineRun }> {
  const response = await fetch(`/api/pipeline/refresh?month=${encodeURIComponent(month)}`, {
    method: 'POST',
    headers: buildAdminHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ month }),
  })

  if (!response.ok) {
    throw new Error(`pipeline refresh failed: ${response.status}`)
  }

  return (await response.json()) as { cacheFile?: string; run: PipelineRun }
}

// 从本地 API 获取车型详情，失败时回退到项目内样本。
export async function fetchVehicle(modelId: string, month = defaultRankingQuery.month): Promise<VehicleRankItem | null> {
  try {
    const response = await fetch(`/api/vehicles/${modelId}?month=${encodeURIComponent(month)}`)
    if (!response.ok) {
      throw new Error(`vehicle request failed: ${response.status}`)
    }

    return (await response.json()) as VehicleRankItem
  } catch {
    return findVehicleById(modelId)
  }
}
