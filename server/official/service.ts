import type { OfficialUsedCarMarket } from '../../src/types.ts'
import { buildOfficialUnavailableMarket, fetchOfficialUsedCarMarket, selectOfficialUsedCarMarketMonth } from './cada.ts'
import { readOfficialUsedCarCache, writeOfficialUsedCarCache } from './cache.ts'

// 定义官方大盘抓取函数的可替换签名。
export type OfficialMarketFetcher = (month?: string) => Promise<OfficialUsedCarMarket>

// 定义官方大盘缓存解析参数。
export interface OfficialMarketCacheOptions {
  month?: string
  cachePath?: string
  fetcher?: OfficialMarketFetcher
}

// 判断官方大盘是否包含可展示的核心数据。
function hasOfficialCoreData(market: OfficialUsedCarMarket) {
  return market.nationalVolumeWan !== null && market.monthlyVolumeTrend.length > 0
}

// 将官方大盘标记为实时官方数据。
function markFreshMarket(market: OfficialUsedCarMarket, cachedAt: string) {
  const sourceFetchedAt = market.sourceFetchedAt ?? market.updatedAt
  return {
    ...market,
    dataFreshness: 'fresh' as const,
    cachedAt,
    sourceFetchedAt,
  }
}

// 将缓存大盘标记为缓存官方数据。
function markCachedMarket(market: OfficialUsedCarMarket, cachedAt: string, sourceFetchedAt: string, reason: string) {
  return {
    ...market,
    dataFreshness: 'cached' as const,
    cachedAt,
    sourceFetchedAt,
    unavailableReason: reason,
  }
}

// 将异常转换成前端可读的官方不可用原因。
function formatOfficialFailureReason(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return '官方数据暂不可用。'
}

// 尝试刷新官方数据，失败时回退最近一次成功缓存。
export async function resolveOfficialUsedCarMarketWithCache({
  month = 'latest',
  cachePath,
  fetcher = fetchOfficialUsedCarMarket,
}: OfficialMarketCacheOptions = {}) {
  try {
    const liveMarket = await fetcher('latest')
    if (hasOfficialCoreData(liveMarket)) {
      const { cache } = await writeOfficialUsedCarCache(liveMarket, cachePath)
      return selectOfficialUsedCarMarketMonth(markFreshMarket(liveMarket, cache.cachedAt), month)
    }

    const cache = await readOfficialUsedCarCache(cachePath)
    if (cache) {
      return selectOfficialUsedCarMarketMonth(
        markCachedMarket(cache.market, cache.cachedAt, cache.sourceFetchedAt, liveMarket.unavailableReason ?? 'CADA官方接口暂不可用，已展示最近一次成功缓存。'),
        month,
      )
    }

    return {
      ...selectOfficialUsedCarMarketMonth(liveMarket, month),
      dataFreshness: 'unavailable' as const,
    }
  } catch (error) {
    const reason = formatOfficialFailureReason(error)
    const cache = await readOfficialUsedCarCache(cachePath)
    if (cache) {
      return selectOfficialUsedCarMarketMonth(markCachedMarket(cache.market, cache.cachedAt, cache.sourceFetchedAt, reason), month)
    }

    return selectOfficialUsedCarMarketMonth(buildOfficialUnavailableMarket(reason), month)
  }
}

// 获取官方二手车大盘并自动使用缓存兜底。
export async function getOfficialUsedCarMarket(month = 'latest') {
  return resolveOfficialUsedCarMarketWithCache({ month })
}

// 手动刷新官方二手车大盘并自动使用缓存兜底。
export async function refreshOfficialUsedCarMarket(month = 'latest') {
  return resolveOfficialUsedCarMarketWithCache({ month })
}
