import { getOfficialUsedCarCachePath } from './cache.ts'
import { refreshOfficialUsedCarMarket } from './service.ts'

// 从命令行参数中读取目标月份。
function readCliMonth() {
  const monthArg = process.argv.find((arg) => arg.startsWith('--month='))
  return monthArg?.split('=')[1] ?? 'latest'
}

// 执行 CADA 官方大盘手动刷新。
async function main() {
  const month = readCliMonth()
  const market = await refreshOfficialUsedCarMarket(month)
  console.log(
    JSON.stringify(
      {
        dataFreshness: market.dataFreshness,
        latestAvailableMonth: market.latestAvailableMonth,
        nationalVolumeWan: market.nationalVolumeWan,
        momPercent: market.momPercent,
        cachedAt: market.cachedAt,
        sourceFetchedAt: market.sourceFetchedAt,
        cacheFile: getOfficialUsedCarCachePath(),
        unavailableReason: market.unavailableReason,
      },
      null,
      2,
    ),
  )
}

// 启动命令行刷新流程。
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'official refresh unavailable')
  process.exitCode = 1
})
