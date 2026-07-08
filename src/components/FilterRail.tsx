import { RotateCcw } from 'lucide-react'
import { PRICE_PRESETS, type PricePresetId } from '../lib/tableControls'
import type {
  DataMode,
  MonthOption,
  OfficialUsedCarMarket,
  PipelineRun,
  RankingQuery,
  SourceStatus,
  SourceStatusResponse,
  UnifiedDataRefreshResponse,
} from '../types'

interface FilterRailProps {
  query: RankingQuery
  monthOptions: MonthOption[]
  pricePreset: PricePresetId
  sourceStatus: SourceStatusResponse
  officialMarket: OfficialUsedCarMarket
  lastUnifiedRefresh: UnifiedDataRefreshResponse | null
  refreshMessage: string
  onScopeChange: (scope: RankingQuery['scope']) => void
  onMonthChange: (month: string) => void
  onPricePresetChange: (pricePreset: PricePresetId) => void
  onResetFilters: () => void
  onOpenSourceMonitor: () => void
  onOpenMethodology: () => void
}

// 将来源状态映射为展示文案。
function getHealthLabel(health: SourceStatus['health']) {
  if (health === 'normal') {
    return '正常'
  }

  if (health === 'partial') {
    return '部分延迟'
  }

  if (health === 'blocked') {
    return '受限'
  }

  return '离线'
}

// 将数据模式映射为左栏说明文案。
function getDataModeLabel(dataMode: DataMode) {
  if (dataMode === 'official') {
    return '官方CADA数据'
  }

  if (dataMode === 'live') {
    return '真实抓取'
  }

  if (dataMode === 'imported') {
    return '导入数据'
  }

  if (dataMode === 'unavailable') {
    return '暂无真实数据'
  }

  return '示例数据'
}

// 生成最近管线任务的简短说明。
function getLatestRunText(run: PipelineRun | null) {
  if (!run) {
    return '暂无管线任务'
  }

  return `${run.status} / ${run.finishedAt}`
}

// 格式化官方缓存和获取时间。
function formatOfficialDateTime(value: string | undefined) {
  if (!value) {
    return '暂无'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-CN', { hour12: false })
}

// 根据 CADA 官方响应生成左栏健康状态。
function getOfficialHealth(officialMarket: OfficialUsedCarMarket): SourceStatus['health'] {
  if (officialMarket.dataFreshness === 'unavailable') {
    return 'offline'
  }

  if (officialMarket.dataFreshness === 'cached' || officialMarket.unavailableReason) {
    return 'partial'
  }

  return 'normal'
}

// 根据 CADA 官方响应生成左栏状态文案。
function getOfficialNote(officialMarket: OfficialUsedCarMarket) {
  if (officialMarket.dataFreshness === 'fresh') {
    return `实时官方数据，最新可用月 ${officialMarket.latestAvailableMonth}。`
  }

  if (officialMarket.dataFreshness === 'cached') {
    return `缓存官方数据，缓存时间 ${formatOfficialDateTime(officialMarket.cachedAt)}。${officialMarket.unavailableReason ?? ''}`
  }

  return officialMarket.unavailableReason ?? '官方数据暂不可用。'
}

// 格式化统一刷新记录时间和状态。
function formatRefreshRecord(refresh: UnifiedDataRefreshResponse | null | undefined) {
  if (!refresh) {
    return '暂无'
  }

  return `${refresh.status} / ${formatOfficialDateTime(refresh.finishedAt)}`
}

// 从统一刷新结果中提取失败原因。
function getRefreshFailureReasons(refresh: UnifiedDataRefreshResponse | null, officialMarket: OfficialUsedCarMarket) {
  const officialReason = officialMarket.unavailableReason ? [`CADA：${officialMarket.unavailableReason}`] : []
  const sourceReasons = refresh?.sourceSummary.failureReasons ?? []
  return [...officialReason, ...sourceReasons].slice(0, 3)
}

// 渲染左侧筛选条件、来源监控和数据说明栏。
export function FilterRail({
  query,
  monthOptions,
  pricePreset,
  sourceStatus,
  officialMarket,
  lastUnifiedRefresh,
  refreshMessage,
  onScopeChange,
  onMonthChange,
  onPricePresetChange,
  onResetFilters,
  onOpenSourceMonitor,
  onOpenMethodology,
}: FilterRailProps) {
  const { sources, latestRun, dataMode, sourceCoverage } = sourceStatus
  const officialHealth = getOfficialHealth(officialMarket)
  const latestRefresh = lastUnifiedRefresh ?? sourceStatus.dataRefresh?.latest ?? null
  const startupRefresh = sourceStatus.dataRefresh?.startup ?? (latestRefresh?.trigger === 'startup' ? latestRefresh : null)
  const manualRefresh = sourceStatus.dataRefresh?.manual ?? (latestRefresh?.trigger === 'manual' ? latestRefresh : null)
  const failureReasons = getRefreshFailureReasons(latestRefresh, officialMarket)
  const selectedMonth = monthOptions.find((option) => option.id === query.month)

  return (
    <aside className="filter-rail" aria-label="筛选条件">
      <section className="rail-section">
        <div className="rail-title-row">
          <h2>筛选条件</h2>
          <button className="text-button" type="button" onClick={onResetFilters}>
            <RotateCcw size={14} />
            重置
          </button>
        </div>

        <label className="select-field">
          <span>统计周期</span>
          <select value={query.month} aria-label="统计周期" onChange={(event) => onMonthChange(event.target.value)}>
            {monthOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.statusLabel}
              </option>
            ))}
          </select>
          <em>{selectedMonth?.note ?? '正在读取今年月份数据状态'}</em>
        </label>

        <label className="select-field">
          <span>地区</span>
          <select value="全国" aria-label="地区" disabled>
            <option>全国</option>
          </select>
          <em>暂仅支持全国口径</em>
        </label>

        <label className="select-field">
          <span>车型级别</span>
          <select value="SUV" aria-label="车型级别" disabled>
            <option>SUV</option>
          </select>
          <em>当前产品定位为二手SUV</em>
        </label>

        <label className="select-field">
          <span>价格区间</span>
          <select
            value={pricePreset}
            aria-label="价格区间"
            onChange={(event) => onPricePresetChange(event.target.value as PricePresetId)}
          >
            {PRICE_PRESETS.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.label}
              </option>
            ))}
          </select>
        </label>

        <label className="select-field">
          <span>数据来源</span>
          <select value="价值榜观察源 + CADA官方大盘" aria-label="数据来源" disabled>
            <option>价值榜观察源 + CADA官方大盘</option>
          </select>
          <em>官方销量只在CADA大盘展示</em>
        </label>

        <div className="scope-toggle" role="group" aria-label="榜单口径">
          <button
            className={query.scope === 'mtd' ? 'active' : ''}
            type="button"
            onClick={() => onScopeChange('mtd')}
          >
            本月至今
          </button>
          <button
            className={query.scope === 'complete' ? 'active' : ''}
            type="button"
            onClick={() => onScopeChange('complete')}
          >
            完整月参考
          </button>
        </div>
      </section>

      <section className="rail-section">
        <div className="rail-title-row">
          <h2>官方与公开观察</h2>
          <span>覆盖 {sourceCoverage.availableSourceCount}/{sourceCoverage.sourceCount}</span>
        </div>
        <div className={`rail-data-mode official ${officialMarket.dataFreshness}`}>
          <strong>{getDataModeLabel('official')}</strong>
          <span>{getOfficialNote(officialMarket)}</span>
        </div>
        <ul className="source-list">
          <li>
            <span className={`health-dot ${officialHealth}`} />
            <span>CADA官方公开数据</span>
            <strong>{getHealthLabel(officialHealth)}</strong>
            <em>{officialMarket.latestAvailableMonth}</em>
          </li>
          {sources.map((source) => (
            <li key={source.id}>
              <span className={`health-dot ${source.health}`} />
              <span>{source.name}</span>
              <strong>{getHealthLabel(source.health)}</strong>
              <em>{source.sampleCount}</em>
            </li>
          ))}
        </ul>
        {failureReasons.length > 0 ? (
          <div className="source-issue-list">
            {failureReasons.map((reason) => (
              <p key={reason}>{reason}</p>
            ))}
          </div>
        ) : null}
        <button className="link-row" type="button" onClick={onOpenSourceMonitor}>
          查看公开观察源
        </button>
      </section>

      <section className="rail-section">
        <h2>数据说明</h2>
        <ul className="note-list">
          <li>官方销量源：{getDataModeLabel('official')}。</li>
          <li>价值榜来源：{getDataModeLabel(dataMode)}。</li>
          <li>最近任务：{getLatestRunText(latestRun)}。</li>
          <li>启动自动刷新：{formatRefreshRecord(startupRefresh)}。</li>
          <li>最近手动刷新：{formatRefreshRecord(manualRefresh)}。</li>
          <li>CADA缓存时间：{formatOfficialDateTime(officialMarket.cachedAt)}。</li>
          <li>统一刷新状态：{refreshMessage || latestRefresh?.message || '等待刷新任务'}</li>
          <li>公开观察源受限时会使用导入缓存或示例兜底。</li>
          <li>10-20万二手SUV价值榜非官方销量榜。</li>
        </ul>
        <button className="link-row" type="button" onClick={onOpenMethodology}>
          查看口径详情
        </button>
      </section>
    </aside>
  )
}
