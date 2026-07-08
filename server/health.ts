import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { buildSourceCoverage, readRankingCache, type RankingCacheFile } from './pipeline/cache.ts'
import { cacheDir, dataRoot, getCachePath, importsDir, runsDir } from './pipeline/paths.ts'
import { getOfficialUsedCarCachePath, readOfficialUsedCarCache, type OfficialUsedCarCacheFile } from './official/cache.ts'
import { readLatestDataRefreshHistory } from './dataRefresh.ts'
import type {
  ServiceHealthCacheStatus,
  ServiceHealthRefreshSummary,
  ServiceHealthResponse,
  ServiceReadyPathStatus,
  ServiceReadyResponse,
  UnifiedDataRefreshHistory,
} from '../src/types.ts'

// 定义健康检查可替换依赖。
export interface ServiceHealthOptions {
  month: string
  port: number
  startedAtMs: number
  serviceName?: string
  now?: () => Date
  versionReader?: () => Promise<string>
  officialCachePath?: string
  rankingCachePath?: string
  officialCacheReader?: () => Promise<OfficialUsedCarCacheFile | null>
  rankingCacheReader?: (month: string) => Promise<RankingCacheFile | null>
  refreshHistoryReader?: () => Promise<UnifiedDataRefreshHistory>
}

// 定义就绪检查可替换依赖。
export interface ServiceReadyOptions {
  startedAtMs: number
  distPath: string
  now?: () => Date
  pathExists?: (path: string) => boolean
  dataDirectories?: Array<{ name: string; path: string }>
}

// 定义健康检查默认服务名称。
const defaultServiceName = 'yuezhi-haoche-terminal'

// 读取 package.json 中的服务版本。
export async function readPackageVersion(packagePath = resolve(process.cwd(), 'package.json')) {
  try {
    const packageJson = JSON.parse(await readFile(packagePath, 'utf8')) as { version?: string }
    return packageJson.version ?? '0.0.0'
  } catch {
    return '0.0.0'
  }
}

// 将未知异常转换为健康检查原因。
function formatHealthError(error: unknown) {
  return error instanceof Error ? error.message : '未知错误'
}

// 安全读取健康检查依赖。
async function readHealthDependency<T>(reader: () => Promise<T>, fallback: T) {
  try {
    return { value: await reader(), error: null as string | null }
  } catch (error) {
    return { value: fallback, error: formatHealthError(error) }
  }
}

// 计算服务运行时长秒数。
function getUptimeSeconds(startedAtMs: number, now: Date) {
  return Math.max(0, Math.round((now.getTime() - startedAtMs) / 1000))
}

// 生成官方 CADA 缓存状态摘要。
function buildOfficialCacheStatus(cache: OfficialUsedCarCacheFile | null, cachePath: string): ServiceHealthCacheStatus {
  if (!cache) {
    return { exists: false, path: cachePath }
  }

  return {
    exists: true,
    path: cachePath,
    updatedAt: cache.market.updatedAt,
    cachedAt: cache.cachedAt,
    sourceFetchedAt: cache.sourceFetchedAt,
    latestAvailableMonth: cache.latestAvailableMonth,
    dataMode: cache.market.dataMode,
    dataFreshness: cache.market.dataFreshness,
  }
}

// 生成月度榜单缓存状态摘要。
function buildRankingCacheStatus(cache: RankingCacheFile | null, cachePath: string): ServiceHealthCacheStatus {
  if (!cache) {
    return { exists: false, path: cachePath }
  }

  return {
    exists: true,
    path: cachePath,
    updatedAt: cache.updatedAt,
    dataMode: cache.dataMode,
    itemCount: cache.items.length,
  }
}

// 压缩最近统一刷新记录，避免健康检查返回过大。
function summarizeLatestRefresh(history: UnifiedDataRefreshHistory): ServiceHealthRefreshSummary | null {
  if (!history.latest) {
    return null
  }

  return {
    status: history.latest.status,
    trigger: history.latest.trigger,
    month: history.latest.month,
    startedAt: history.latest.startedAt,
    finishedAt: history.latest.finishedAt,
    message: history.latest.message,
    sourceSummary: history.latest.sourceSummary,
  }
}

// 汇总健康检查降级原因。
function buildHealthReasons(params: {
  officialCache: OfficialUsedCarCacheFile | null
  rankingCache: RankingCacheFile | null
  refreshHistory: UnifiedDataRefreshHistory
  month: string
  officialReadError: string | null
  rankingReadError: string | null
  refreshReadError: string | null
}) {
  const reasons: string[] = []

  if (params.officialReadError) {
    reasons.push(`CADA官方缓存读取失败：${params.officialReadError}`)
  }

  if (!params.officialCache) {
    reasons.push('CADA官方缓存缺失。')
  }

  if (params.rankingReadError) {
    reasons.push(`月度榜单缓存读取失败：${params.rankingReadError}`)
  }

  if (!params.rankingCache) {
    reasons.push(`${params.month} 榜单缓存缺失，将回退示例数据。`)
  }

  if (params.refreshReadError) {
    reasons.push(`统一刷新记录读取失败：${params.refreshReadError}`)
  }

  if (!params.refreshHistory.latest) {
    reasons.push('暂无统一数据刷新记录。')
  } else if (params.refreshHistory.latest.status === 'failed') {
    reasons.push(`最近统一刷新失败：${params.refreshHistory.latest.message}`)
  } else if (params.refreshHistory.latest.status === 'partial') {
    reasons.push(`最近统一刷新为 partial：${params.refreshHistory.latest.message}`)
  }

  return reasons
}

// 构建只读服务健康检查响应。
export async function buildServiceHealth(options: ServiceHealthOptions): Promise<ServiceHealthResponse> {
  const now = options.now?.() ?? new Date()
  const officialCachePath = options.officialCachePath ?? getOfficialUsedCarCachePath()
  const rankingCachePath = options.rankingCachePath ?? getCachePath(options.month)
  const versionReader = options.versionReader ?? readPackageVersion
  const officialCacheReader = options.officialCacheReader ?? (() => readOfficialUsedCarCache(officialCachePath))
  const rankingCacheReader = options.rankingCacheReader ?? readRankingCache
  const refreshHistoryReader = options.refreshHistoryReader ?? readLatestDataRefreshHistory
  const [versionResult, officialResult, rankingResult, refreshResult] = await Promise.all([
    readHealthDependency(versionReader, '0.0.0'),
    readHealthDependency(officialCacheReader, null),
    readHealthDependency(() => rankingCacheReader(options.month), null),
    readHealthDependency(refreshHistoryReader, { latest: null, startup: null, manual: null, scheduled: null }),
  ])
  const reasons = buildHealthReasons({
    officialCache: officialResult.value,
    rankingCache: rankingResult.value,
    refreshHistory: refreshResult.value,
    month: options.month,
    officialReadError: officialResult.error,
    rankingReadError: rankingResult.error,
    refreshReadError: refreshResult.error,
  })
  const fallbackCoverage = buildSourceCoverage({
    updatedAt: now.toISOString(),
    modeNote: '未找到榜单缓存，来源覆盖度来自最近统一刷新或为空。',
  })

  return {
    status: reasons.length > 0 ? 'degraded' : 'ok',
    service: options.serviceName ?? defaultServiceName,
    version: versionResult.value,
    uptimeSeconds: getUptimeSeconds(options.startedAtMs, now),
    checkedAt: now.toISOString(),
    currentMonth: options.month,
    port: options.port,
    officialCache: buildOfficialCacheStatus(officialResult.value, officialCachePath),
    rankingCache: buildRankingCacheStatus(rankingResult.value, rankingCachePath),
    latestRefresh: summarizeLatestRefresh(refreshResult.value),
    sourceCoverage: rankingResult.value?.sourceCoverage ?? refreshResult.value.latest?.sourceCoverage ?? fallbackCoverage,
    reasons,
  }
}

// 生成就绪检查路径状态。
function buildPathStatus(name: string, path: string, pathExists: (path: string) => boolean): ServiceReadyPathStatus {
  return { name, path, exists: pathExists(path) }
}

// 汇总就绪检查失败原因。
function buildReadyReasons(staticAssets: ServiceReadyPathStatus, dataDirectories: ServiceReadyPathStatus[]) {
  const reasons: string[] = []

  if (!staticAssets.exists) {
    reasons.push('前端构建目录 dist 不存在，请先运行 npm run build。')
  }

  for (const directory of dataDirectories) {
    if (!directory.exists) {
      reasons.push(`关键数据目录缺失：${directory.name}`)
    }
  }

  return reasons
}

// 构建轻量就绪检查响应。
export function buildServiceReady(options: ServiceReadyOptions): ServiceReadyResponse {
  const now = options.now?.() ?? new Date()
  const pathExists = options.pathExists ?? existsSync
  const dataDirectories =
    options.dataDirectories ?? [
      { name: 'data', path: dataRoot },
      { name: 'imports', path: importsDir },
      { name: 'cache', path: cacheDir },
      { name: 'runs', path: runsDir },
    ]
  const staticAssets = buildPathStatus('dist', options.distPath, pathExists)
  const directoryStatuses = dataDirectories.map((directory) => buildPathStatus(directory.name, directory.path, pathExists))
  const uptimeSeconds = getUptimeSeconds(options.startedAtMs, now)
  const reasons = buildReadyReasons(staticAssets, directoryStatuses)

  return {
    ready: reasons.length === 0,
    checkedAt: now.toISOString(),
    uptimeSeconds,
    apiProcess: {
      pid: process.pid,
      uptimeSeconds,
    },
    staticAssets,
    dataDirectories: directoryStatuses,
    reasons,
  }
}
