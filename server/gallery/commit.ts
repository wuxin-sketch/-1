import { fileURLToPath } from 'node:url'
import type { GalleryCandidate, GalleryCropSelection } from '../../src/types.ts'
import { approveGalleryCandidate, readGalleryCandidate } from './store.ts'

// 从命令行参数中读取候选图 ID。
function readCandidateIdFromArgs() {
  const idIndex = process.argv.findIndex((arg) => arg === '--id')
  return idIndex >= 0 ? process.argv[idIndex + 1] : process.argv[2]
}

// 为命令行批准生成中控或细节图的人工裁切确认。
function buildCliCropSelection(candidate: GalleryCandidate | null): GalleryCropSelection | undefined {
  if (!candidate || (candidate.kind !== 'console' && candidate.kind !== 'detail')) {
    return undefined
  }

  return {
    mode: candidate.kind === 'console' ? 'console-crop' : 'detail-crop',
    note: '命令行人工审核确认裁切区域。',
  }
}

// 执行命令行候选图批准入库。
async function main() {
  const candidateId = readCandidateIdFromArgs()
  if (!candidateId) {
    throw new Error('请提供候选图 ID，例如 npm run gallery:commit -- --id <candidateId>')
  }

  const candidate = await readGalleryCandidate(candidateId)
  const result = await approveGalleryCandidate(candidateId, {
    reviewerNote: '命令行人工审核批准入库。',
    cropSelection: buildCliCropSelection(candidate),
  })
  console.log(
    JSON.stringify(
      {
        candidateId: result.candidate.id,
        vehicleId: result.candidate.vehicleId,
        kind: result.candidate.kind,
        asset: result.asset?.src,
        coverageRate: result.status.coverageRate,
        totalCoverageRate: result.status.totalCoverageRate,
        preciseAssetCount: result.status.preciseAssetCount,
      },
      null,
      2,
    ),
  )
}

// 仅在直接执行脚本时批准候选图。
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'gallery commit failed')
    process.exitCode = 1
  })
}
