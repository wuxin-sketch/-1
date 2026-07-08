import { readLatestPipelineRun } from './cache.ts'
import { getCacheDirectory } from './cache.ts'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 运行数据管线状态查询命令。
async function runStatusCli() {
  const latestRun = await readLatestPipelineRun()
  console.log(JSON.stringify({ cacheDir: getCacheDirectory(), latestRun }, null, 2))
}

// 在直接执行脚本时输出最近管线状态。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runStatusCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
