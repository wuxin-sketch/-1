import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import type { ImportCommitResponse, ImportPreviewResponse, RawVehicleRecord } from '../../src/types.ts'
import { parseRawVehicleRecordsContent, importDataFile } from './importer.ts'
import { normalizeRawRecords } from './normalizer.ts'
import { ensureDataDirectories, importsDir, isValidPipelineMonth } from './paths.ts'

// 定义导入预览请求的最小结构。
export interface ImportPreviewRequest {
  month: string
  fileName: string
  content: string
}

// 定义内存中暂存的导入预览。
interface StoredImportPreview {
  previewId: string
  month: string
  fileName: string
  content: string
  createdAt: string
  expiresAt: string
}

// 定义导入预览的默认有效期。
export const importPreviewTtlMs = 30 * 60 * 1000

// 定义单个导入预览允许保留的最大字节数。
export const importPreviewMaxContentBytes = Number(process.env.YUEZHI_IMPORT_PREVIEW_MAX_BYTES ?? 4 * 1024 * 1024)

// 定义内存中允许同时保留的最大导入预览数量。
export const importPreviewMaxCount = Number(process.env.YUEZHI_IMPORT_PREVIEW_MAX_COUNT ?? 20)

// 定义内存中允许保留的导入预览总字节数。
export const importPreviewMaxTotalBytes = Number(process.env.YUEZHI_IMPORT_PREVIEW_MAX_TOTAL_BYTES ?? 16 * 1024 * 1024)

// 保存待确认的导入预览。
const importPreviewStore = new Map<string, StoredImportPreview>()

// 判断月份格式是否为 YYYY-MM。
// 计算字符串以 UTF-8 保存时占用的字节数。
function getContentByteLength(content: string) {
  return Buffer.byteLength(content, 'utf8')
}

// 统计当前导入预览缓存保留的总字节数。
function getImportPreviewStoreBytes() {
  return Array.from(importPreviewStore.values()).reduce((total, preview) => total + getContentByteLength(preview.content), 0)
}

// 判断新的导入预览是否会超过内存保留上限。
function getImportPreviewCapacityError(content: string) {
  const contentBytes = getContentByteLength(content)
  if (contentBytes > importPreviewMaxContentBytes) {
    return `导入预览文件不能超过 ${Math.floor(importPreviewMaxContentBytes / 1024 / 1024)}MB。`
  }

  if (importPreviewStore.size >= importPreviewMaxCount) {
    return '待确认导入预览过多，请先确认或等待过期后再上传。'
  }

  if (getImportPreviewStoreBytes() + contentBytes > importPreviewMaxTotalBytes) {
    return '导入预览缓存已接近上限，请先确认或等待过期后再上传。'
  }

  return null
}

// 清空导入预览缓存，供回归测试隔离状态。
export function clearImportPreviewStoreForTests() {
  importPreviewStore.clear()
}

// 判断文件名是否为支持的导入格式。
function isSupportedFileName(fileName: string) {
  return ['.csv', '.json'].includes(extname(fileName).toLowerCase())
}

// 清理文件名中不适合落盘的字符。
function sanitizeFileName(fileName: string) {
  const cleaned = basename(fileName).replace(/[^\w.-]+/g, '-')
  return cleaned || 'import.csv'
}

// 生成导入归档文件路径。
function buildArchivedImportPath(month: string, fileName: string, createdAt: string) {
  const timestamp = createdAt.replace(/[^\d]/g, '').slice(0, 14)
  return resolve(importsDir, `${month}-${timestamp}-${sanitizeFileName(fileName)}`)
}

// 判断单条原始记录缺失了哪些关键字段。
function getMissingFieldLabels(record: RawVehicleRecord) {
  const requiredFields: Array<[keyof RawVehicleRecord, string]> = [
    ['modelId', '车型ID'],
    ['brand', '品牌'],
    ['model', '车型'],
    ['priceMin', '最低价'],
    ['priceMax', '最高价'],
    ['heatIndex', '热度指数'],
    ['retentionRate', '保值率'],
    ['sampleSize', '样本量'],
  ]

  return requiredFields
    .filter(([field]) => record[field] === undefined || record[field] === '')
    .map(([, label]) => label)
}

// 根据原始记录生成导入预览警告。
function buildImportWarnings(records: RawVehicleRecord[]) {
  return records.flatMap((record, index) => {
    const missingLabels = getMissingFieldLabels(record)
    if (missingLabels.length === 0) {
      return []
    }

    const modelLabel = record.modelId || record.model || `第 ${index + 1} 行`
    return [`${modelLabel} 缺少 ${missingLabels.join('、')}，将使用默认值或降低置信度。`]
  })
}

// 清理已经过期的预览缓存。
export function purgeExpiredImportPreviews(now = new Date()) {
  for (const [previewId, preview] of importPreviewStore) {
    if (Date.parse(preview.expiresAt) <= now.getTime()) {
      importPreviewStore.delete(previewId)
    }
  }
}

// 创建真实数据导入预览。
export function previewImportData(request: ImportPreviewRequest, now = new Date()): ImportPreviewResponse {
  purgeExpiredImportPreviews(now)

  const month = String(request.month ?? '')
  const fileName = String(request.fileName ?? '')
  const content = String(request.content ?? '')
  const errors: string[] = []

  if (!isValidPipelineMonth(month)) {
    errors.push('月份必须使用 YYYY-MM 格式。')
  }

  if (!isSupportedFileName(fileName)) {
    errors.push('仅支持 CSV 或 JSON 文件。')
  }

  if (!content.trim()) {
    errors.push('导入文件内容不能为空。')
  }

  const capacityError = getImportPreviewCapacityError(content)
  if (capacityError) {
    errors.push(capacityError)
  }

  if (errors.length > 0) {
    return { previewId: null, month, fileName, recordCount: 0, validRecordCount: 0, warnings: [], errors, previewItems: [] }
  }

  try {
    const rawRecords = parseRawVehicleRecordsContent(fileName, content)
    const normalizedRecords = normalizeRawRecords(rawRecords, sanitizeFileName(fileName))
    const warnings = buildImportWarnings(rawRecords)
    const parseErrors = rawRecords.length > 0 ? [] : ['导入文件没有可用车型记录。']

    if (parseErrors.length > 0) {
      return { previewId: null, month, fileName, recordCount: rawRecords.length, validRecordCount: 0, warnings, errors: parseErrors, previewItems: [] }
    }

    const previewId = randomUUID()
    const expiresAt = new Date(now.getTime() + importPreviewTtlMs).toISOString()
    importPreviewStore.set(previewId, {
      previewId,
      month,
      fileName: sanitizeFileName(fileName),
      content,
      createdAt: now.toISOString(),
      expiresAt,
    })

    return {
      previewId,
      month,
      fileName: sanitizeFileName(fileName),
      recordCount: rawRecords.length,
      validRecordCount: normalizedRecords.length,
      warnings,
      errors: [],
      previewItems: normalizedRecords.slice(0, 10),
      expiresAt,
    }
  } catch (error) {
    return {
      previewId: null,
      month,
      fileName,
      recordCount: 0,
      validRecordCount: 0,
      warnings: [],
      errors: [error instanceof Error ? error.message : '导入文件解析失败。'],
      previewItems: [],
    }
  }
}

// 确认导入预览并写入月度缓存。
export async function commitImportPreview(previewId: string, now = new Date()): Promise<ImportCommitResponse> {
  purgeExpiredImportPreviews(now)

  const preview = importPreviewStore.get(previewId)
  if (!preview) {
    throw new Error('导入预览已过期或不存在，请重新上传预览。')
  }

  await ensureDataDirectories()
  const importedFile = buildArchivedImportPath(preview.month, preview.fileName, now.toISOString())
  await writeFile(importedFile, preview.content, 'utf8')

  const result = await importDataFile({ month: preview.month, file: importedFile })
  importPreviewStore.delete(previewId)

  return {
    month: preview.month,
    cacheFile: result.cacheFile,
    importedFile,
    run: result.run,
  }
}
