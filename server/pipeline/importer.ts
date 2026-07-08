import { readFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import type { PipelineRun, RawVehicleRecord } from '../../src/types.ts'
import { parseVehicleCsv } from './csv.ts'
import { buildSourceCoverage, writePipelineRun, writeRankingCache } from './cache.ts'
import { normalizeRawRecords } from './normalizer.ts'

interface ImportDataOptions {
  month: string
  file: string
}

// 根据文件扩展名解析导入内容。
export function parseRawVehicleRecordsContent(fileName: string, content: string) {
  const extension = extname(fileName).toLowerCase()

  if (extension === '.json') {
    const parsed = JSON.parse(content) as RawVehicleRecord[] | { records: RawVehicleRecord[] }
    const records = Array.isArray(parsed) ? parsed : parsed.records
    return Array.isArray(records) ? records : []
  }

  if (extension === '.csv') {
    return parseVehicleCsv(content)
  }

  throw new Error('仅支持 CSV 或 JSON 文件。')
}

// 根据文件扩展名解析导入记录。
export async function readRawVehicleRecords(file: string) {
  const content = await readFile(file, 'utf8')
  return parseRawVehicleRecordsContent(file, content)
}

// 创建管线运行 ID。
function createRunId(month: string, mode: string) {
  return `${month}-${mode}-${Date.now()}`
}

// 将 CSV 或 JSON 文件导入为月度缓存。
export async function importDataFile(options: ImportDataOptions) {
  const startedAt = new Date().toISOString()
  const absoluteFile = resolve(options.file)
  const rawRecords = await readRawVehicleRecords(absoluteFile)
  const normalizedRecords = normalizeRawRecords(rawRecords, basename(absoluteFile))
  const runId = createRunId(options.month, 'import')
  const finishedAt = new Date().toISOString()
  const sourceNames = Array.from(new Set(normalizedRecords.flatMap((item) => item.sources)))
  const sourceCoverage = buildSourceCoverage({
    sourceCount: sourceNames.length,
    availableSourceCount: sourceNames.length,
    blockedSourceCount: 0,
    sampleCount: normalizedRecords.reduce((total, item) => total + item.sampleSize, 0),
    importedRecordCount: normalizedRecords.length,
    updatedAt: finishedAt,
    modeNote: `已从 ${basename(absoluteFile)} 导入 ${normalizedRecords.length} 条车型记录。`,
  })
  const cacheFile = await writeRankingCache({
    month: options.month,
    dataMode: 'imported',
    items: normalizedRecords,
    updatedAt: finishedAt,
    sourceCoverage,
    pipelineRunId: runId,
  })
  const run: PipelineRun = {
    id: runId,
    month: options.month,
    dataMode: 'imported',
    status: normalizedRecords.length > 0 ? 'success' : 'failed',
    startedAt,
    finishedAt,
    sources: [],
    importedFile: absoluteFile,
    cacheFile,
    successCount: normalizedRecords.length,
    failureCount: rawRecords.length - normalizedRecords.length,
    messages: normalizedRecords.length > 0 ? [`导入成功：${basename(absoluteFile)}`] : ['导入文件没有可用车型记录。'],
  }

  await writePipelineRun(run)
  return { cacheFile, run, records: normalizedRecords }
}
