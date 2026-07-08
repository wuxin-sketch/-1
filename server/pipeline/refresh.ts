import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PipelineRun } from '../../src/types.ts'
import { collectLiveSourceData } from '../sources/collector.ts'
import { buildSourceCoverage, writePipelineRun, writeRankingCache } from './cache.ts'
import { getDefaultCsvImportPath, getDefaultJsonImportPath } from './paths.ts'
import { importDataFile } from './importer.ts'
import { vehicleSeed } from '../../src/data/vehicles.ts'
import { defaultRankingQuery } from '../../src/lib/rankingEngine.ts'

// 读取命令行参数值。
function readArg(name: string) {
  const prefix = `--${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length)
  }

  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// 根据抓取快照更新车型热度信号。
function mergeSnapshotsIntoSeed(snapshotCounts: Map<string, number>) {
  return vehicleSeed.map((vehicle) => {
    const count = snapshotCounts.get(vehicle.id)
    if (!count) {
      return vehicle
    }

    return {
      ...vehicle,
      heatIndex: Math.min(100, Math.round(vehicle.heatIndex + count / 10)),
      sourceConfidence: Math.min(100, vehicle.sourceConfidence + 4),
      sampleSize: vehicle.sampleSize + count,
      sources: Array.from(new Set([...vehicle.sources, '公开自动抓取'])),
      updatedAt: new Date().toISOString(),
    }
  })
}

// 生成公开源抓取任务的来源覆盖摘要。
function buildLiveSourceCoverage(liveData: Awaited<ReturnType<typeof collectLiveSourceData>>, finishedAt: string) {
  const availableSourceCount = liveData.statuses.filter((source) => source.health === 'normal').length
  const blockedSourceCount = liveData.statuses.filter((source) => source.health === 'blocked').length

  return buildSourceCoverage({
    sourceCount: liveData.statuses.length,
    availableSourceCount,
    blockedSourceCount,
    sampleCount: liveData.snapshots.reduce((total, item) => total + item.listingCount, 0),
    importedRecordCount: 0,
    updatedAt: finishedAt,
    modeNote: `公开源自动抓取到 ${liveData.snapshots.length} 个车型观察信号；公开观察热度不等同 CADA 官方销量。`,
  })
}

// 使用公开源抓取结果写入 live 缓存。
async function writeLiveCache(month: string) {
  const startedAt = new Date().toISOString()
  const liveData = await collectLiveSourceData()
  const snapshotCounts = new Map<string, number>()

  for (const snapshot of liveData.snapshots) {
    snapshotCounts.set(snapshot.modelId, (snapshotCounts.get(snapshot.modelId) ?? 0) + snapshot.listingCount)
  }

  if (liveData.snapshots.length === 0) {
    return { liveData, result: null }
  }

  const finishedAt = new Date().toISOString()
  const runId = `${month}-live-${Date.now()}`
  const sourceCoverage = buildLiveSourceCoverage(liveData, finishedAt)
  const cacheFile = await writeRankingCache({
    month,
    dataMode: 'live',
    items: mergeSnapshotsIntoSeed(snapshotCounts),
    updatedAt: finishedAt,
    sourceCoverage,
    pipelineRunId: runId,
  })
  const run: PipelineRun = {
    id: runId,
    month,
    dataMode: 'live',
    status: liveData.statuses.some((source) => source.health !== 'normal') ? 'partial' : 'success',
    startedAt,
    finishedAt,
    sources: liveData.statuses,
    cacheFile,
    successCount: liveData.snapshots.length,
    failureCount: liveData.statuses.filter((source) => source.health === 'blocked' || source.health === 'offline').length,
    messages: ['公开源自动抓取完成，已写入 live 缓存。'],
  }

  await writePipelineRun(run)
  return { liveData, result: { cacheFile, run } }
}

// 在公开源不可用时查找默认导入文件。
function findDefaultImportFile(month: string) {
  const csvPath = getDefaultCsvImportPath(month)
  if (existsSync(csvPath)) {
    return csvPath
  }

  const jsonPath = getDefaultJsonImportPath(month)
  return existsSync(jsonPath) ? jsonPath : null
}

// 写入没有可用数据时的失败运行记录。
async function writeFailedRefreshRun(month: string, messages: string[], sources: PipelineRun['sources'] = []) {
  const now = new Date().toISOString()
  const run: PipelineRun = {
    id: `${month}-refresh-${Date.now()}`,
    month,
    dataMode: 'sample',
    status: 'failed',
    startedAt: now,
    finishedAt: now,
    sources,
    successCount: 0,
    failureCount: Math.max(1, sources.filter((source) => source.health === 'blocked' || source.health === 'offline').length),
    messages,
  }

  await writePipelineRun(run)
  return run
}

// 刷新指定月份的数据缓存。
export async function refreshPipeline(month: string) {
  const liveAttempt = await writeLiveCache(month)
  if (liveAttempt.result) {
    return liveAttempt.result
  }

  const importFile = findDefaultImportFile(month)
  if (importFile) {
    return importDataFile({ month, file: importFile })
  }

  const run = await writeFailedRefreshRun(month, ['公开源可访问性或车型信号不足，且未找到默认导入文件。'], liveAttempt.liveData.statuses)
  return { run }
}

// 运行数据刷新命令。
async function runRefreshCli() {
  const month = readArg('month') ?? defaultRankingQuery.month
  const result = await refreshPipeline(month)
  console.log(JSON.stringify(result, null, 2))
}

// 在直接执行脚本时启动刷新命令。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runRefreshCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
