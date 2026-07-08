import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDataRefreshScheduler, defaultRefreshIntervalMs, readRefreshIntervalMs } from '../server/dataRefreshScheduler'
import type {
  DataRefreshTrigger,
  OfficialUsedCarMarket,
  SourceCoverage,
  UnifiedDataRefreshHistory,
  UnifiedDataRefreshResponse,
} from '../src/types'

// 构建调度器测试使用的固定官方大盘。
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
    updatedAt: '2026-07-07T00:00:00.000Z',
  }
}

// 构建调度器测试使用的来源覆盖度。
function buildSourceCoverage(): SourceCoverage {
  return {
    sourceCount: 1,
    availableSourceCount: 1,
    blockedSourceCount: 0,
    sampleCount: 10,
    importedRecordCount: 0,
    updatedAt: '2026-07-07T00:00:00.000Z',
    modeNote: '测试刷新覆盖度。',
  }
}

// 构建调度器测试使用的统一刷新结果。
function buildRefreshResult(month: string, trigger: DataRefreshTrigger): UnifiedDataRefreshResponse {
  return {
    status: 'success',
    trigger,
    month,
    startedAt: '2026-07-07T00:00:00.000Z',
    finishedAt: '2026-07-07T00:00:01.000Z',
    official: buildOfficialMarket(),
    pipelineRun: null,
    sourceCoverage: buildSourceCoverage(),
    sourceSummary: {
      sourceCount: 1,
      successCount: 1,
      failureCount: 0,
      failureReasons: [],
    },
    message: `${trigger} refresh complete`,
  }
}

// 构建调度器测试使用的刷新历史。
function buildRefreshHistory(scheduled: UnifiedDataRefreshResponse | null = null): UnifiedDataRefreshHistory {
  return {
    latest: scheduled,
    startup: null,
    manual: null,
    scheduled,
  }
}

// 验证数据刷新调度器。
describe('data refresh scheduler', () => {
  // 启用假的定时器以稳定推进 scheduled 任务。
  beforeEach(() => {
    vi.useFakeTimers()
  })

  // 恢复真实定时器避免影响其他测试。
  afterEach(() => {
    vi.useRealTimers()
  })

  // 验证默认刷新间隔为 24 小时并支持环境变量覆盖。
  it('reads the refresh interval from environment variables', () => {
    expect(readRefreshIntervalMs({})).toBe(defaultRefreshIntervalMs)
    expect(readRefreshIntervalMs({ YUEZHI_REFRESH_INTERVAL_MS: '1000' })).toBe(1000)
  })

  // 验证启动刷新后会安排并执行 scheduled 刷新。
  it('runs startup refresh and then scheduled refresh for the current month', async () => {
    const calls: Array<{ month: string; trigger: DataRefreshTrigger }> = []
    const scheduler = createDataRefreshScheduler({
      enabled: true,
      intervalMs: 1000,
      now: () => new Date('2026-07-07T00:00:00.000Z'),
      targetMonthResolver: () => '2026-07',
      refresher: async (month, trigger) => {
        calls.push({ month, trigger })
        return buildRefreshResult(month, trigger)
      },
      historyReader: async () => buildRefreshHistory(buildRefreshResult('2026-07', 'scheduled')),
    })

    const startup = scheduler.start()
    expect(startup).not.toBeNull()
    await startup

    const statusAfterStartup = await scheduler.getStatus()
    expect(statusAfterStartup.scheduler.targetMonth).toBe('2026-07')
    expect(statusAfterStartup.scheduler.nextRunAt).toBe('2026-07-07T00:00:01.000Z')

    await vi.advanceTimersByTimeAsync(1000)

    expect(calls).toEqual([
      { month: '2026-07', trigger: 'startup' },
      { month: '2026-07', trigger: 'scheduled' },
    ])
    expect((await scheduler.getStatus()).history.scheduled?.trigger).toBe('scheduled')

    scheduler.stop()
  })

  // 验证重复启动不会产生并发重复刷新。
  it('reuses the active refresh when start is called repeatedly', async () => {
    let callCount = 0
    let releaseGate: () => void = () => undefined
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve
    })
    const scheduler = createDataRefreshScheduler({
      enabled: true,
      intervalMs: 1000,
      targetMonthResolver: () => '2026-07',
      refresher: async (month, trigger) => {
        callCount += 1
        await gate
        return buildRefreshResult(month, trigger)
      },
      historyReader: async () => buildRefreshHistory(),
    })

    const first = scheduler.start()
    const second = scheduler.start()
    expect(second).toBe(first)

    releaseGate()
    await Promise.all([first, second])

    expect(callCount).toBe(1)
    scheduler.stop()
  })
})
