import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { get as httpGet } from 'node:http'
import { get as httpsGet } from 'node:https'
import { promisify } from 'node:util'
import type { GalleryAssetKind, GalleryCandidate, VehicleGalleryTarget } from '../../src/types.ts'
import { vehicleGalleryTargets } from '../../src/data/vehicleGalleryTargets.ts'
import { normalizeLicenseName, validateGalleryLicense } from './license.ts'
import { scoreGalleryCandidateText } from './matching.ts'

// 将 Node 回调式 execFile 转为 Promise。
const execFileAsync = promisify(execFile)

// 定义图库发现阶段使用的轻量 fetch 响应。
export interface GalleryJsonResponse {
  ok: boolean
  status: number
  json: () => Promise<unknown>
}

// 定义图库发现阶段可注入的 fetch 函数。
export type GalleryJsonFetcher = (url: string) => Promise<GalleryJsonResponse>

// 定义图库候选发现的可配置参数。
export interface GalleryDiscoverOptions {
  targets?: VehicleGalleryTarget[]
  kinds?: GalleryAssetKind[]
  perQueryLimit?: number
  concurrency?: number
  requestTimeoutMs?: number
  fetcher?: GalleryJsonFetcher
  now?: Date
}

// 定义候选发现阶段的一组 Commons 查询任务。
interface GalleryDiscoverJob {
  target: VehicleGalleryTarget
  kind: GalleryAssetKind
}

// 定义 Commons 图片元数据字段结构。
interface CommonsMetadataValue {
  value?: string
}

// 定义 Commons imageinfo 响应中的图片信息。
interface CommonsImageInfo {
  url?: string
  thumburl?: string
  descriptionurl?: string
  mime?: string
  width?: number
  height?: number
  extmetadata?: Record<string, CommonsMetadataValue>
}

// 定义 Commons 查询返回的页面结构。
interface CommonsPage {
  title?: string
  imageinfo?: CommonsImageInfo[]
}

// 定义 Commons 查询响应结构。
interface CommonsQueryResponse {
  query?: {
    pages?: Record<string, CommonsPage>
  }
}

// 去除 Commons 元数据中的 HTML 标签。
function stripMetadataHtml(value: string | undefined) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
}

// 从 Commons extmetadata 中读取指定字段文本。
function readMetadata(extmetadata: Record<string, CommonsMetadataValue> | undefined, key: string) {
  return stripMetadataHtml(extmetadata?.[key]?.value)
}

// 为候选图生成稳定 ID。
export function createGalleryCandidateId(vehicleId: string, kind: GalleryAssetKind, sourceUrl: string) {
  const digest = createHash('sha1').update(`${vehicleId}:${kind}:${sourceUrl}`).digest('hex').slice(0, 16)
  return `${vehicleId}-${kind}-${digest}`
}

// 构建 Commons 搜索接口 URL。
function buildCommonsSearchUrl(target: VehicleGalleryTarget, kind: GalleryAssetKind, limit: number) {
  const alias = target.aliases[0]
  const yearQuery = target.yearHints.slice(0, 2).join(' ')
  const keywordQuery = kind === 'exterior' ? 'car' : target.categoryKeywords[kind].slice(0, 2).join(' ')
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    generator: 'search',
    gsrnamespace: '6',
    gsrlimit: String(limit),
    gsrsearch: `${alias} ${yearQuery} ${keywordQuery}`,
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '640',
    origin: '*',
  })

  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`
}

// 构建 Commons 已知文件元数据接口 URL。
function buildCommonsTitleInfoUrl(fileNames: string[]) {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    titles: fileNames.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|size|extmetadata',
    iiurlwidth: '640',
    origin: '*',
  })

  return `https://commons.wikimedia.org/w/api.php?${params.toString()}`
}

// 使用 PowerShell 作为 Windows 环境下的 Commons 请求兜底。
async function fetchCommonsJsonWithPowerShell(url: string, timeoutMs: number): Promise<GalleryJsonResponse> {
  const timeoutSec = Math.max(5, Math.ceil(timeoutMs / 1000))
  const { stdout } = await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      '$ProgressPreference = "SilentlyContinue"; (Invoke-WebRequest -UseBasicParsing -TimeoutSec ([int]$env:COMMONS_TIMEOUT_SEC) -Uri $env:COMMONS_URL).Content',
    ],
    {
      timeout: timeoutMs + 5000,
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, COMMONS_URL: url, COMMONS_TIMEOUT_SEC: String(timeoutSec) },
    },
  )

  return {
    ok: true,
    status: 200,
    json: async () => JSON.parse(String(stdout)),
  }
}

// 使用 Node http/https 请求器和超时保护读取 Commons API。
function fetchCommonsJsonWithNode(url: string, timeoutMs: number): Promise<GalleryJsonResponse> {
  return new Promise((resolve, reject) => {
    const requestFactory = url.startsWith('http://') ? httpGet : httpsGet
    const request = requestFactory(
      url,
      {
        headers: {
          'user-agent': 'YuezhiHaocheGalleryAudit/1.0 (local single-user tool)',
        },
      },
      (incomingMessage) => {
        const chunks: Buffer[] = []

        incomingMessage.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        incomingMessage.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          resolve({
            ok: Boolean(incomingMessage.statusCode && incomingMessage.statusCode >= 200 && incomingMessage.statusCode < 300),
            status: incomingMessage.statusCode ?? 0,
            json: async () => JSON.parse(body),
          })
        })
      },
    )

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error('Commons API request timeout'))
    })
    request.on('error', reject)
  })
}

// 读取 Commons API 并在 Node 网络失败时降级到 PowerShell。
async function fetchCommonsJsonWithTimeout(url: string, timeoutMs: number): Promise<GalleryJsonResponse> {
  try {
    return await fetchCommonsJsonWithNode(url, timeoutMs)
  } catch {
    return fetchCommonsJsonWithPowerShell(url, timeoutMs)
  }
}

// 读取 Commons 页面列表。
function readCommonsPages(payload: unknown) {
  const data = payload as CommonsQueryResponse
  return Object.values(data.query?.pages ?? {})
}

// 将 Commons 页面转换成授权候选图。
function buildCandidateFromCommonsPage(target: VehicleGalleryTarget, kind: GalleryAssetKind, page: CommonsPage, now: Date): GalleryCandidate | null {
  const imageInfo = page.imageinfo?.[0]
  if (!imageInfo?.url || !imageInfo.descriptionurl) {
    return null
  }

  const title = page.title ?? readMetadata(imageInfo.extmetadata, 'ObjectName') ?? imageInfo.descriptionurl
  const description = readMetadata(imageInfo.extmetadata, 'ImageDescription')
  const categories = readMetadata(imageInfo.extmetadata, 'Categories')
  const dateOriginal = readMetadata(imageInfo.extmetadata, 'DateTimeOriginal')
  const author = normalizeLicenseName(readMetadata(imageInfo.extmetadata, 'Artist') || readMetadata(imageInfo.extmetadata, 'Credit'))
  const licenseName = normalizeLicenseName(
    readMetadata(imageInfo.extmetadata, 'LicenseShortName') || readMetadata(imageInfo.extmetadata, 'License'),
  )
  const licenseUrl = readMetadata(imageInfo.extmetadata, 'LicenseUrl')
  const licenseCheck = validateGalleryLicense({ licenseName, licenseUrl, author })
  const searchableText = [title, description, categories, dateOriginal, imageInfo.descriptionurl, author].join(' ')
  const score = scoreGalleryCandidateText(target, kind, searchableText)
  const mime = imageInfo.mime ?? ''

  if (!licenseCheck.allowed || mime !== 'image/jpeg' || score.confidence < 55 || !score.evidence.length) {
    return null
  }

  return {
    id: createGalleryCandidateId(target.vehicleId, kind, imageInfo.descriptionurl),
    vehicleId: target.vehicleId,
    kind,
    title,
    fileUrl: imageInfo.url,
    thumbnailUrl: imageInfo.thumburl ?? imageInfo.url,
    sourcePageUrl: imageInfo.descriptionurl,
    sourceProvider: 'Wikimedia Commons',
    author,
    licenseName,
    licenseUrl,
    width: imageInfo.width ?? 0,
    height: imageInfo.height ?? 0,
    mime,
    description,
    confidence: score.confidence,
    evidence: [...score.evidence, licenseCheck.reason],
    warnings: score.warnings,
    discoveredAt: now.toISOString(),
    reviewStatus: 'pending',
  } satisfies GalleryCandidate
}

// 查询 Commons 并返回某个车型分类的候选图。
async function discoverCommonsCandidatesForTargetKind(
  target: VehicleGalleryTarget,
  kind: GalleryAssetKind,
  fetcher: GalleryJsonFetcher,
  limit: number,
  now: Date,
) {
  const response = await fetcher(buildCommonsSearchUrl(target, kind, limit))
  if (!response.ok) {
    throw new Error(`Commons API ${response.status}`)
  }

  const pages = readCommonsPages(await response.json())
  return pages
    .map((page) => buildCandidateFromCommonsPage(target, kind, page, now))
    .filter((candidate): candidate is GalleryCandidate => Boolean(candidate))
}

// 按已知 Commons 文件名读取候选图。
async function discoverCommonsHintCandidatesForTargetKind(
  target: VehicleGalleryTarget,
  kind: GalleryAssetKind,
  fetcher: GalleryJsonFetcher,
  now: Date,
) {
  const fileHints = target.commonsFileHints?.[kind] ?? []
  if (fileHints.length === 0) {
    return []
  }

  const response = await fetcher(buildCommonsTitleInfoUrl(fileHints))
  if (!response.ok) {
    throw new Error(`Commons API ${response.status}`)
  }

  const pages = readCommonsPages(await response.json())
  return pages
    .map((page) => buildCandidateFromCommonsPage(target, kind, page, now))
    .filter((candidate): candidate is GalleryCandidate => Boolean(candidate))
}

// 按并发上限执行 Commons 查询任务。
async function runDiscoverJobs(
  jobs: GalleryDiscoverJob[],
  worker: (job: GalleryDiscoverJob) => Promise<void>,
  concurrency: number,
) {
  let nextIndex = 0

  async function runWorker() {
    while (nextIndex < jobs.length) {
      const job = jobs[nextIndex]
      nextIndex += 1
      await worker(job)
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, () => runWorker()))
}

// 按目标清单发现开放授权图库候选图。
export async function discoverGalleryCandidates(options: GalleryDiscoverOptions = {}) {
  const targets = options.targets ?? vehicleGalleryTargets
  const kinds = options.kinds
  const requestTimeoutMs = options.requestTimeoutMs ?? 12000
  const responseCache = new Map<string, Promise<GalleryJsonResponse>>()
  const fetcher = options.fetcher ?? ((url: string) => {
    if (!responseCache.has(url)) {
      responseCache.set(url, fetchCommonsJsonWithTimeout(url, requestTimeoutMs))
    }

    return responseCache.get(url)!
  })
  const perQueryLimit = options.perQueryLimit ?? 4
  const concurrency = Math.max(1, Math.min(8, options.concurrency ?? 2))
  const now = options.now ?? new Date()
  const warnings: string[] = []
  const candidates: GalleryCandidate[] = []
  const jobs: GalleryDiscoverJob[] = []

  for (const target of targets) {
    for (const kind of target.kinds) {
      if (kinds && !kinds.includes(kind)) {
        continue
      }

      jobs.push({ target, kind })
    }
  }

  await runDiscoverJobs(
    jobs,
    async ({ target, kind }) => {
      try {
        const hintCandidates = await discoverCommonsHintCandidatesForTargetKind(target, kind, fetcher, now)
        if ((target.commonsFileHints?.[kind]?.length ?? 0) > 0) {
          candidates.push(...hintCandidates)
          return
        }

        candidates.push(...(await discoverCommonsCandidatesForTargetKind(target, kind, fetcher, perQueryLimit, now)))
      } catch (error) {
        warnings.push(`${target.brand}${target.model} ${kind}：${error instanceof Error ? error.message : '候选发现失败'}`)
      }
    },
    concurrency,
  )

  return { candidates, warnings }
}
