// 定义榜单统计周期的可选范围。
export type RankingScope = 'mtd' | 'complete'

// 定义榜单排序指标的可选范围。
export type RankingMetric = 'value' | 'heat'

// 定义主工作区视图。
export type WorkspaceView = 'value' | 'official' | 'price' | 'sources' | 'compare'

// 定义榜单数据的来源模式。
export type DataMode = 'official' | 'live' | 'imported' | 'sample' | 'unavailable'

// 定义月度筛选项的数据可用状态。
export type MonthDataStatus = 'official' | 'public' | 'pending'

// 定义官方数据的新鲜度状态。
export type OfficialDataFreshness = 'fresh' | 'cached' | 'unavailable'

// 定义数据来源健康状态。
export type SourceHealth = 'normal' | 'partial' | 'blocked' | 'offline'

// 定义数据管线任务状态。
export type PipelineRunStatus = 'success' | 'partial' | 'failed'

// 定义统一数据刷新触发方式。
export type DataRefreshTrigger = 'startup' | 'manual' | 'scheduled'

// 定义服务健康检查状态。
export type ServiceHealthStatus = 'ok' | 'degraded'

// 定义图库资产需要覆盖的图片类别。
export type GalleryAssetKind = 'exterior' | 'interior' | 'console' | 'detail'

// 定义图库候选图的人工审核状态。
export type GalleryReviewStatus = 'pending' | 'approved' | 'rejected'

// 定义图库资产精度口径，区分最终授权图和本地参考图。
export type GalleryAssetQuality = 'precise' | 'reference'

// 定义人工裁切确认的可选模式。
export type GalleryCropMode = 'source' | 'center-crop' | 'console-crop' | 'detail-crop'

// 定义批准中控或细节图时记录的人工裁切确认。
export interface GalleryCropSelection {
  mode: GalleryCropMode
  note: string
}

// 定义图库覆盖状态中单个分类的状态。
export type GalleryCoverageState = 'precise' | 'reference' | 'pending' | 'missing'

// 定义车辆公开观察热度的构成项。
export interface HeatBreakdown {
  search: number
  view: number
  inquiry: number
  sold: number
}

// 定义车辆价格带分布项。
export interface PriceDistributionPoint {
  label: string
  share: number
}

// 定义单个车型的排名数据。
export interface VehicleRankItem {
  id: string
  rank?: number
  brand: string
  model: string
  segment: string
  modelYears: string
  priceMin: number
  priceMax: number
  heatIndex: number
  retentionRate: number
  ageYears: number
  mileageWanKm: number
  sourceConfidence: number
  sampleSize: number
  sources: string[]
  updatedAt: string
  riskLevel: '低' | '中' | '高'
  riskNotes: string[]
  advice: string
  heatBreakdown: HeatBreakdown
  priceDistribution: PriceDistributionPoint[]
  valueScore?: number
}

// 定义导入或抓取阶段的原始车型记录。
export interface RawVehicleRecord {
  modelId?: string
  brand?: string
  model?: string
  segment?: string
  modelYears?: string
  priceMin?: string | number
  priceMax?: string | number
  priceRange?: string
  heatIndex?: string | number
  retentionRate?: string | number
  ageYears?: string | number
  mileageWanKm?: string | number
  sourceConfidence?: string | number
  sampleSize?: string | number
  sources?: string | string[]
  updatedAt?: string
  riskLevel?: '低' | '中' | '高'
  riskNotes?: string | string[]
  advice?: string
}

// 定义归一化后可参与评分的车型记录。
export interface NormalizedVehicleRecord extends VehicleRankItem {
  dataMode: Exclude<DataMode, 'sample' | 'unavailable'>
  importedFrom?: string
}

// 定义前端月份筛选中展示的月份状态。
export interface MonthOption {
  id: string
  label: string
  status: MonthDataStatus
  statusLabel: string
  note: string
  dataMode?: DataMode
  hasRankingCache: boolean
  officialVolumeWan: number | null
  officialMomPercent: number | null
  isCurrentMonth: boolean
  isLatestOfficialMonth: boolean
}

// 定义公开源状态展示数据。
export interface SourceStatus {
  id: string
  name: string
  url: string
  health: SourceHealth
  freshness: string
  lastSync: string
  sampleCount: number
  note: string
}

// 定义来源覆盖度摘要。
export interface SourceCoverage {
  sourceCount: number
  availableSourceCount: number
  blockedSourceCount: number
  sampleCount: number
  importedRecordCount: number
  updatedAt: string
  modeNote: string
}

// 定义 CADA 官方月度交易量趋势点。
export interface OfficialMonthlyVolumePoint {
  label: string
  volumeWan: number | null
  momPercent: number | null
}

// 定义 CADA 官方省份交易量排行点。
export interface OfficialProvinceTradePoint {
  province: string
  volumeWan: number | null
}

// 定义 CADA 官方车型 Top10 参考项。
export interface OfficialModelTopItem {
  rank: number
  model: string
  volumeWan: number | null
  scopeNote: string
}

// 定义 CADA 官方转籍率趋势点。
export interface OfficialTransferPoint {
  label: string
  ratePercent: number | null
  seriesName: string
}

// 定义 CADA 官方经理人指数趋势点。
export interface OfficialManagerIndexPoint {
  label: string
  index: number | null
}

// 定义 CADA 官方二手车大盘响应数据。
export interface OfficialUsedCarMarket {
  dataMode: 'official'
  dataFreshness: OfficialDataFreshness
  officialSource: 'CADA'
  latestAvailableMonth: string
  selectedMonth?: string
  selectedMonthLabel?: string
  selectedMonthStatus?: 'official' | 'pending'
  nationalVolumeWan: number | null
  momPercent: number | null
  monthlyVolumeTrend: OfficialMonthlyVolumePoint[]
  provinceTop: OfficialProvinceTradePoint[]
  officialModelTopTen: OfficialModelTopItem[]
  transferRateTrend: OfficialTransferPoint[]
  managerIndexTrend: OfficialManagerIndexPoint[]
  sourceUrl: string
  updatedAt: string
  cachedAt?: string
  sourceFetchedAt?: string
  unavailableReason?: string
}

// 定义统一数据刷新来源摘要。
export interface UnifiedDataRefreshSourceSummary {
  sourceCount: number
  successCount: number
  failureCount: number
  failureReasons: string[]
}

// 定义官方和公开观察源统一刷新结果。
export interface UnifiedDataRefreshResponse {
  status: PipelineRunStatus
  trigger: DataRefreshTrigger
  month: string
  startedAt: string
  finishedAt: string
  official: OfficialUsedCarMarket
  pipelineRun: PipelineRun | null
  sourceCoverage: SourceCoverage
  sourceSummary: UnifiedDataRefreshSourceSummary
  message: string
}

// 定义最近统一刷新历史。
export interface UnifiedDataRefreshHistory {
  latest: UnifiedDataRefreshResponse | null
  startup: UnifiedDataRefreshResponse | null
  manual: UnifiedDataRefreshResponse | null
  scheduled: UnifiedDataRefreshResponse | null
}

// 定义自动刷新调度器的公开状态。
export interface DataRefreshSchedulerStatus {
  enabled: boolean
  started: boolean
  isRunning: boolean
  intervalMs: number
  targetMonth: string
  nextRunAt: string | null
}

// 定义统一数据刷新状态接口响应。
export interface DataRefreshStatusResponse {
  scheduler: DataRefreshSchedulerStatus
  history: UnifiedDataRefreshHistory
}

// 定义真实月度数据导入预览响应。
export interface ImportPreviewResponse {
  previewId: string | null
  month: string
  fileName: string
  recordCount: number
  validRecordCount: number
  warnings: string[]
  errors: string[]
  previewItems: VehicleRankItem[]
  expiresAt?: string
}

// 定义真实月度数据确认导入响应。
export interface ImportCommitResponse {
  month: string
  cacheFile: string
  importedFile: string
  run: PipelineRun
}

// 定义单个车型的授权图库目标配置。
export interface VehicleGalleryTarget {
  vehicleId: string
  brand: string
  model: string
  modelYears: string
  aliases: string[]
  yearHints: number[]
  generationHints: string[]
  kinds: GalleryAssetKind[]
  categoryKeywords: Record<GalleryAssetKind, string[]>
  commonsFileHints?: Partial<Record<GalleryAssetKind, string[]>>
}

// 定义候选图来源和匹配证据。
export interface GalleryCandidate {
  id: string
  vehicleId: string
  kind: GalleryAssetKind
  title: string
  fileUrl: string
  thumbnailUrl: string
  sourcePageUrl: string
  sourceProvider: string
  author: string
  licenseName: string
  licenseUrl: string
  width: number
  height: number
  mime: string
  description: string
  confidence: number
  evidence: string[]
  warnings: string[]
  discoveredAt: string
  reviewStatus: GalleryReviewStatus
  reviewedAt?: string
  reviewerNote?: string
}

// 定义已批准入库的授权图库资产。
export interface ApprovedGalleryAsset {
  id: string
  vehicleId: string
  kind: GalleryAssetKind
  quality: GalleryAssetQuality
  src: string
  localPath: string
  sourceProvider: string
  sourcePageUrl: string
  fileUrl: string
  author: string
  licenseName: string
  licenseUrl: string
  width: number
  height: number
  approvedAt: string
  reviewerNote?: string
  cropSelection?: GalleryCropSelection
  matchEvidence: string[]
  status: 'approved'
}

// 定义单个车型图库覆盖状态。
export interface GalleryStatusItem {
  vehicleId: string
  brand: string
  model: string
  modelYears: string
  coverage: Record<GalleryAssetKind, GalleryCoverageState>
  assets: Partial<Record<GalleryAssetKind, ApprovedGalleryAsset>>
  pendingCount: number
  rejectedCount: number
}

// 定义图库状态接口响应。
export interface GalleryStatusResponse {
  updatedAt: string
  targetCount: number
  assetCount: number
  preciseAssetCount: number
  referenceAssetCount: number
  pendingCandidateCount: number
  rejectedCandidateCount: number
  coverageRate: number
  totalCoverageRate: number
  targets: GalleryStatusItem[]
  candidates: GalleryCandidate[]
}

// 定义候选图发现接口响应。
export interface GalleryDiscoverResponse {
  discoveredCount: number
  addedCount: number
  skippedCount: number
  warnings: string[]
  candidates: GalleryCandidate[]
  status: GalleryStatusResponse
}

// 定义图库候选审核动作接口响应。
export interface GalleryCandidateActionResponse {
  candidate: GalleryCandidate
  asset?: ApprovedGalleryAsset
  status: GalleryStatusResponse
}

// 定义健康检查缓存摘要。
export interface ServiceHealthCacheStatus {
  exists: boolean
  path: string
  updatedAt?: string
  cachedAt?: string
  sourceFetchedAt?: string
  latestAvailableMonth?: string
  dataMode?: DataMode
  dataFreshness?: OfficialDataFreshness
  itemCount?: number
}

// 定义健康检查最近刷新摘要。
export interface ServiceHealthRefreshSummary {
  status: PipelineRunStatus
  trigger: DataRefreshTrigger
  month: string
  startedAt: string
  finishedAt: string
  message: string
  sourceSummary: UnifiedDataRefreshSourceSummary
}

// 定义健康检查 API 响应。
export interface ServiceHealthResponse {
  status: ServiceHealthStatus
  service: string
  version: string
  uptimeSeconds: number
  checkedAt: string
  currentMonth: string
  port: number
  officialCache: ServiceHealthCacheStatus
  rankingCache: ServiceHealthCacheStatus
  latestRefresh: ServiceHealthRefreshSummary | null
  sourceCoverage: SourceCoverage
  reasons: string[]
}

// 定义就绪检查路径状态。
export interface ServiceReadyPathStatus {
  name: string
  exists: boolean
  path: string
}

// 定义轻量就绪检查 API 响应。
export interface ServiceReadyResponse {
  ready: boolean
  checkedAt: string
  uptimeSeconds: number
  apiProcess: {
    pid: number
    uptimeSeconds: number
  }
  staticAssets: ServiceReadyPathStatus
  dataDirectories: ServiceReadyPathStatus[]
  reasons: string[]
}

// 定义抓取源归一化后的车型快照。
export interface SourceSnapshot {
  modelId: string
  sourceId: string
  listingCount: number
  soldHintCount: number
  capturedAt: string
}

// 定义公开源抓取适配器的统一接口。
export interface SourceAdapter {
  id: string
  name: string
  url: string
  fetch: () => Promise<string>
  normalize: (html: string) => SourceSnapshot[]
  validate: (html: string) => SourceStatus
}

// 定义一次导入或抓取管线任务记录。
export interface PipelineRun {
  id: string
  month: string
  dataMode: DataMode
  status: PipelineRunStatus
  startedAt: string
  finishedAt: string
  sources: SourceStatus[]
  importedFile?: string
  cacheFile?: string
  successCount: number
  failureCount: number
  messages: string[]
}

// 定义榜单请求参数。
export interface RankingQuery {
  month: string
  scope: RankingScope
  metric: RankingMetric
  priceMin: number
  priceMax: number
}

// 定义榜单接口响应。
export interface RankingResponse {
  items: VehicleRankItem[]
  scope: RankingScope
  metric: RankingMetric
  month: string
  updatedAt: string
  notice: string
  dataMode: DataMode
  sourceCoverage: SourceCoverage
  pipelineRunId?: string
}

// 定义来源状态接口响应。
export interface SourceStatusResponse {
  sources: SourceStatus[]
  latestRun: PipelineRun | null
  dataMode: DataMode
  sourceCoverage: SourceCoverage
  dataRefresh?: UnifiedDataRefreshHistory
}
