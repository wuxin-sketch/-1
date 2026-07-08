import { readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import type { DataMode, PipelineRun, SourceCoverage, VehicleRankItem } from '../../src/types.ts'
import { cacheDir, ensureDataDirectories, getCachePath, getLatestRunPath, getRunPath } from './paths.ts'

// 定义缓存文件的结构。
export interface RankingCacheFile {
  month: string
  dataMode: DataMode
  items: VehicleRankItem[]
  updatedAt: string
  sourceCoverage: SourceCoverage
  pipelineRunId?: string
}

// 构建默认来源覆盖度摘要。
export function buildSourceCoverage(params: Partial<SourceCoverage> = {}): SourceCoverage {
  return {
    sourceCount: params.sourceCount ?? 0,
    availableSourceCount: params.availableSourceCount ?? 0,
    blockedSourceCount: params.blockedSourceCount ?? 0,
    sampleCount: params.sampleCount ?? 0,
    importedRecordCount: params.importedRecordCount ?? 0,
    updatedAt: params.updatedAt ?? new Date().toISOString(),
    modeNote: params.modeNote ?? '暂无真实缓存，当前使用示例数据。',
  }
}

// 读取指定月份的榜单缓存。
export async function readRankingCache(month: string) {
  const cachePath = getCachePath(month)
  if (!existsSync(cachePath)) {
    return null
  }

  return JSON.parse(await readFile(cachePath, 'utf8')) as RankingCacheFile
}

// 列出当前数据目录下已有的月度榜单缓存。
export async function listRankingCacheSummaries() {
  await ensureDataDirectories()
  const entries = await readdir(cacheDir, { withFileTypes: true })
  const monthFiles = entries.filter((entry) => entry.isFile() && /^\d{4}-\d{2}\.json$/.test(entry.name))
  const caches = await Promise.all(
    monthFiles.map(async (entry) => {
      const month = entry.name.replace(/\.json$/, '')
      const cache = await readRankingCache(month)
      return cache ? [{ month: cache.month, dataMode: cache.dataMode }] : []
    }),
  )

  return caches.flat()
}

// 写入指定月份的榜单缓存。
export async function writeRankingCache(cache: RankingCacheFile) {
  await ensureDataDirectories()
  const cachePath = getCachePath(cache.month)
  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  return cachePath
}

// 写入一次管线运行记录并更新最新索引。
export async function writePipelineRun(run: PipelineRun) {
  await ensureDataDirectories()
  const runPath = getRunPath(run.id)
  await writeFile(runPath, `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  await writeFile(getLatestRunPath(), `${JSON.stringify(run, null, 2)}\n`, 'utf8')
  return runPath
}

// 读取最近一次管线运行记录。
export async function readLatestPipelineRun() {
  const latestPath = getLatestRunPath()
  if (!existsSync(latestPath)) {
    return null
  }

  return JSON.parse(await readFile(latestPath, 'utf8')) as PipelineRun
}

// 生成缓存目录路径，供 CLI 输出使用。
export function getCacheDirectory() {
  return cacheDir
}
