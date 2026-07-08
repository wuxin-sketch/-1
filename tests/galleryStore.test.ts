import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { approveGalleryCandidate, galleryMaxImageBytes, getGalleryStatus, readGalleryCandidatePreviewImage, rejectGalleryCandidate } from '../server/gallery/store'
import type { GalleryCandidate, VehicleGalleryTarget } from '../src/types'
import type { GalleryStorePaths } from '../server/gallery/paths'

// 定义图库存储测试使用的根目录。
const testRoot = resolve(process.cwd(), 'data', 'gallery-test')

// 定义图库存储测试使用的目标车型。
const target: VehicleGalleryTarget = {
  vehicleId: 'test-vehicle',
  brand: '测试',
  model: 'SUV',
  modelYears: '2021-2023',
  aliases: ['Test SUV'],
  yearHints: [2021, 2022, 2023],
  generationHints: ['test generation'],
  kinds: ['interior'],
  categoryKeywords: {
    exterior: ['front'],
    interior: ['interior'],
    console: ['dashboard'],
    detail: ['wheel'],
  },
}

// 构建图库存储测试使用的隔离路径。
function buildTestPaths(testName: string): GalleryStorePaths {
  const projectRoot = resolve(testRoot, testName)
  const galleryDataDir = resolve(projectRoot, 'data-gallery')

  return {
    projectRoot,
    galleryDataDir,
    candidatesPath: resolve(galleryDataDir, 'candidates.json'),
    approvedPath: resolve(galleryDataDir, 'approved.json'),
    publicGalleryDir: resolve(projectRoot, 'public-gallery'),
    manifestPath: resolve(projectRoot, 'vehicleGalleryManifest.ts'),
    attributionPath: resolve(projectRoot, 'ATTRIBUTION.md'),
  }
}

// 构建图库存储测试使用的候选图。
function buildCandidate(id = 'test-vehicle-interior-candidate'): GalleryCandidate {
  return {
    id,
    vehicleId: 'test-vehicle',
    kind: 'interior',
    title: '2022 Test SUV interior',
    fileUrl: 'https://example.test/test-vehicle-interior.jpg',
    thumbnailUrl: 'https://example.test/test-vehicle-interior-thumb.jpg',
    sourcePageUrl: 'https://commons.wikimedia.org/wiki/File:Test_vehicle_interior.jpg',
    sourceProvider: 'Wikimedia Commons',
    author: 'Commons Photographer',
    licenseName: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
    width: 1200,
    height: 800,
    mime: 'image/jpeg',
    description: '2022 Test SUV interior',
    confidence: 91,
    evidence: ['车型别名命中：Test SUV', '分类关键词命中：interior', '年份重叠：2022'],
    warnings: [],
    discoveredAt: '2026-07-07T10:00:00.000Z',
    reviewStatus: 'pending',
  }
}

// 写入测试候选队列。
async function writeTestCandidates(paths: GalleryStorePaths, candidates: GalleryCandidate[]) {
  await mkdir(paths.galleryDataDir, { recursive: true })
  await writeFile(paths.candidatesPath, `${JSON.stringify(candidates, null, 2)}\n`, 'utf8')
}

// 构建测试用的最小 JPEG 响应。
function buildJpegFetchResponse() {
  const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xd9])
  const arrayBuffer = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)

  return {
    ok: true,
    status: 200,
    headers: {
      get: () => 'image/jpeg',
    },
    arrayBuffer: async () => arrayBuffer,
  }
}

// 构造声明超出下载上限的远程图片响应。
function buildOversizedFetchResponse() {
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-length' ? String(galleryMaxImageBytes + 1) : 'image/jpeg'),
    },
    arrayBuffer: async () => {
      throw new Error('oversized response should not be buffered')
    },
  }
}

// 清理图库存储测试产生的文件。
afterEach(async () => {
  await rm(testRoot, { recursive: true, force: true })
})

// 验证候选图预览遇到超大远程图片时回退到本地占位图。
it('uses a placeholder preview for oversized remote images', async () => {
  const paths = buildTestPaths('oversized-preview')
  const candidate = buildCandidate('oversized-preview-candidate')
  await writeTestCandidates(paths, [candidate])

  const preview = await readGalleryCandidatePreviewImage(candidate.id, {
    paths,
    fetcher: async () => buildOversizedFetchResponse(),
  })

  expect(preview?.contentType).toContain('image/svg+xml')
})

// 验证批准入库不会下载超出大小限制的候选图片。
it('rejects oversized candidate downloads on approval', async () => {
  const paths = buildTestPaths('oversized-approval')
  const candidate = buildCandidate('oversized-approval-candidate')
  await writeTestCandidates(paths, [candidate])

  await expect(
    approveGalleryCandidate(candidate.id, {
      paths,
      targets: [target],
      now: new Date('2026-07-07T10:04:00.000Z'),
      fetcher: async () => buildOversizedFetchResponse(),
    }),
  ).rejects.toThrow()
})

// 验证图库候选审核入库流程。
describe('gallery store workflow', () => {
  // 验证状态接口响应包含待审候选和目标覆盖状态。
  it('returns gallery status with pending coverage', async () => {
    const paths = buildTestPaths('status')
    await writeTestCandidates(paths, [buildCandidate()])

    const status = await getGalleryStatus({ paths, targets: [target], now: new Date('2026-07-07T10:00:00.000Z') })

    expect(status.targetCount).toBe(1)
    expect(status.pendingCandidateCount).toBe(1)
    expect(status.targets[0].coverage.interior).toBe('pending')
  })

  // 验证本地参考图不计入精确授权覆盖率。
  it('separates reference coverage from precise coverage', async () => {
    const paths = buildTestPaths('reference-coverage')
    const seededTarget: VehicleGalleryTarget = {
      ...target,
      vehicleId: 'honda-crv',
      brand: '本田',
      model: 'CR-V',
      kinds: ['exterior'],
    }

    const status = await getGalleryStatus({ paths, targets: [seededTarget], now: new Date('2026-07-07T10:00:00.000Z') })

    expect(status.coverageRate).toBe(0)
    expect(status.totalCoverageRate).toBe(100)
    expect(status.referenceAssetCount).toBeGreaterThan(0)
    expect(status.targets[0].coverage.exterior).toBe('reference')
  })

  // 验证批准候选会写入本地图片、manifest 和归因记录。
  it('approves a candidate into local asset, manifest, and attribution', async () => {
    const paths = buildTestPaths('approve')
    const candidate = buildCandidate()
    await writeTestCandidates(paths, [candidate])

    const result = await approveGalleryCandidate(candidate.id, {
      paths,
      targets: [target],
      now: new Date('2026-07-07T10:01:00.000Z'),
      fetcher: async () => buildJpegFetchResponse(),
    })
    const localAssetPath = resolve(paths.publicGalleryDir, 'test-vehicle-interior.jpg')
    const manifest = await readFile(paths.manifestPath, 'utf8')
    const attribution = await readFile(paths.attributionPath, 'utf8')

    expect(result.asset?.src).toBe('/assets/vehicle-gallery/test-vehicle-interior.jpg')
    expect(result.asset?.quality).toBe('precise')
    expect(result.status.coverageRate).toBe(100)
    expect(result.status.totalCoverageRate).toBe(100)
    expect(existsSync(localAssetPath)).toBe(true)
    expect(manifest).toContain(candidate.id)
    expect(attribution).toContain('GALLERY-AUTOMATION:START')
    expect(attribution).toContain('Commons Photographer')
  })

  // 验证拒绝候选不会写入批准资产。
  it('rejects a candidate without creating approved assets', async () => {
    const paths = buildTestPaths('reject')
    const candidate = buildCandidate('reject-candidate')
    await writeTestCandidates(paths, [candidate])

    const result = await rejectGalleryCandidate(candidate.id, {
      paths,
      targets: [target],
      now: new Date('2026-07-07T10:02:00.000Z'),
      reason: '车型年份不匹配。',
    })

    expect(result.candidate.reviewStatus).toBe('rejected')
    expect(result.status.rejectedCandidateCount).toBe(1)
    expect(existsSync(paths.approvedPath)).toBe(false)
  })

  // 验证中控和细节候选图批准前必须有人工作业确认。
  it('requires crop confirmation for console and detail candidates', async () => {
    const paths = buildTestPaths('crop-required')
    const candidate: GalleryCandidate = {
      ...buildCandidate('test-vehicle-detail-candidate'),
      kind: 'detail',
      title: '2022 Test SUV wheel detail',
    }
    await writeTestCandidates(paths, [candidate])

    await expect(
      approveGalleryCandidate(candidate.id, {
        paths,
        targets: [{ ...target, kinds: ['detail'] }],
        now: new Date('2026-07-07T10:03:00.000Z'),
        fetcher: async () => buildJpegFetchResponse(),
      }),
    ).rejects.toThrow('人工裁切确认')
  })
})
