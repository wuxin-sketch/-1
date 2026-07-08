import type { DataMode, MonthOption, OfficialMonthlyVolumePoint, OfficialUsedCarMarket } from '../types'

// 定义月度缓存摘要的最小结构。
export interface RankingCacheMonthSummary {
  month: string
  dataMode: DataMode
}

// 定义构建今年月份选项所需的参数。
export interface BuildMonthOptionsParams {
  year: number
  currentDate: Date
  officialMarket: OfficialUsedCarMarket
  rankingCaches: RankingCacheMonthSummary[]
}

// 将年份和月份数字格式化为 YYYY-MM。
export function formatMonthId(year: number, month: number) {
  return `${year}-${String(month).padStart(2, '0')}`
}

// 将 YYYY-MM 格式化为中文月份标签。
export function formatMonthLabel(monthId: string) {
  const [year, month] = monthId.split('-')
  return `${year}年${Number(month)}月`
}

// 将 CADA 中文月份标签转换为 YYYY-MM。
export function parseOfficialMonthLabel(label: string) {
  const match = label.match(/(\d{4})年(\d{1,2})月/)
  if (!match) {
    return null
  }

  return formatMonthId(Number(match[1]), Number(match[2]))
}

// 生成当前年份从 1 月到当前月的月份 ID。
export function buildYearMonthIds(year: number, currentDate: Date) {
  const currentYear = currentDate.getFullYear()
  const lastMonth = year === currentYear ? currentDate.getMonth() + 1 : 12

  return Array.from({ length: lastMonth }, (_, index) => formatMonthId(year, index + 1))
}

// 从官方大盘趋势中建立月份到官方点位的映射。
function buildOfficialPointMap(points: OfficialMonthlyVolumePoint[]) {
  return new Map(
    points.flatMap((point) => {
      const monthId = parseOfficialMonthLabel(point.label)
      return monthId ? [[monthId, point] as const] : []
    }),
  )
}

// 从榜单缓存摘要中建立月份到数据模式的映射。
function buildCacheModeMap(caches: RankingCacheMonthSummary[]) {
  return new Map(caches.map((cache) => [cache.month, cache.dataMode]))
}

// 判断数据模式是否代表真实缓存。
function isRealRankingCache(dataMode: DataMode | undefined) {
  return dataMode === 'live' || dataMode === 'imported'
}

// 根据官方点位和缓存模式生成月份状态。
function resolveMonthStatus(officialPoint: OfficialMonthlyVolumePoint | undefined, dataMode: DataMode | undefined) {
  if (officialPoint?.volumeWan !== null && officialPoint?.volumeWan !== undefined) {
    return {
      status: 'official' as const,
      statusLabel: '官方完整月度',
      note: 'CADA 已发布该月全国二手车完整月度大盘。',
    }
  }

  if (isRealRankingCache(dataMode)) {
    return {
      status: 'public' as const,
      statusLabel: dataMode === 'live' ? '公开观察缓存' : '人工导入缓存',
      note: 'CADA 完整月度暂未发布，当前仅展示真实公开观察或导入缓存。',
    }
  }

  return {
    status: 'pending' as const,
    statusLabel: '等待真实数据',
    note: '尚未找到该月 CADA 完整月度或公开观察缓存。',
  }
}

// 构建用于月份筛选的今年月份选项。
export function buildMonthOptions({ year, currentDate, officialMarket, rankingCaches }: BuildMonthOptionsParams): MonthOption[] {
  const officialPointByMonth = buildOfficialPointMap(officialMarket.monthlyVolumeTrend)
  const cacheModeByMonth = buildCacheModeMap(rankingCaches)
  const currentMonthId = formatMonthId(currentDate.getFullYear(), currentDate.getMonth() + 1)
  const latestOfficialMonthId = parseOfficialMonthLabel(officialMarket.latestAvailableMonth)

  return buildYearMonthIds(year, currentDate).map((monthId) => {
    const officialPoint = officialPointByMonth.get(monthId)
    const dataMode = cacheModeByMonth.get(monthId)
    const resolved = resolveMonthStatus(officialPoint, dataMode)

    return {
      id: monthId,
      label: formatMonthLabel(monthId),
      status: resolved.status,
      statusLabel: resolved.statusLabel,
      note: resolved.note,
      dataMode,
      hasRankingCache: isRealRankingCache(dataMode),
      officialVolumeWan: officialPoint?.volumeWan ?? null,
      officialMomPercent: officialPoint?.momPercent ?? null,
      isCurrentMonth: monthId === currentMonthId,
      isLatestOfficialMonth: monthId === latestOfficialMonthId,
    }
  })
}
