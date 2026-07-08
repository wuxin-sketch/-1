import { describe, expect, it } from 'vitest'
import { buildServiceHealth, buildServiceReady } from '../server/health'
import { buildSourceCoverage, type RankingCacheFile } from '../server/pipeline/cache'
import type { OfficialUsedCarCacheFile } from '../server/official/cache'
import type { OfficialUsedCarMarket, PipelineRunStatus, UnifiedDataRefreshHistory, UnifiedDataRefreshSourceSummary } from '../src/types'

// 定义健康检查测试使用的固定时间。
const fixedNow = new Date('2026-06-30T12:00:10.000Z')

// 定义健康检查测试使用的启动时间。
const startedAtMs = Date.parse('2026-06-30T12:00:00.000Z')

// 构建健康检查测试使用的官方大盘。
function buildOfficialMarket(): OfficialUsedCarMarket {
  return {
    dataMode: 'official',
    dataFreshness: 'fresh',
    officialSource: 'CADA',
    latestAvailableMonth: '2026年5月',
    nationalVolumeWan: 160,
    momPercent: -4.2,
    monthlyVolumeTrend: [{ label: '2026年5月', volumeWan: 160, momPercent: -4.2 }],
    provinceTop: [],
    officialModelTopTen: [],
    transferRateTrend: [],
    managerIndexTrend: [],
    sourceUrl: 'https://data.cada.cn/main/usedCar.do',
    updatedAt: '2026-06-30T10:00:00.000Z',
    cachedAt: '2026-06-30T10:02:00.000Z',
    sourceFetchedAt: '2026-06-30T10:00:00.000Z',
  }
}

// 构建健康检查测试使用的官方缓存。
function buildOfficialCache(): OfficialUsedCarCacheFile {
  const market = buildOfficialMarket()

  return {
    cachedAt: '2026-06-30T10:02:00.000Z',
    sourceFetchedAt: '2026-06-30T10:00:00.000Z',
    latestAvailableMonth: market.latestAvailableMonth,
    market,
  }
}

// 构建健康检查测试使用的榜单缓存。
function buildRankingCache(): RankingCacheFile {
  return {
    month: '2026-06',
    dataMode: 'live',
    items: [],
    updatedAt: '2026-06-30T10:03:00.000Z',
    sourceCoverage: buildSourceCoverage({
      sourceCount: 3,
      availableSourceCount: 3,
      blockedSourceCount: 0,
      sampleCount: 24,
      importedRecordCount: 0,
      updatedAt: '2026-06-30T10:03:00.000Z',
      modeNote: '公开观察源正常。',
    }),
  }
}

// 构建健康检查测试使用的刷新来源摘要。
function buildSourceSummary(): UnifiedDataRefreshSourceSummary {
  return {
    sourceCount: 3,
    successCount: 3,
    failureCount: 0,
    failureReasons: [],
  }
}

// 构建健康检查测试使用的刷新历史。
function buildRefreshHistory(status: PipelineRunStatus = 'success'): UnifiedDataRefreshHistory {
  return {
    latest: {
      status,
      trigger: 'startup',
      month: '2026-06',
      startedAt: '2026-06-30T10:00:00.000Z',
      finishedAt: '2026-06-30T10:04:00.000Z',
      official: buildOfficialMarket(),
      pipelineRun: null,
      sourceCoverage: buildRankingCache().sourceCoverage,
      sourceSummary: buildSourceSummary(),
      message: status === 'failed' ? '统一刷新失败：CADA和公开观察源均不可用。' : '统一刷新完成。',
    },
    startup: null,
    manual: null,
    scheduled: null,
  }
}

// 验证服务健康检查聚合状态。
describe('service health', () => {
  // 验证缓存和刷新都正常时返回 ok。
  it('returns ok when official cache, ranking cache, and latest refresh are usable', async () => {
    const health = await buildServiceHealth({
      month: '2026-06',
      port: 8787,
      startedAtMs,
      now: () => fixedNow,
      versionReader: async () => '1.0.0',
      officialCacheReader: async () => buildOfficialCache(),
      rankingCacheReader: async () => buildRankingCache(),
      refreshHistoryReader: async () => buildRefreshHistory(),
    })

    expect(health.status).toBe('ok')
    expect(health.uptimeSeconds).toBe(10)
    expect(health.officialCache.exists).toBe(true)
    expect(health.rankingCache.exists).toBe(true)
    expect(health.sourceCoverage.availableSourceCount).toBe(3)
    expect(health.reasons).toEqual([])
  })

  // 验证榜单缓存缺失时返回 degraded 和明确原因。
  it('returns degraded when ranking cache is missing', async () => {
    const health = await buildServiceHealth({
      month: '2026-06',
      port: 8787,
      startedAtMs,
      now: () => fixedNow,
      officialCacheReader: async () => buildOfficialCache(),
      rankingCacheReader: async () => null,
      refreshHistoryReader: async () => buildRefreshHistory(),
    })

    expect(health.status).toBe('degraded')
    expect(health.rankingCache.exists).toBe(false)
    expect(health.reasons.join('\n')).toContain('榜单缓存缺失')
  })

  // 验证最近刷新失败时返回 degraded 和失败摘要。
  it('returns degraded when latest unified refresh failed', async () => {
    const health = await buildServiceHealth({
      month: '2026-06',
      port: 8787,
      startedAtMs,
      now: () => fixedNow,
      officialCacheReader: async () => buildOfficialCache(),
      rankingCacheReader: async () => buildRankingCache(),
      refreshHistoryReader: async () => buildRefreshHistory('failed'),
    })

    expect(health.status).toBe('degraded')
    expect(health.latestRefresh?.status).toBe('failed')
    expect(health.reasons.join('\n')).toContain('最近统一刷新失败')
  })
})

// 验证服务就绪检查路径判断。
describe('service ready', () => {
  // 验证静态资源和数据目录都存在时返回 ready。
  it('returns ready when static assets and data directories exist', () => {
    const ready = buildServiceReady({
      startedAtMs,
      distPath: 'D:\\codex-workspace\\6-29 月值好车\\dist',
      now: () => fixedNow,
      dataDirectories: [
        { name: 'data', path: 'D:\\codex-workspace\\6-29 月值好车\\data' },
        { name: 'cache', path: 'D:\\codex-workspace\\6-29 月值好车\\data\\cache' },
      ],
      pathExists: () => true,
    })

    expect(ready.ready).toBe(true)
    expect(ready.reasons).toEqual([])
  })

  // 验证静态资源或关键目录缺失时返回不可就绪。
  it('returns not ready when static assets or data directories are missing', () => {
    const ready = buildServiceReady({
      startedAtMs,
      distPath: 'D:\\codex-workspace\\6-29 月值好车\\dist',
      now: () => fixedNow,
      dataDirectories: [
        { name: 'data', path: 'D:\\codex-workspace\\6-29 月值好车\\data' },
        { name: 'runs', path: 'D:\\codex-workspace\\6-29 月值好车\\data\\runs' },
      ],
      pathExists: (path) => path.endsWith('data'),
    })

    expect(ready.ready).toBe(false)
    expect(ready.reasons.join('\n')).toContain('dist')
    expect(ready.reasons.join('\n')).toContain('runs')
  })
})
