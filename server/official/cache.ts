import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { OfficialUsedCarMarket } from '../../src/types.ts'
import { cacheDir, ensureDataDirectories } from '../pipeline/paths.ts'

// 定义 CADA 官方大盘缓存文件结构。
export interface OfficialUsedCarCacheFile {
  cachedAt: string
  sourceFetchedAt: string
  latestAvailableMonth: string
  market: OfficialUsedCarMarket
}

// 生成官方二手车大盘缓存文件路径。
export function getOfficialUsedCarCachePath() {
  return resolve(cacheDir, 'official-used-car-latest.json')
}

// 读取官方二手车大盘缓存文件。
export async function readOfficialUsedCarCache(cachePath = getOfficialUsedCarCachePath()) {
  if (!existsSync(cachePath)) {
    return null
  }

  return JSON.parse(await readFile(cachePath, 'utf8')) as OfficialUsedCarCacheFile
}

// 写入官方二手车大盘缓存文件。
export async function writeOfficialUsedCarCache(
  market: OfficialUsedCarMarket,
  cachePath = getOfficialUsedCarCachePath(),
  cachedAt = new Date().toISOString(),
) {
  await ensureDataDirectories()
  const sourceFetchedAt = market.sourceFetchedAt ?? market.updatedAt
  const cache: OfficialUsedCarCacheFile = {
    cachedAt,
    sourceFetchedAt,
    latestAvailableMonth: market.latestAvailableMonth,
    market: {
      ...market,
      dataFreshness: 'fresh',
      cachedAt,
      sourceFetchedAt,
    },
  }

  await writeFile(cachePath, `${JSON.stringify(cache, null, 2)}\n`, 'utf8')
  return { cache, cachePath }
}
