import { vehicleSeed } from '../data/vehicles.ts'
import type { DataMode, RankingMetric, RankingQuery, RankingResponse, SourceCoverage, VehicleRankItem } from '../types'
import { dedupeVehicles, enrichRankings, filterByPrice } from './scoring.ts'

// 根据日期生成默认查询月份。
export function getDefaultQueryMonth(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// 构建跟随当前月份的默认榜单查询参数。
export function buildDefaultRankingQuery(now = new Date()): RankingQuery {
  return {
    month: getDefaultQueryMonth(now),
    scope: 'mtd',
    metric: 'value',
    priceMin: 100000,
    priceMax: 200000,
  }
}

// 定义默认榜单查询参数。
export const defaultRankingQuery: RankingQuery = buildDefaultRankingQuery()

// 定义示例数据模式下的默认来源覆盖度。
export const sampleSourceCoverage: SourceCoverage = {
  sourceCount: 0,
  availableSourceCount: 0,
  blockedSourceCount: 0,
  sampleCount: vehicleSeed.reduce((total, item) => total + item.sampleSize, 0),
  importedRecordCount: 0,
  updatedAt: '2026-06-29 16:58',
  modeNote: '暂无真实缓存，当前使用示例数据。',
}

// 生成榜单的统计口径说明。
export function buildRankingNotice(metric: RankingMetric) {
  if (metric === 'heat') {
    return '公开观察信号为抓取代理指标，不等同于 CADA 官方全国真实成交量。'
  }

  return '综合价值分由价格价值、保值率、车龄里程健康度和来源置信度加权生成，非官方销量榜。'
}

// 根据查询参数生成榜单响应。
export function createRankingResponse(
  query: RankingQuery,
  sourceItems: VehicleRankItem[] = vehicleSeed,
  metadata: {
    dataMode?: DataMode
    sourceCoverage?: SourceCoverage
    pipelineRunId?: string
    updatedAt?: string
  } = {},
): RankingResponse {
  const filtered = filterByPrice(dedupeVehicles(sourceItems), query.priceMin, query.priceMax)
  const items = enrichRankings(filtered, query.metric)

  return {
    items,
    scope: query.scope,
    metric: query.metric,
    month: query.month,
    updatedAt: metadata.updatedAt ?? '2026-06-29 16:58',
    notice: buildRankingNotice(query.metric),
    dataMode: metadata.dataMode ?? 'sample',
    sourceCoverage: metadata.sourceCoverage ?? sampleSourceCoverage,
    pipelineRunId: metadata.pipelineRunId,
  }
}

// 查找单个车型的完整数据。
export function findVehicleById(modelId: string, sourceItems: VehicleRankItem[] = vehicleSeed) {
  return sourceItems.find((item) => item.id === modelId) ?? null
}
