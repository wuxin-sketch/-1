import { discoverAndStoreGalleryCandidates } from './store.ts'
import { fileURLToPath } from 'node:url'

// 执行命令行候选图发现任务。
async function main() {
  const result = await discoverAndStoreGalleryCandidates()
  console.log(
    JSON.stringify(
      {
        discoveredCount: result.discoveredCount,
        addedCount: result.addedCount,
        skippedCount: result.skippedCount,
        warnings: result.warnings,
        pendingCandidateCount: result.status.pendingCandidateCount,
      },
      null,
      2,
    ),
  )
}

// 仅在直接执行脚本时启动候选发现。
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'gallery discover failed')
    process.exitCode = 1
  })
}
