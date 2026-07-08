import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type {
  DataRefreshTrigger,
  OfficialUsedCarMarket,
  PipelineRun,
  SourceCoverage,
  SourceStatus,
  UnifiedDataRefreshHistory,
  UnifiedDataRefreshResponse,
} from '../src/types.ts'
import { defaultRankingQuery } from '../src/lib/rankingEngine.ts'
import { buildOfficialUnavailableMarket } from './official/cada.ts'
import { refreshOfficialUsedCarMarket } from './official/service.ts'
import { buildSourceCoverage, readRankingCache } from './pipeline/cache.ts'
import { ensureDataDirectories, runsDir } from './pipeline/paths.ts'
import { refreshPipeline } from './pipeline/refresh.ts'

// 定义公开观察源刷新结果的最小结构。
type PipelineRefreshResult = Awaited<ReturnType<typeof refreshPipeline>>

// 定义统一刷新器可替换依赖。
interface UnifiedDataRefresherOptions {
  officialRefresher?: (month?: string) => Promise<OfficialUsedCarMarket>
  pipelineRefresher?: (month: string) => Promise<PipelineRefreshResult>
  rankingCacheReader?: typeof readRankingCache
  resultWriter?: (result: UnifiedDataRefreshResponse) => Promise<void>
}

// 生成最近统一刷新记录文件路径。
function getLatestDataRefreshPath(trigger?: DataRefreshTrigger) {
  return resolve(runsDir, trigger ? `latest-data-refresh-${trigger}.json` : 'latest-data-refresh.json')
}

// 将未知异常转换为可展示文案。
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误'
}

// 判断官方大盘结果是否仍可用于展示。
function isOfficialUsable(official: OfficialUsedCarMarket) {
  return official.dataFreshness !== 'unavailable'
}

// 判断官方大盘结果是否为实时数据。
function isOfficialFresh(official: OfficialUsedCarMarket) {
  return official.dataFreshness === 'fresh'
}

// 判断公开观察源管线是否产出了可用结果。
function isPipelineUsable(run: PipelineRun | null) {
  return Boolean(run && run.status !== 'failed')
}

// 根据官方与公开观察源状态合成统一刷新状态。
function resolveUnifiedStatus(official: OfficialUsedCarMarket, run: PipelineRun | null) {
  if (!isOfficialUsable(official) && !isPipelineUsable(run)) {
    return 'failed' as const
  }

  if (isOfficialFresh(official) && run?.status === 'success') {
    return 'success' as const
  }

  return 'partial' as const
}

// 判断单个来源是否需要纳入失败说明。
function isSourceIssue(source: SourceStatus) {
  return source.health !== 'normal'
}

// 汇总公开观察源成功、失败数量和失败原因。
function buildSourceSummary(run: PipelineRun | null) {
  const sources = run?.sources ?? []
  const failureSources = sources.filter(isSourceIssue)

  return {
    sourceCount: sources.length,
    successCount: sources.filter((source) => source.health === 'normal').length,
    failureCount: failureSources.length,
    failureReasons: failureSources.map((source) => `${source.name}：${source.note}`),
  }
}

// 在没有月度缓存时根据管线任务生成覆盖摘要。
function buildCoverageFromRun(run: PipelineRun | null, finishedAt: string): SourceCoverage {
  if (!run) {
    return buildSourceCoverage({
      updatedAt: finishedAt,
      modeNote: '统一刷新未获得公开观察源结果。',
    })
  }

  return buildSourceCoverage({
    sourceCount: run.sources.length,
    availableSourceCount: run.sources.filter((source) => source.health === 'normal').length,
    blockedSourceCount: run.sources.filter((source) => source.health === 'blocked').length,
    sampleCount: run.sources.reduce((total, source) => total + source.sampleCount, 0),
    importedRecordCount: run.dataMode === 'imported' ? run.successCount : 0,
    updatedAt: run.finishedAt,
    modeNote: run.messages.join(' '),
  })
}

// 生成统一刷新完成后的短消息。
function buildRefreshMessage(official: OfficialUsedCarMarket, run: PipelineRun | null, status: UnifiedDataRefreshResponse['status']) {
  const officialText =
    official.dataFreshness === 'fresh'
      ? `CADA实时官方数据 ${official.latestAvailableMonth}`
      : official.dataFreshness === 'cached'
        ? `CADA缓存官方数据 ${official.latestAvailableMonth}`
        : 'CADA官方数据暂不可用'
  const pipelineText = run ? `公开观察源 ${run.status}` : '公开观察源未产出任务'
  return `统一刷新${status === 'failed' ? '失败' : '完成'}：${officialText}；${pipelineText}。`
}

// 从 allSettled 结果中提取官方大盘或生成不可用状态。
function resolveOfficialResult(result: PromiseSettledResult<OfficialUsedCarMarket>, finishedAt: string) {
  if (result.status === 'fulfilled') {
    return result.value
  }

  return buildOfficialUnavailableMarket(`CADA官方刷新失败：${getErrorMessage(result.reason)}`, finishedAt)
}

// 从 allSettled 结果中提取管线任务。
function resolvePipelineRun(result: PromiseSettledResult<PipelineRefreshResult>) {
  if (result.status === 'fulfilled') {
    return result.value.run
  }

  return null
}

// 执行一次官方和公开观察源的统一刷新。
async function runUnifiedDataRefresh(month: string, trigger: DataRefreshTrigger, options: UnifiedDataRefresherOptions) {
  const startedAt = new Date().toISOString()
  const officialRefresher = options.officialRefresher ?? refreshOfficialUsedCarMarket
  const pipelineRefresher = options.pipelineRefresher ?? refreshPipeline
  const rankingCacheReader = options.rankingCacheReader ?? readRankingCache
  const resultWriter = options.resultWriter ?? writeLatestDataRefreshResult
  const refreshTasks = [officialRefresher('latest'), pipelineRefresher(month)] as const
  const [officialResult, pipelineResult] = await Promise.allSettled(refreshTasks)
  const finishedAt = new Date().toISOString()
  const official = resolveOfficialResult(officialResult, finishedAt)
  const pipelineRun = resolvePipelineRun(pipelineResult)
  const cache = await rankingCacheReader(month).catch(() => null)
  const sourceCoverage = cache?.sourceCoverage ?? buildCoverageFromRun(pipelineRun, finishedAt)
  const sourceSummary = buildSourceSummary(pipelineRun)
  const status = resolveUnifiedStatus(official, pipelineRun)
  const result: UnifiedDataRefreshResponse = {
    status,
    trigger,
    month,
    startedAt,
    finishedAt,
    official,
    pipelineRun,
    sourceCoverage,
    sourceSummary,
    message: buildRefreshMessage(official, pipelineRun, status),
  }

  await resultWriter(result)
  return result
}

// 创建带并发保护的统一刷新函数。
export function createUnifiedDataRefresher(options: UnifiedDataRefresherOptions = {}) {
  let activeRefresh: Promise<UnifiedDataRefreshResponse> | null = null

  return function refreshUnifiedDataWithLock(month = defaultRankingQuery.month, trigger: DataRefreshTrigger = 'manual') {
    if (activeRefresh) {
      return activeRefresh
    }

    activeRefresh = runUnifiedDataRefresh(month, trigger, options).finally(() => {
      activeRefresh = null
    })
    return activeRefresh
  }
}

// 写入最近统一刷新记录和按触发方式拆分的索引。
export async function writeLatestDataRefreshResult(result: UnifiedDataRefreshResponse) {
  await ensureDataDirectories()
  const content = `${JSON.stringify(result, null, 2)}\n`
  await Promise.all([writeFile(getLatestDataRefreshPath(), content, 'utf8'), writeFile(getLatestDataRefreshPath(result.trigger), content, 'utf8')])
}

// 读取单个最近统一刷新记录。
async function readDataRefreshResult(path: string) {
  if (!existsSync(path)) {
    return null
  }

  return JSON.parse(await readFile(path, 'utf8')) as UnifiedDataRefreshResponse
}

// 读取最近统一刷新历史。
export async function readLatestDataRefreshHistory(): Promise<UnifiedDataRefreshHistory> {
  const [latest, startup, manual, scheduled] = await Promise.all([
    readDataRefreshResult(getLatestDataRefreshPath()),
    readDataRefreshResult(getLatestDataRefreshPath('startup')),
    readDataRefreshResult(getLatestDataRefreshPath('manual')),
    readDataRefreshResult(getLatestDataRefreshPath('scheduled')),
  ])

  return { latest, startup, manual, scheduled }
}

// 导出默认统一刷新函数供 API 和启动任务复用。
export const refreshUnifiedData = createUnifiedDataRefresher()
