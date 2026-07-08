import { mkdir, rm } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { buildOfficialUnavailableMarket, parseOfficialUsedCarMarketPayloads } from '../server/official/cada'
import { readOfficialUsedCarCache } from '../server/official/cache'
import { resolveOfficialUsedCarMarketWithCache } from '../server/official/service'

// 定义官方缓存测试使用的临时路径。
const testCachePath = resolve(process.cwd(), 'data', 'cache', 'test-official-used-car-latest.json')

// 清理官方缓存测试产生的临时文件。
afterEach(async () => {
  await rm(testCachePath, { force: true })
})

// 构建官方缓存测试使用的成功大盘。
function buildSuccessfulMarket() {
  return parseOfficialUsedCarMarketPayloads(
    {
      monthTradingVolume: {
        data: {
          xAxis: ['2026年4月', '5月'],
          series: [
            { name: '交易量', type: 'bar', data: ['167', '160'] },
            { name: '环比', type: 'line', data: ['-6.7', '-4.2'] },
          ],
        },
      },
    },
    undefined,
    '2026-06-30T10:00:00.000Z',
  )
}

// 验证官方数据缓存的实时和降级策略。
describe('official CADA cache strategy', () => {
  // 验证成功抓取会写入缓存并返回实时状态。
  it('writes successful official data to cache as fresh data', async () => {
    await mkdir(dirname(testCachePath), { recursive: true })
    const market = await resolveOfficialUsedCarMarketWithCache({
      cachePath: testCachePath,
      fetcher: async () => buildSuccessfulMarket(),
    })
    const cache = await readOfficialUsedCarCache(testCachePath)

    expect(market.dataFreshness).toBe('fresh')
    expect(market.cachedAt).toBeTruthy()
    expect(market.sourceFetchedAt).toBe('2026-06-30T10:00:00.000Z')
    expect(cache?.latestAvailableMonth).toBe('2026年5月')
    expect(cache?.market.nationalVolumeWan).toBe(160)
  })

  // 验证 CADA 不可用时会读取最近一次成功缓存。
  it('returns cached official data when live official data is unavailable', async () => {
    await mkdir(dirname(testCachePath), { recursive: true })
    await resolveOfficialUsedCarMarketWithCache({
      cachePath: testCachePath,
      fetcher: async () => buildSuccessfulMarket(),
    })

    const cachedMarket = await resolveOfficialUsedCarMarketWithCache({
      cachePath: testCachePath,
      fetcher: async () => buildOfficialUnavailableMarket('CADA接口失败。', '2026-06-30T11:00:00.000Z'),
    })

    expect(cachedMarket.dataFreshness).toBe('cached')
    expect(cachedMarket.nationalVolumeWan).toBe(160)
    expect(cachedMarket.unavailableReason).toBe('CADA接口失败。')
    expect(cachedMarket.sourceFetchedAt).toBe('2026-06-30T10:00:00.000Z')
  })

  // 验证无缓存且实时不可用时不会伪造官方数据。
  it('returns unavailable state when live data and cache are both missing', async () => {
    const market = await resolveOfficialUsedCarMarketWithCache({
      cachePath: testCachePath,
      fetcher: async () => buildOfficialUnavailableMarket('CADA接口失败。', '2026-06-30T11:00:00.000Z'),
    })

    expect(market.dataFreshness).toBe('unavailable')
    expect(market.nationalVolumeWan).toBeNull()
    expect(market.latestAvailableMonth).toBe('暂无')
    expect(market.unavailableReason).toBe('CADA接口失败。')
  })
})
