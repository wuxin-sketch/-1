import { describe, expect, it } from 'vitest'
import { createUnifiedDataRefresher } from '../server/dataRefresh'
import type { OfficialUsedCarMarket, PipelineRun, SourceCoverage, SourceHealth, SourceStatus, UnifiedDataRefreshResponse } from '../src/types'

// 构建统一刷新测试使用的官方大盘。
function buildOfficialMarket(dataFreshness: OfficialUsedCarMarket['dataFreshness'] = 'fresh'): OfficialUsedCarMarket {
  return {
    dataMode: 'official',
    dataFreshness,
    officialSource: 'CADA',
    latestAvailableMonth: dataFreshness === 'unavailable' ? '暂无' : '2026年5月',
    nationalVolumeWan: dataFreshness === 'unavailable' ? null : 160,
    momPercent: dataFreshness === 'unavailable' ? null : -4.2,
    monthlyVolumeTrend: dataFreshness === 'unavailable' ? [] : [{ label: '2026年5月', volumeWan: 160, momPercent: -4.2 }],
    provinceTop: [],
    officialModelTopTen: [],
    transferRateTrend: [],
    managerIndexTrend: [],
    sourceUrl: 'https://data.cada.cn/main/usedCar.do',
    updatedAt: '2026-06-30T10:00:00.000Z',
    cachedAt: dataFreshness === 'cached' ? '2026-06-30T09:00:00.000Z' : undefined,
    sourceFetchedAt: '2026-06-30T10:00:00.000Z',
    unavailableReason: dataFreshness === 'unavailable' ? 'CADA接口失败。' : undefined,
  }
}

// 构建统一刷新测试使用的公开源状态。
function buildSource(id: string, health: SourceHealth = 'normal'): SourceStatus {
  return {
    id,
    name: id,
    url: `https://example.com/${id}`,
    health,
    freshness: health === 'normal' ? '刚刚' : '不可用',
    lastSync: '2026-06-30T10:00:00.000Z',
    sampleCount: health === 'normal' ? 10 : 0,
    note: health === 'normal' ? '正常返回公开观察信号。' : '公开源请求受限，未绕过反爬。',
  }
}

// 构建统一刷新测试使用的管线任务。
function buildPipelineRun(status: PipelineRun['status'] = 'success', sources: SourceStatus[] = [buildSource('guazi')]): PipelineRun {
  return {
    id: `run-${status}`,
    month: '2026-06',
    dataMode: status === 'failed' ? 'sample' : 'live',
    status,
    startedAt: '2026-06-30T10:00:00.000Z',
    finishedAt: '2026-06-30T10:01:00.000Z',
    sources,
    successCount: sources.filter((source) => source.health === 'normal').length,
    failureCount: sources.filter((source) => source.health !== 'normal').length,
    messages: [`公开观察源 ${status}`],
  }
}

// 构建统一刷新测试使用的来源覆盖度。
function buildCoverage(): SourceCoverage {
  return {
    sourceCount: 1,
    availableSourceCount: 1,
    blockedSourceCount: 0,
    sampleCount: 10,
    importedRecordCount: 0,
    updatedAt: '2026-06-30T10:01:00.000Z',
    modeNote: '测试覆盖度。',
  }
}

// 跳过测试中的最近刷新记录写入。
async function skipWritingRefreshResult(_result: UnifiedDataRefreshResponse) {
  return undefined
}

// 验证统一数据刷新调度。
describe('unified data refresh', () => {
  // 验证 CADA 和公开观察源都成功时返回 success。
  it('returns success when official and pipeline refreshes both succeed', async () => {
    const refresher = createUnifiedDataRefresher({
      officialRefresher: async () => buildOfficialMarket('fresh'),
      pipelineRefresher: async () => ({ run: buildPipelineRun('success') }),
      rankingCacheReader: async () => ({ month: '2026-06', dataMode: 'live', items: [], updatedAt: '2026-06-30T10:01:00.000Z', sourceCoverage: buildCoverage() }),
      resultWriter: skipWritingRefreshResult,
    })

    const result = await refresher('2026-06', 'manual')

    expect(result.status).toBe('success')
    expect(result.official.dataFreshness).toBe('fresh')
    expect(result.sourceSummary.successCount).toBe(1)
    expect(result.sourceCoverage.modeNote).toBe('测试覆盖度。')
  })

  // 验证 CADA 使用缓存或公开源失败时返回 partial。
  it('returns partial when official cache is usable but public pipeline fails', async () => {
    const blockedSource = buildSource('dongchedi', 'blocked')
    const refresher = createUnifiedDataRefresher({
      officialRefresher: async () => buildOfficialMarket('cached'),
      pipelineRefresher: async () => ({ run: buildPipelineRun('failed', [blockedSource]) }),
      rankingCacheReader: async () => null,
      resultWriter: skipWritingRefreshResult,
    })

    const result = await refresher('2026-06', 'manual')

    expect(result.status).toBe('partial')
    expect(result.official.dataFreshness).toBe('cached')
    expect(result.sourceSummary.failureCount).toBe(1)
    expect(result.sourceSummary.failureReasons[0]).toContain('未绕过反爬')
  })

  // 验证 CADA 和公开观察源都不可用时返回 failed。
  it('returns failed when official and pipeline data are both unavailable', async () => {
    const refresher = createUnifiedDataRefresher({
      officialRefresher: async () => buildOfficialMarket('unavailable'),
      pipelineRefresher: async () => ({ run: buildPipelineRun('failed', [buildSource('autohome', 'offline')]) }),
      rankingCacheReader: async () => null,
      resultWriter: skipWritingRefreshResult,
    })

    const result = await refresher('2026-06', 'manual')

    expect(result.status).toBe('failed')
    expect(result.official.nationalVolumeWan).toBeNull()
    expect(result.pipelineRun?.status).toBe('failed')
  })

  // 验证重复触发时复用同一个进行中的刷新任务。
  it('reuses the active refresh task for concurrent calls', async () => {
    let officialCalls = 0
    let pipelineCalls = 0
    let releaseGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const refresher = createUnifiedDataRefresher({
      officialRefresher: async () => {
        officialCalls += 1
        await gate
        return buildOfficialMarket('fresh')
      },
      pipelineRefresher: async () => {
        pipelineCalls += 1
        await gate
        return { run: buildPipelineRun('success') }
      },
      rankingCacheReader: async () => null,
      resultWriter: skipWritingRefreshResult,
    })

    const first = refresher('2026-06', 'manual')
    const second = refresher('2026-06', 'manual')
    releaseGate()
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(officialCalls).toBe(1)
    expect(pipelineCalls).toBe(1)
    expect(firstResult).toBe(secondResult)
  })
})
