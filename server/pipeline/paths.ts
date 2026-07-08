import { mkdir } from 'node:fs/promises'
import { isAbsolute, relative, resolve } from 'node:path'

// 定义项目数据根目录。
export const dataRoot = resolve(process.cwd(), 'data')

// 定义月度导入文件目录。
export const importsDir = resolve(dataRoot, 'imports')

// 定义月度缓存文件目录。
export const cacheDir = resolve(dataRoot, 'cache')

// 定义管线运行记录目录。
export const runsDir = resolve(dataRoot, 'runs')

// 校验月份是否为可落盘的 YYYY-MM 格式。
export function isValidPipelineMonth(month: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)
}

// 在月份格式不安全时中止后续路径拼接。
export function assertValidPipelineMonth(month: string) {
  if (!isValidPipelineMonth(month)) {
    throw new Error('月份必须使用 YYYY-MM 格式。')
  }
}

// 校验运行记录 ID 是否为单个安全文件名片段。
function assertSafeFileStem(value: string, label: string) {
  if (!/^[A-Za-z0-9._-]+$/.test(value) || value.includes('..')) {
    throw new Error(`${label} 只能包含字母、数字、点、下划线和连字符。`)
  }
}

// 安全解析目录内文件路径，防止跳出目标目录。
function resolveInsideDirectory(directory: string, fileName: string) {
  const targetPath = resolve(directory, fileName)
  const relativePath = relative(directory, targetPath)
  if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
    throw new Error('文件路径超出允许的数据目录。')
  }

  return targetPath
}

// 确保数据管线目录存在。
export async function ensureDataDirectories() {
  await Promise.all([mkdir(importsDir, { recursive: true }), mkdir(cacheDir, { recursive: true }), mkdir(runsDir, { recursive: true })])
}

// 生成指定月份的缓存文件路径。
export function getCachePath(month: string) {
  assertValidPipelineMonth(month)
  return resolveInsideDirectory(cacheDir, `${month}.json`)
}

// 生成指定管线任务的运行记录路径。
export function getRunPath(runId: string) {
  assertSafeFileStem(runId, '运行记录 ID')
  return resolveInsideDirectory(runsDir, `${runId}.json`)
}

// 生成最近一次管线任务的索引路径。
export function getLatestRunPath() {
  return resolve(runsDir, 'latest.json')
}

// 生成月份默认 CSV 导入路径。
export function getDefaultCsvImportPath(month: string) {
  assertValidPipelineMonth(month)
  return resolveInsideDirectory(importsDir, `${month}.csv`)
}

// 生成月份默认 JSON 导入路径。
export function getDefaultJsonImportPath(month: string) {
  assertValidPipelineMonth(month)
  return resolveInsideDirectory(importsDir, `${month}.json`)
}
