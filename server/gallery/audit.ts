import { fileURLToPath } from 'node:url'
import { getGalleryStatus } from './store.ts'

// 执行命令行图库审核状态查询。
async function main() {
  const status = await getGalleryStatus()
  console.log(
    JSON.stringify(
      {
        coverageRate: status.coverageRate,
        totalCoverageRate: status.totalCoverageRate,
        targetCount: status.targetCount,
        assetCount: status.assetCount,
        preciseAssetCount: status.preciseAssetCount,
        referenceAssetCount: status.referenceAssetCount,
        pendingCandidateCount: status.pendingCandidateCount,
        rejectedCandidateCount: status.rejectedCandidateCount,
        candidates: status.candidates
          .filter((candidate) => candidate.reviewStatus === 'pending')
          .slice(0, 20)
          .map((candidate) => ({
            id: candidate.id,
            vehicleId: candidate.vehicleId,
            kind: candidate.kind,
            confidence: candidate.confidence,
            licenseName: candidate.licenseName,
            sourcePageUrl: candidate.sourcePageUrl,
          })),
      },
      null,
      2,
    ),
  )
}

// 仅在直接执行脚本时输出审核状态。
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'gallery audit failed')
    process.exitCode = 1
  })
}
