import type {
  OfficialManagerIndexPoint,
  OfficialModelTopItem,
  OfficialMonthlyVolumePoint,
  OfficialProvinceTradePoint,
  OfficialTransferPoint,
  OfficialUsedCarMarket,
} from '../../src/types.ts'
import { formatMonthLabel } from '../../src/lib/monthOptions.ts'

// 定义 CADA 官方二手车数据入口。
const CADA_BASE_URL = 'https://data.cada.cn'

// 定义 CADA 官方二手车大盘来源页。
export const CADA_USED_CAR_SOURCE_URL = `${CADA_BASE_URL}/main/usedCar.do`

// 解析并强制校验 CADA 官方数据源必须使用 HTTPS。
export function resolveCadaBaseUrl(environment: NodeJS.ProcessEnv = process.env) {
  const url = new URL(environment.CADA_BASE_URL ?? CADA_BASE_URL)
  if (url.protocol !== 'https:') {
    throw new Error('CADA 官方数据源必须使用 HTTPS。')
  }

  return url.origin
}

// 定义 CADA 官方公开接口路径。
const CADA_ENDPOINTS = {
  monthTradingVolume: '/usedCar/monthTradingVolume.do',
  countryTradeStatusTop: '/usedCar/countryTradeStatusTop.do',
  subModelTopTen: '/usedCar/subModelTopTen.do',
  wholeCountryTransfer: '/usedCar/wholeCountryTransfer.do',
  managerIndex: '/usedCar/managerIndex.do',
} as const

// 定义 CADA 图表接口的序列结构。
interface CadaChartSeries {
  name?: string
  type?: string
  data?: unknown[]
}

// 定义 CADA 图表接口的响应结构。
interface CadaChartResponse {
  code?: number
  result?: string
  data?: {
    legend?: string[]
    legendName?: string
    xAxis?: unknown[]
    lineValue?: unknown[]
    series?: CadaChartSeries[]
  }
}

// 定义 CADA 官方大盘解析所需的原始响应集合。
export interface CadaMarketPayloads {
  monthTradingVolume?: CadaChartResponse
  countryTradeStatusTop?: CadaChartResponse
  subModelTopTen?: CadaChartResponse
  wholeCountryTransfer?: CadaChartResponse
  managerIndex?: CadaChartResponse
}

// 将 CADA 字段安全转换为数值。
function parseNumber(value: unknown) {
  if (value === null || value === undefined) {
    return null
  }

  const normalized = String(value).replace(/[^\d.-]/g, '')
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

// 将 CADA 字段安全转换为字符串。
function parseText(value: unknown) {
  return String(value ?? '').trim()
}

// 判断 CADA 接口是否返回了可解析的数据体。
function isUsablePayload(payload: CadaChartResponse | undefined) {
  return Boolean(payload?.data)
}

// 按名称或图表类型提取 CADA 序列。
function findSeries(payload: CadaChartResponse | undefined, names: string[], preferredType?: string) {
  const series = payload?.data?.series ?? []
  const byName = series.find((item) => names.includes(parseText(item.name)))

  if (byName) {
    return byName
  }

  return series.find((item) => (preferredType ? item.type === preferredType : true)) ?? null
}

// 将 CADA 月份标签补全为带年份的展示文案。
function normalizeMonthLabels(labels: unknown[]) {
  const textLabels = labels.map(parseText)
  const firstFullIndex = textLabels.findIndex((label) => /\d{4}年\d{1,2}月/.test(label))
  const firstFullYear = firstFullIndex >= 0 ? Number(textLabels[firstFullIndex].match(/(\d{4})年/)?.[1]) : null
  let activeYear = firstFullYear ?? new Date().getFullYear()

  return textLabels.map((label, index) => {
    const fullMatch = label.match(/(\d{4})年(\d{1,2})月/)
    if (fullMatch) {
      activeYear = Number(fullMatch[1])
      return `${fullMatch[1]}年${Number(fullMatch[2])}月`
    }

    const monthMatch = label.match(/(\d{1,2})月/)
    if (!monthMatch) {
      return label
    }

    const inferredYear = firstFullYear !== null && index < firstFullIndex ? firstFullYear - 1 : activeYear
    return `${inferredYear}年${Number(monthMatch[1])}月`
  })
}

// 解析 CADA 全国二手车月度交易量和环比趋势。
function parseMonthlyVolumeTrend(payload: CadaChartResponse | undefined): OfficialMonthlyVolumePoint[] {
  if (!isUsablePayload(payload)) {
    return []
  }

  const labels = normalizeMonthLabels(payload?.data?.xAxis ?? [])
  const volumeSeries = findSeries(payload, ['交易量'], 'bar')
  const momSeries = findSeries(payload, ['环比'], 'line')

  return labels.map((label, index) => ({
    label,
    volumeWan: parseNumber(volumeSeries?.data?.[index]),
    momPercent: parseNumber(momSeries?.data?.[index]),
  }))
}

// 从月度趋势中识别最新可用月份。
function findLatestMonthlyPoint(points: OfficialMonthlyVolumePoint[]) {
  return [...points].reverse().find((point) => point.volumeWan !== null) ?? null
}

// 将 YYYY-MM 转换为 CADA 月份标签。
function formatOfficialMonthLabel(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return month
  }

  return formatMonthLabel(month)
}

// 按指定月份从官方大盘中选取全国交易量。
export function selectOfficialUsedCarMarketMonth(market: OfficialUsedCarMarket, month = 'latest') {
  if (month === 'latest') {
    return {
      ...market,
      selectedMonth: month,
      selectedMonthLabel: market.latestAvailableMonth,
      selectedMonthStatus: market.nationalVolumeWan === null ? 'pending' as const : 'official' as const,
    }
  }

  const selectedLabel = formatOfficialMonthLabel(month)
  const selectedPoint = market.monthlyVolumeTrend.find((point) => point.label === selectedLabel)

  if (!selectedPoint || selectedPoint.volumeWan === null) {
    return {
      ...market,
      selectedMonth: month,
      selectedMonthLabel: selectedLabel,
      selectedMonthStatus: 'pending' as const,
      nationalVolumeWan: null,
      momPercent: null,
      unavailableReason: `CADA 尚未发布 ${selectedLabel} 完整月度二手车大盘，当前仅展示已发布月份趋势和公开观察缓存。`,
    }
  }

  return {
    ...market,
    selectedMonth: month,
    selectedMonthLabel: selectedLabel,
    selectedMonthStatus: 'official' as const,
    nationalVolumeWan: selectedPoint.volumeWan,
    momPercent: selectedPoint.momPercent,
  }
}

// 解析 CADA 省份交易量 Top 数据。
function parseProvinceTop(payload: CadaChartResponse | undefined): OfficialProvinceTradePoint[] {
  if (!isUsablePayload(payload)) {
    return []
  }

  const labels = payload?.data?.xAxis ?? []
  const volumeSeries = findSeries(payload, ['交易量'], 'bar')

  return labels
    .map((province, index) => ({
      province: parseText(province),
      volumeWan: parseNumber(volumeSeries?.data?.[index]),
    }))
    .filter((point) => point.province && point.province !== '总计')
}

// 解析 CADA 官方车型 Top10 参考榜。
function parseModelTopTen(payload: CadaChartResponse | undefined): OfficialModelTopItem[] {
  if (!isUsablePayload(payload)) {
    return []
  }

  const labels = payload?.data?.xAxis ?? []
  const volumeSeries = findSeries(payload, [], 'bar')

  return labels
    .map((model, index) => ({
      rank: index + 1,
      model: parseText(model),
      volumeWan: parseNumber(volumeSeries?.data?.[index]),
      scopeNote: 'CADA官方车型Top10参考，不限SUV/价格区间',
    }))
    .filter((item) => item.model)
    .sort((left, right) => (right.volumeWan ?? -1) - (left.volumeWan ?? -1))
    .map((item, index) => ({ ...item, rank: index + 1 }))
}

// 解析 CADA 全国转籍率趋势。
function parseTransferTrend(payload: CadaChartResponse | undefined): OfficialTransferPoint[] {
  if (!isUsablePayload(payload)) {
    return []
  }

  const labels = payload?.data?.xAxis ?? []
  const series = payload?.data?.series ?? []
  const lineSeries = series.filter((item) => item.type === 'line' && item.data?.some((value) => parseNumber(value) !== null))

  return lineSeries.flatMap((item) =>
    (item.data ?? [])
      .map((value, index) => ({
        label: `${parseText(item.name).replace('转籍', '')}${parseText(labels[index])}`,
        ratePercent: parseNumber(value),
        seriesName: parseText(item.name),
      }))
      .filter((point) => point.ratePercent !== null),
  )
}

// 解析 CADA 二手车经理人指数趋势。
function parseManagerIndexTrend(payload: CadaChartResponse | undefined): OfficialManagerIndexPoint[] {
  if (!isUsablePayload(payload)) {
    return []
  }

  const labels = normalizeMonthLabels(payload?.data?.xAxis ?? [])
  const values = payload?.data?.lineValue ?? []

  return labels
    .map((label, index) => ({
      label,
      index: parseNumber(values[index]),
    }))
    .filter((point) => point.index !== null)
}

// 构造 CADA 官方数据不可用时的明确响应。
export function buildOfficialUnavailableMarket(reason: string, updatedAt = new Date().toISOString()): OfficialUsedCarMarket {
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
    sourceUrl: CADA_USED_CAR_SOURCE_URL,
    updatedAt,
    unavailableReason: reason,
  }
}

// 将 CADA 多接口响应归一化为官方二手车大盘。
export function parseOfficialUsedCarMarketPayloads(
  payloads: CadaMarketPayloads,
  unavailableReason?: string,
  updatedAt = new Date().toISOString(),
): OfficialUsedCarMarket {
  const monthlyVolumeTrend = parseMonthlyVolumeTrend(payloads.monthTradingVolume)
  const latestPoint = findLatestMonthlyPoint(monthlyVolumeTrend)
  const provinceTop = parseProvinceTop(payloads.countryTradeStatusTop)
  const officialModelTopTen = parseModelTopTen(payloads.subModelTopTen)
  const transferRateTrend = parseTransferTrend(payloads.wholeCountryTransfer)
  const managerIndexTrend = parseManagerIndexTrend(payloads.managerIndex)

  return {
    dataMode: 'official',
    dataFreshness: 'fresh',
    officialSource: 'CADA',
    latestAvailableMonth: latestPoint?.label ?? '暂无',
    nationalVolumeWan: latestPoint?.volumeWan ?? null,
    momPercent: latestPoint?.momPercent ?? null,
    monthlyVolumeTrend,
    provinceTop,
    officialModelTopTen,
    transferRateTrend,
    managerIndexTrend,
    sourceUrl: CADA_USED_CAR_SOURCE_URL,
    updatedAt,
    sourceFetchedAt: updatedAt,
    unavailableReason,
  }
}

// 从 CADA 官方公开接口读取 JSON 数据。
async function fetchCadaEndpoint(endpoint: string): Promise<CadaChartResponse> {
  const response = await fetch(`${resolveCadaBaseUrl()}${endpoint}`, {
    headers: {
      accept: 'application/json, text/plain, */*',
      referer: CADA_USED_CAR_SOURCE_URL,
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36',
    },
  })

  if (!response.ok) {
    throw new Error(`CADA ${endpoint} returned ${response.status}`)
  }

  return (await response.json()) as CadaChartResponse
}

// 将 Promise.allSettled 的接口结果整理为可解析载荷。
function collectCadaPayloads(results: PromiseSettledResult<CadaChartResponse>[]) {
  const keys = Object.keys(CADA_ENDPOINTS) as Array<keyof typeof CADA_ENDPOINTS>
  const payloads: CadaMarketPayloads = {}
  const failures: string[] = []

  results.forEach((result, index) => {
    const key = keys[index]
    if (result.status === 'fulfilled') {
      payloads[key] = result.value
      return
    }

    failures.push(`${key}: ${result.reason instanceof Error ? result.reason.message : '接口不可用'}`)
  })

  return { payloads, failures }
}

// 获取 CADA 官方二手车大盘数据。
export async function fetchOfficialUsedCarMarket(_month = 'latest') {
  try {
    const endpoints = Object.values(CADA_ENDPOINTS)
    const results = await Promise.allSettled(endpoints.map((endpoint) => fetchCadaEndpoint(endpoint)))
    const { payloads, failures } = collectCadaPayloads(results)
    const reason = failures.length > 0 ? `部分CADA官方接口暂不可用：${failures.join('；')}` : undefined
    const market = parseOfficialUsedCarMarketPayloads(payloads, reason)

    if (!market.monthlyVolumeTrend.length) {
      return buildOfficialUnavailableMarket(reason ?? '官方数据暂不可用：CADA月度交易量接口未返回可用数据。')
    }

    return market
  } catch (error) {
    return buildOfficialUnavailableMarket(error instanceof Error ? error.message : '官方数据暂不可用。')
  }
}
