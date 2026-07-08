import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { sourceStatuses } from '../../src/data/vehicles.ts'
import type { SourceSnapshot, SourceStatus } from '../../src/types.ts'
import { sourceAdapters } from './adapters.ts'

// 定位当前模块所在目录。
const currentDir = dirname(fileURLToPath(import.meta.url))

// 读取公开源 fixture HTML。
export async function readFixtureHtml(sourceId: string) {
  return readFile(resolve(currentDir, '..', 'fixtures', `${sourceId}.html`), 'utf8')
}

// 基于 fixture 采集来源状态，便于本地稳定开发。
export async function collectFixtureSourceStatuses() {
  const statuses: SourceStatus[] = []

  for (const adapter of sourceAdapters) {
    const html = await readFixtureHtml(adapter.id)
    statuses.push(adapter.validate(html))
  }

  return statuses
}

// 基于 fixture 采集来源状态和车型快照。
export async function collectFixtureSourceData() {
  const statuses: SourceStatus[] = []
  const snapshots: SourceSnapshot[] = []

  for (const adapter of sourceAdapters) {
    const html = await readFixtureHtml(adapter.id)
    statuses.push(adapter.validate(html))
    snapshots.push(...adapter.normalize(html))
  }

  return { statuses, snapshots }
}

// 基于真实公开源采集来源状态，遇到限制时降级标记。
export async function collectLiveSourceStatuses() {
  const statuses: SourceStatus[] = []

  for (const adapter of sourceAdapters) {
    try {
      const html = await adapter.fetch()
      statuses.push(adapter.validate(html))
    } catch (error) {
      statuses.push({
        id: adapter.id,
        name: adapter.name,
        url: adapter.url,
        health: 'blocked',
        freshness: '不可用',
        lastSync: new Date().toISOString(),
        sampleCount: 0,
        note: `公开源请求受限或页面不可用，未进行绕过：${getErrorMessage(error)}`,
      })
    }
  }

  return statuses
}

// 基于真实公开源采集来源状态和车型快照。
export async function collectLiveSourceData() {
  const statuses: SourceStatus[] = []
  const snapshots: SourceSnapshot[] = []

  for (const adapter of sourceAdapters) {
    try {
      const html = await adapter.fetch()
      statuses.push(adapter.validate(html))
      snapshots.push(...adapter.normalize(html))
    } catch (error) {
      statuses.push({
        id: adapter.id,
        name: adapter.name,
        url: adapter.url,
        health: 'blocked',
        freshness: '不可用',
        lastSync: new Date().toISOString(),
        sampleCount: 0,
        note: `公开源请求受限或页面不可用，未进行绕过：${getErrorMessage(error)}`,
      })
    }
  }

  return { statuses, snapshots }
}

// 提取公开源抓取失败的可读原因。
function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '未知错误'
}

// 根据命令行参数输出抓取状态。
async function runCli() {
  const mode = process.argv.includes('--live') ? 'live' : 'fixtures'
  const statuses = mode === 'live' ? await collectLiveSourceStatuses() : await collectFixtureSourceStatuses()
  console.log(JSON.stringify(statuses, null, 2))
}

// 在直接执行脚本时运行采集命令。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}

// 提供无法读取 fixture 时的静态来源状态兜底。
export function getFallbackSourceStatuses() {
  return sourceStatuses
}
