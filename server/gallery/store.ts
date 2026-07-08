import { existsSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'
import type {
  ApprovedGalleryAsset,
  GalleryAssetKind,
  GalleryCandidate,
  GalleryCandidateActionResponse,
  GalleryCoverageState,
  GalleryCropSelection,
  GalleryDiscoverResponse,
  GalleryStatusResponse,
  VehicleGalleryTarget,
} from '../../src/types.ts'
import { buildSeedGalleryAssets } from '../../src/data/vehicleGallerySeed.ts'
import { vehicleGalleryTargets } from '../../src/data/vehicleGalleryTargets.ts'
import { discoverGalleryCandidates, type GalleryDiscoverOptions } from './discovery.ts'
import { validateGalleryLicense } from './license.ts'
import { getDefaultGalleryStorePaths, type GalleryStorePaths } from './paths.ts'

// 将 Node 回调式 execFile 转为 Promise。
const execFileAsync = promisify(execFile)

// 串行化远程下载任务，降低图库来源站点限流风险。
let galleryDownloadQueue = Promise.resolve()

// 定义图库下载阶段使用的轻量 fetch 响应。
export interface GalleryBinaryResponse {
  ok: boolean
  status: number
  body?: ReadableStream<Uint8Array> | null
  headers: {
    get: (name: string) => string | null
  }
  arrayBuffer: () => Promise<ArrayBuffer>
}

// 定义图库下载阶段可注入的 fetch 函数。
export type GalleryBinaryFetcher = (url: string) => Promise<GalleryBinaryResponse>

// 定义图库存储操作的可配置参数。
export interface GalleryStoreOptions {
  paths?: GalleryStorePaths
  targets?: VehicleGalleryTarget[]
  now?: Date
  fetcher?: GalleryBinaryFetcher
}

// 定义图库远程图片允许下载的最大字节数。
export const galleryMaxImageBytes = Number(process.env.YUEZHI_GALLERY_IMAGE_MAX_BYTES ?? 8 * 1024 * 1024)

// 定义图库远程图片下载的默认超时时间。
const galleryFetchTimeoutMs = Number(process.env.YUEZHI_GALLERY_FETCH_TIMEOUT_MS ?? 15000)

// 等待指定毫秒数，用于下载节流和重试退避。
function waitForGalleryThrottle(ms: number) {
  return new Promise<void>((resolveWait) => {
    setTimeout(resolveWait, ms)
  })
}

// 将远程下载放入串行队列，并在任务间保留轻量间隔。
async function runQueuedGalleryDownload<T>(task: () => Promise<T>): Promise<T> {
  const queuedTask = galleryDownloadQueue.catch(() => undefined).then(task)
  galleryDownloadQueue = queuedTask.then(
    () => waitForGalleryThrottle(900),
    () => waitForGalleryThrottle(900),
  )
  return queuedTask
}

// 将 Buffer 转成可被 Response 兼容接口读取的 ArrayBuffer。
function bufferToArrayBuffer(buffer: Buffer) {
  const arrayBuffer = new ArrayBuffer(buffer.byteLength)
  new Uint8Array(arrayBuffer).set(buffer)
  return arrayBuffer
}

// 校验响应声明长度没有超过图库下载上限。
function assertGalleryContentLength(response: GalleryBinaryResponse) {
  const contentLength = Number(response.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > galleryMaxImageBytes) {
    throw new Error('候选图文件过大，已阻止下载。')
  }
}

// 从响应流中按字节上限读取远程图片内容。
async function readGalleryResponseBuffer(response: GalleryBinaryResponse) {
  assertGalleryContentLength(response)

  if (response.body) {
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    let totalBytes = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }

      totalBytes += value.byteLength
      if (totalBytes > galleryMaxImageBytes) {
        await reader.cancel()
        throw new Error('候选图文件过大，已阻止下载。')
      }

      chunks.push(value)
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength > galleryMaxImageBytes) {
    throw new Error('候选图文件过大，已阻止下载。')
  }

  return buffer
}

// 使用 PowerShell 下载远程图片作为 Node fetch 的兜底。
async function fetchGalleryBinaryWithPowerShell(url: string): Promise<GalleryBinaryResponse> {
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$ProgressPreference = "SilentlyContinue"; $client = New-Object System.Net.WebClient; $client.Headers.Add("User-Agent", "YuezhiHaocheGalleryAudit/1.0 (local single-user tool)"); $bytes = $client.DownloadData($env:GALLERY_BINARY_URL); [Convert]::ToBase64String($bytes)',
    ],
    { timeout: galleryFetchTimeoutMs + 10000, maxBuffer: Math.ceil(galleryMaxImageBytes * 1.4), env: { ...process.env, GALLERY_BINARY_URL: url } },
  )
  const buffer = Buffer.from(String(stdout).replace(/\s+/g, ''), 'base64')

  return {
    ok: true,
    status: 200,
    headers: {
      get: () => 'image/jpeg',
    },
    arrayBuffer: async () => bufferToArrayBuffer(buffer),
  }
}

// 下载远程图片并在 Node fetch 失败时降级到 PowerShell。
async function fetchGalleryBinaryWithFallback(url: string): Promise<GalleryBinaryResponse> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), galleryFetchTimeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal })
    if (response.ok) {
      return response
    }
  } catch {
    return fetchGalleryBinaryWithPowerShell(url)
  } finally {
    clearTimeout(timeout)
  }

  return fetchGalleryBinaryWithPowerShell(url)
}

// 转义 SVG 文本中的特殊字符。
function escapeSvgText(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// 构建候选图预览不可用时的本地占位 SVG。
function buildCandidatePreviewPlaceholder(candidate: GalleryCandidate) {
  const title = escapeSvgText(candidate.title.replace(/[^\x20-\x7E]/g, '').slice(0, 42))
  const label = escapeSvgText(`${candidate.vehicleId} / ${candidate.kind}`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="420" viewBox="0 0 640 420">
  <rect width="640" height="420" fill="#edf5f6"/>
  <rect x="28" y="28" width="584" height="364" rx="18" fill="#ffffff" stroke="#b7d4d8" stroke-dasharray="12 10"/>
  <text x="320" y="168" text-anchor="middle" fill="#0f766e" font-family="Arial, sans-serif" font-size="28" font-weight="700">Preview limited</text>
  <text x="320" y="214" text-anchor="middle" fill="#52646b" font-family="Arial, sans-serif" font-size="20">${label}</text>
  <text x="320" y="254" text-anchor="middle" fill="#52646b" font-family="Arial, sans-serif" font-size="18">${title}</text>
  <text x="320" y="306" text-anchor="middle" fill="#94a3b8" font-family="Arial, sans-serif" font-size="16">Open source page to review the original image</text>
</svg>`
}

// 确保图库数据和静态资源目录已经存在。
async function ensureGalleryDirectories(paths: GalleryStorePaths) {
  await Promise.all([mkdir(paths.galleryDataDir, { recursive: true }), mkdir(paths.publicGalleryDir, { recursive: true })])
}

// 安全读取 JSON 文件并在缺失时返回兜底值。
async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  if (!existsSync(path)) {
    return fallback
  }

  return JSON.parse(await readFile(path, 'utf8')) as T
}

// 将对象以稳定格式写入 JSON 文件。
async function writeJsonFile(path: string, value: unknown) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

// 读取图库候选队列。
export async function readGalleryCandidates(paths = getDefaultGalleryStorePaths()) {
  return readJsonFile<GalleryCandidate[]>(paths.candidatesPath, [])
}

// 读取已经批准入库的图库资产。
export async function readApprovedGalleryAssets(paths = getDefaultGalleryStorePaths()) {
  const assets = await readJsonFile<ApprovedGalleryAsset[]>(paths.approvedPath, [])
  return assets.map((asset) => ({ ...asset, quality: asset.quality ?? 'precise' }))
}

// 按车型和分类对图库资产去重，后写入的批准资产覆盖种子资产。
function dedupeAssetsByVehicleKind(assets: ApprovedGalleryAsset[]) {
  const map = new Map<string, ApprovedGalleryAsset>()

  assets.forEach((asset) => {
    map.set(`${asset.vehicleId}:${asset.kind}`, asset)
  })

  return Array.from(map.values())
}

// 汇总种子图库和人工审核批准图库。
async function readCombinedApprovedAssets(paths: GalleryStorePaths) {
  return dedupeAssetsByVehicleKind([...buildSeedGalleryAssets(), ...(await readApprovedGalleryAssets(paths))])
}

// 根据候选和资产计算单类图库覆盖状态。
function getCoverageState(asset: ApprovedGalleryAsset | undefined, pendingCount: number): GalleryCoverageState {
  if (asset?.quality === 'precise') {
    return 'precise'
  }

  if (pendingCount > 0) {
    return 'pending'
  }

  return asset ? 'reference' : 'missing'
}

// 构建图库覆盖状态响应。
export async function getGalleryStatus(options: GalleryStoreOptions = {}): Promise<GalleryStatusResponse> {
  const paths = options.paths ?? getDefaultGalleryStorePaths()
  await ensureGalleryDirectories(paths)

  const targets = options.targets ?? vehicleGalleryTargets
  const [candidates, approvedAssets] = await Promise.all([readGalleryCandidates(paths), readCombinedApprovedAssets(paths)])
  const assetMap = new Map(approvedAssets.map((asset) => [`${asset.vehicleId}:${asset.kind}`, asset]))
  const pendingCandidates = candidates.filter((candidate) => candidate.reviewStatus === 'pending')
  const rejectedCandidates = candidates.filter((candidate) => candidate.reviewStatus === 'rejected')
  const preciseAssetCount = approvedAssets.filter((asset) => asset.quality === 'precise').length
  const referenceAssetCount = approvedAssets.filter((asset) => asset.quality !== 'precise').length
  let preciseSlots = 0
  let availableSlots = 0
  let totalSlots = 0

  const targetStatuses = targets.map((target) => {
    const assets: Partial<Record<GalleryAssetKind, ApprovedGalleryAsset>> = {}
    const coverage = {} as Record<GalleryAssetKind, GalleryCoverageState>

    target.kinds.forEach((kind) => {
      const key = `${target.vehicleId}:${kind}`
      const asset = assetMap.get(key)
      const pendingCount = pendingCandidates.filter((candidate) => candidate.vehicleId === target.vehicleId && candidate.kind === kind).length
      assets[kind] = asset
      coverage[kind] = getCoverageState(asset, pendingCount)
      preciseSlots += asset?.quality === 'precise' ? 1 : 0
      availableSlots += asset ? 1 : 0
      totalSlots += 1
    })

    return {
      vehicleId: target.vehicleId,
      brand: target.brand,
      model: target.model,
      modelYears: target.modelYears,
      coverage,
      assets,
      pendingCount: pendingCandidates.filter((candidate) => candidate.vehicleId === target.vehicleId).length,
      rejectedCount: rejectedCandidates.filter((candidate) => candidate.vehicleId === target.vehicleId).length,
    }
  })

  return {
    updatedAt: (options.now ?? new Date()).toISOString(),
    targetCount: targets.length,
    assetCount: approvedAssets.length,
    preciseAssetCount,
    referenceAssetCount,
    pendingCandidateCount: pendingCandidates.length,
    rejectedCandidateCount: rejectedCandidates.length,
    coverageRate: totalSlots > 0 ? Math.round((preciseSlots / totalSlots) * 100) : 0,
    totalCoverageRate: totalSlots > 0 ? Math.round((availableSlots / totalSlots) * 100) : 0,
    targets: targetStatuses,
    candidates: candidates.sort((a, b) => b.confidence - a.confidence),
  }
}

// 写入候选队列并保留既有人工审核状态。
async function upsertGalleryCandidates(nextCandidates: GalleryCandidate[], paths: GalleryStorePaths) {
  const currentCandidates = await readGalleryCandidates(paths)
  const currentMap = new Map(currentCandidates.map((candidate) => [candidate.id, candidate]))
  let addedCount = 0
  let skippedCount = 0

  nextCandidates.forEach((candidate) => {
    const existing = currentMap.get(candidate.id)
    if (existing) {
      skippedCount += 1
      currentMap.set(candidate.id, { ...candidate, reviewStatus: existing.reviewStatus, reviewedAt: existing.reviewedAt, reviewerNote: existing.reviewerNote })
      return
    }

    addedCount += 1
    currentMap.set(candidate.id, candidate)
  })

  const mergedCandidates = Array.from(currentMap.values())
  await writeJsonFile(paths.candidatesPath, mergedCandidates)

  return { candidates: mergedCandidates, addedCount, skippedCount }
}

// 发现开放授权候选图并写入候选队列。
export async function discoverAndStoreGalleryCandidates(options: GalleryDiscoverOptions & GalleryStoreOptions = {}): Promise<GalleryDiscoverResponse> {
  const paths = options.paths ?? getDefaultGalleryStorePaths()
  await ensureGalleryDirectories(paths)

  const discovery = await discoverGalleryCandidates(options)
  const upserted = await upsertGalleryCandidates(discovery.candidates, paths)

  return {
    discoveredCount: discovery.candidates.length,
    addedCount: upserted.addedCount,
    skippedCount: upserted.skippedCount,
    warnings: discovery.warnings,
    candidates: upserted.candidates,
    status: await getGalleryStatus({ ...options, paths }),
  }
}

// 从候选队列读取指定候选图。
export async function readGalleryCandidate(candidateId: string, paths = getDefaultGalleryStorePaths()) {
  const candidates = await readGalleryCandidates(paths)
  return candidates.find((candidate) => candidate.id === candidateId) ?? null
}

// 读取候选图的本地代理预览图片。
export async function readGalleryCandidatePreviewImage(candidateId: string, options: GalleryStoreOptions = {}) {
  const paths = options.paths ?? getDefaultGalleryStorePaths()
  const candidate = await readGalleryCandidate(candidateId, paths)
  if (!candidate) {
    return null
  }

  const fetcher = options.fetcher ?? fetchGalleryBinaryWithFallback
  try {
    const response = await fetcher(candidate.thumbnailUrl || candidate.fileUrl)
    if (!response.ok) {
      throw new Error(`候选图预览读取失败：${response.status}`)
    }

    return {
      buffer: await readGalleryResponseBuffer(response),
      contentType: response.headers.get('content-type') ?? candidate.mime,
    }
  } catch {
    return {
      buffer: Buffer.from(buildCandidatePreviewPlaceholder(candidate), 'utf8'),
      contentType: 'image/svg+xml; charset=utf-8',
    }
  }
}

// 生成批准入库后的本地图库文件路径。
function buildApprovedAssetPaths(paths: GalleryStorePaths, candidate: GalleryCandidate) {
  const fileName = `${candidate.vehicleId}-${candidate.kind}.jpg`
  const localFilePath = resolve(paths.publicGalleryDir, fileName)

  return {
    localFilePath,
    src: `/assets/vehicle-gallery/${fileName}`,
    localPath: `public/assets/vehicle-gallery/${fileName}`,
  }
}

// 判断候选分类是否需要人工裁切确认。
function requiresCropSelection(kind: GalleryAssetKind) {
  return kind === 'console' || kind === 'detail'
}

// 校验中控和细节候选图是否已经记录人工裁切确认。
function assertCropSelection(candidate: GalleryCandidate, cropSelection?: GalleryCropSelection) {
  if (requiresCropSelection(candidate.kind) && !cropSelection) {
    throw new Error('中控/细节图批准前需要先完成人工裁切确认。')
  }
}

// 查找与候选图同源同车型同分类的本地参考图。
function findSeedAssetForCandidate(candidate: GalleryCandidate) {
  return buildSeedGalleryAssets().find(
    (asset) => asset.vehicleId === candidate.vehicleId && asset.kind === candidate.kind && asset.sourcePageUrl === candidate.sourcePageUrl,
  )
}

// 优先复用本地已缓存的同源图，避免重复请求外部图片。
async function copySeedCandidateImage(candidate: GalleryCandidate, paths: GalleryStorePaths) {
  const seedAsset = findSeedAssetForCandidate(candidate)
  if (!seedAsset) {
    return null
  }

  const sourcePath = resolve(paths.projectRoot, seedAsset.localPath)
  if (!existsSync(sourcePath)) {
    return null
  }

  const assetPaths = buildApprovedAssetPaths(paths, candidate)
  if (sourcePath !== assetPaths.localFilePath) {
    await copyFile(sourcePath, assetPaths.localFilePath)
  }
  return assetPaths
}

// 从远程响应中读取并校验候选图 JPEG 内容。
async function fetchCandidateImageBuffer(candidate: GalleryCandidate, fetcher: GalleryBinaryFetcher) {
  const response = await fetcher(candidate.fileUrl)
  if (!response.ok) {
    throw new Error(`图片下载失败：${response.status}`)
  }

  const contentType = response.headers.get('content-type') ?? candidate.mime
  if (!contentType.includes('image/jpeg')) {
    throw new Error(`暂只自动入库 JPEG 图片，当前类型为 ${contentType || '未知'}。`)
  }

  const buffer = await readGalleryResponseBuffer(response)
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    throw new Error('下载内容不是有效 JPEG 图片。')
  }

  return buffer
}

// 通过串行队列下载候选图片，并对临时失败做有限重试。
async function downloadCandidateImage(candidate: GalleryCandidate, paths: GalleryStorePaths, fetcher: GalleryBinaryFetcher) {
  return runQueuedGalleryDownload(async () => {
    let lastError: unknown

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const buffer = await fetchCandidateImageBuffer(candidate, fetcher)
        const assetPaths = buildApprovedAssetPaths(paths, candidate)
        await writeFile(assetPaths.localFilePath, buffer)
        return assetPaths
      } catch (error) {
        lastError = error
        if (attempt < 3) {
          await waitForGalleryThrottle(1000 * attempt)
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error('图片下载失败，请稍后重试。')
  })
}

// 写入候选图图片，优先复用本地参考资产再降级远程下载。
async function writeCandidateImage(candidate: GalleryCandidate, paths: GalleryStorePaths, fetcher: GalleryBinaryFetcher) {
  const copiedAssetPaths = await copySeedCandidateImage(candidate, paths)
  if (copiedAssetPaths) {
    return copiedAssetPaths
  }

  return downloadCandidateImage(candidate, paths, fetcher)
}

// 将候选图转换为已批准图库资产记录。
function buildApprovedAsset(
  candidate: GalleryCandidate,
  assetPaths: ReturnType<typeof buildApprovedAssetPaths>,
  now: Date,
  reviewerNote: string,
  cropSelection?: GalleryCropSelection,
) {
  return {
    id: candidate.id,
    vehicleId: candidate.vehicleId,
    kind: candidate.kind,
    quality: 'precise',
    src: assetPaths.src,
    localPath: assetPaths.localPath,
    sourceProvider: candidate.sourceProvider,
    sourcePageUrl: candidate.sourcePageUrl,
    fileUrl: candidate.fileUrl,
    author: candidate.author,
    licenseName: candidate.licenseName,
    licenseUrl: candidate.licenseUrl,
    width: candidate.width,
    height: candidate.height,
    approvedAt: now.toISOString(),
    reviewerNote,
    cropSelection,
    matchEvidence: candidate.evidence,
    status: 'approved',
  } satisfies ApprovedGalleryAsset
}

// 生成前端 manifest 的 TypeScript 文件内容。
function buildManifestSource(approvedAssets: ApprovedGalleryAsset[]) {
  return [
    "import type { ApprovedGalleryAsset } from '../types'",
    "import { buildSeedGalleryAssets } from './vehicleGallerySeed'",
    '',
    '// 定义审核通过后由服务端写入的授权图库资产。',
    `export const generatedApprovedGalleryAssets: ApprovedGalleryAsset[] = ${JSON.stringify(approvedAssets, null, 2)}`,
    '',
    '// 汇总本地种子图库和审核批准图库供前端读取。',
    'export const vehicleGalleryManifest: ApprovedGalleryAsset[] = [...buildSeedGalleryAssets(), ...generatedApprovedGalleryAssets]',
    '',
  ].join('\n')
}

// 写入前端图库 manifest。
async function writeGalleryManifest(paths: GalleryStorePaths, approvedAssets: ApprovedGalleryAsset[]) {
  await writeFile(paths.manifestPath, buildManifestSource(approvedAssets), 'utf8')
}

// 生成归因文档中的自动更新段。
function buildAttributionGeneratedSection(approvedAssets: ApprovedGalleryAsset[]) {
  const lines = ['<!-- GALLERY-AUTOMATION:START -->', '## 授权图库自动化入库记录', '']

  if (approvedAssets.length === 0) {
    lines.push('暂无新增审核入库资产。')
  } else {
    approvedAssets.forEach((asset) => {
      const qualityLabel = asset.quality === 'precise' ? '精确授权图' : '本地参考图'
      const cropNote = asset.cropSelection ? `，裁切确认 ${asset.cropSelection.note}` : ''
      lines.push(
        `- \`${asset.localPath}\`：${qualityLabel}，${asset.sourceProvider}，作者 ${asset.author}，许可证 ${asset.licenseName}，来源 ${asset.sourcePageUrl}${cropNote}`,
      )
    })
  }

  lines.push('', '<!-- GALLERY-AUTOMATION:END -->', '')
  return lines.join('\n')
}

// 写入授权图库归因文档的自动更新段。
async function writeGalleryAttribution(paths: GalleryStorePaths, approvedAssets: ApprovedGalleryAsset[]) {
  const markerStart = '<!-- GALLERY-AUTOMATION:START -->'
  const markerEnd = '<!-- GALLERY-AUTOMATION:END -->'
  const current = existsSync(paths.attributionPath) ? await readFile(paths.attributionPath, 'utf8') : '# 车型图片来源\n'
  const generated = buildAttributionGeneratedSection(approvedAssets)
  const startIndex = current.indexOf(markerStart)
  const endIndex = current.indexOf(markerEnd)

  if (startIndex >= 0 && endIndex > startIndex) {
    const before = current.slice(0, startIndex).trimEnd()
    const after = current.slice(endIndex + markerEnd.length).trimStart()
    await writeFile(paths.attributionPath, `${before}\n\n${generated}${after ? `\n${after}` : ''}`, 'utf8')
    return
  }

  await writeFile(paths.attributionPath, `${current.trimEnd()}\n\n${generated}`, 'utf8')
}

// 更新候选队列中的指定候选审核状态。
async function updateCandidateReviewStatus(paths: GalleryStorePaths, candidateId: string, status: GalleryCandidate['reviewStatus'], reviewerNote: string, now: Date) {
  const candidates = await readGalleryCandidates(paths)
  const candidate = candidates.find((item) => item.id === candidateId)
  if (!candidate) {
    throw new Error('候选图不存在或已被清理。')
  }

  candidate.reviewStatus = status
  candidate.reviewedAt = now.toISOString()
  candidate.reviewerNote = reviewerNote
  await writeJsonFile(paths.candidatesPath, candidates)
  return candidate
}

// 批准候选图并写入本地图库资产。
export async function approveGalleryCandidate(
  candidateId: string,
  options: GalleryStoreOptions & { reviewerNote?: string; cropSelection?: GalleryCropSelection } = {},
): Promise<GalleryCandidateActionResponse> {
  const paths = options.paths ?? getDefaultGalleryStorePaths()
  const now = options.now ?? new Date()
  const fetcher = options.fetcher ?? fetchGalleryBinaryWithFallback
  await ensureGalleryDirectories(paths)

  const candidates = await readGalleryCandidates(paths)
  const candidate = candidates.find((item) => item.id === candidateId)
  if (!candidate) {
    throw new Error('候选图不存在或已被清理。')
  }

  const approvedAssets = await readApprovedGalleryAssets(paths)
  const existingAsset = approvedAssets.find((asset) => asset.id === candidateId)
  if (existingAsset) {
    const reviewedCandidate = await updateCandidateReviewStatus(paths, candidateId, 'approved', options.reviewerNote ?? '重复批准，保持既有入库资产。', now)
    return { candidate: reviewedCandidate, asset: existingAsset, status: await getGalleryStatus({ ...options, paths }) }
  }

  const licenseCheck = validateGalleryLicense(candidate)
  if (!licenseCheck.allowed) {
    throw new Error(licenseCheck.reason)
  }

  assertCropSelection(candidate, options.cropSelection)

  const assetPaths = await writeCandidateImage(candidate, paths, fetcher)
  const asset = buildApprovedAsset(candidate, assetPaths, now, options.reviewerNote ?? '人工审核批准入库。', options.cropSelection)
  const nextApprovedAssets = dedupeAssetsByVehicleKind([...approvedAssets, asset])
  await writeJsonFile(paths.approvedPath, nextApprovedAssets)
  await writeGalleryManifest(paths, nextApprovedAssets)
  await writeGalleryAttribution(paths, nextApprovedAssets)

  const reviewedCandidate = await updateCandidateReviewStatus(paths, candidateId, 'approved', options.reviewerNote ?? '人工审核批准入库。', now)
  return { candidate: reviewedCandidate, asset, status: await getGalleryStatus({ ...options, paths }) }
}

// 拒绝候选图并记录人工原因。
export async function rejectGalleryCandidate(candidateId: string, options: GalleryStoreOptions & { reason?: string } = {}): Promise<GalleryCandidateActionResponse> {
  const paths = options.paths ?? getDefaultGalleryStorePaths()
  const now = options.now ?? new Date()
  await ensureGalleryDirectories(paths)

  const candidate = await updateCandidateReviewStatus(paths, candidateId, 'rejected', options.reason ?? '人工审核拒绝。', now)
  return { candidate, status: await getGalleryStatus({ ...options, paths }) }
}
