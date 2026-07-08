import type { DataRefreshStatusResponse, DataRefreshTrigger, UnifiedDataRefreshResponse } from '../src/types.ts'
import { buildDefaultRankingQuery } from '../src/lib/rankingEngine.ts'
import { readLatestDataRefreshHistory, refreshUnifiedData } from './dataRefresh.ts'

// 定义自动刷新调度器使用的定时器句柄。
type RefreshTimer = ReturnType<typeof setTimeout>

// 定义自动刷新调度器的可替换依赖。
export interface DataRefreshSchedulerOptions {
  enabled?: boolean
  intervalMs?: number
  now?: () => Date
  targetMonthResolver?: () => string
  refresher?: (month: string, trigger: DataRefreshTrigger) => Promise<UnifiedDataRefreshResponse>
  historyReader?: typeof readLatestDataRefreshHistory
  setTimer?: typeof setTimeout
  clearTimer?: typeof clearTimeout
  onResult?: (result: UnifiedDataRefreshResponse) => void
  onError?: (error: unknown) => void
}

// 定义默认自动刷新间隔为 24 小时。
export const defaultRefreshIntervalMs = 24 * 60 * 60 * 1000

// 从环境变量读取自动刷新间隔。
export function readRefreshIntervalMs(env: NodeJS.ProcessEnv = process.env) {
  const parsed = Number(env.YUEZHI_REFRESH_INTERVAL_MS)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRefreshIntervalMs
}

// 从环境变量判断自动刷新是否开启。
export function readRefreshSchedulerEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.YUEZHI_AUTO_REFRESH !== '0' && env.YUEZHI_REFRESH_SCHEDULER !== '0'
}

// 创建带启动刷新和定时刷新的数据调度器。
export function createDataRefreshScheduler(options: DataRefreshSchedulerOptions = {}) {
  const enabled = options.enabled ?? readRefreshSchedulerEnabled()
  const intervalMs = options.intervalMs ?? readRefreshIntervalMs()
  const now = options.now ?? (() => new Date())
  const resolveTargetMonth = options.targetMonthResolver ?? (() => buildDefaultRankingQuery(now()).month)
  const refresher = options.refresher ?? refreshUnifiedData
  const historyReader = options.historyReader ?? readLatestDataRefreshHistory
  const setTimer = options.setTimer ?? setTimeout
  const clearTimer = options.clearTimer ?? clearTimeout
  let started = false
  let activeRefresh: Promise<UnifiedDataRefreshResponse> | null = null
  let timer: RefreshTimer | null = null
  let nextRunAt: string | null = null

  // 清理当前定时器并重置下一次运行时间。
  function clearScheduledTimer() {
    if (timer) {
      clearTimer(timer)
    }

    timer = null
    nextRunAt = null
  }

  // 安排下一次 scheduled 自动刷新。
  function scheduleNextRefresh() {
    clearScheduledTimer()

    if (!enabled || !started) {
      return
    }

    const nextDate = new Date(now().getTime() + intervalMs)
    nextRunAt = nextDate.toISOString()
    timer = setTimer(() => {
      void runRefresh('scheduled')
    }, intervalMs)

    if (typeof timer === 'object' && typeof timer.unref === 'function') {
      timer.unref()
    }
  }

  // 执行一次带并发保护的数据刷新。
  function runRefresh(trigger: DataRefreshTrigger) {
    if (!enabled) {
      return null
    }

    if (activeRefresh) {
      return activeRefresh
    }

    activeRefresh = refresher(resolveTargetMonth(), trigger)
      .then((result) => {
        options.onResult?.(result)
        return result
      })
      .catch((error: unknown) => {
        options.onError?.(error)
        throw error
      })
      .finally(() => {
        activeRefresh = null
        scheduleNextRefresh()
      })

    return activeRefresh
  }

  // 启动调度器并立即触发一次 startup 刷新。
  function start() {
    if (!enabled) {
      return null
    }

    if (started) {
      return activeRefresh
    }

    started = true
    return runRefresh('startup')
  }

  // 停止调度器并清理后续定时任务。
  function stop() {
    started = false
    clearScheduledTimer()
  }

  // 手动触发一次指定类型刷新，供测试和内部复用。
  function refreshNow(trigger: DataRefreshTrigger = 'manual') {
    return runRefresh(trigger)
  }

  // 读取调度器和最近刷新历史的组合状态。
  async function getStatus(): Promise<DataRefreshStatusResponse> {
    return {
      scheduler: {
        enabled,
        started,
        isRunning: Boolean(activeRefresh),
        intervalMs,
        targetMonth: resolveTargetMonth(),
        nextRunAt,
      },
      history: await historyReader(),
    }
  }

  return {
    start,
    stop,
    refreshNow,
    getStatus,
  }
}
