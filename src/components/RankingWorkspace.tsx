import type { MouseEvent, ReactNode } from 'react'
import {
  ArrowDown,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ExternalLink,
  GitCompareArrows,
  Info,
  Plus,
  Star,
  X,
} from 'lucide-react'
import type { PageSize, PaginatedItems, RankingSortKey, RankingTableState } from '../lib/tableControls'
import type {
  DataMode,
  ImportCommitResponse,
  MonthOption,
  OfficialUsedCarMarket,
  RankingResponse,
  SourceStatus,
  SourceStatusResponse,
  UnifiedDataRefreshResponse,
  VehicleRankItem,
  WorkspaceView,
} from '../types'
import { getDataModeLabel } from '../lib/dataMode'
import { getVehicleImagePath } from '../lib/vehicleImages'
import { DataImportPanel } from './DataImportPanel'
import { GalleryAuditPanel } from './GalleryAuditPanel'
import { OfficialMarketDashboard } from './OfficialMarketDashboard'

interface RankingWorkspaceProps {
  ranking: RankingResponse
  paginatedRanking: PaginatedItems<VehicleRankItem>
  tableState: RankingTableState
  officialMarket: OfficialUsedCarMarket
  sourceStatus: SourceStatusResponse
  lastUnifiedRefresh: UnifiedDataRefreshResponse | null
  currentMonth: string
  monthOptions: MonthOption[]
  activeView: WorkspaceView
  selectedId: string
  favoriteIds: string[]
  compareIds: string[]
  compareItems: VehicleRankItem[]
  compareNotice: string
  onViewChange: (view: WorkspaceView) => void
  onSortChange: (sortKey: RankingSortKey) => void
  onPageChange: (page: number) => void
  onPageSizeChange: (pageSize: PageSize) => void
  onSelectVehicle: (vehicle: VehicleRankItem) => void
  onToggleCompare: (vehicleId: string) => void
  onImportCommitted: (result: ImportCommitResponse) => Promise<void> | void
}

// 格式化价格区间。
function formatPriceRange(item: VehicleRankItem) {
  return `${(item.priceMin / 10000).toFixed(1)}-${(item.priceMax / 10000).toFixed(1)}`
}

// 格式化车龄里程。
function formatAgeMileage(item: VehicleRankItem) {
  return `${item.ageYears.toFixed(1)}年 / ${item.mileageWanKm.toFixed(1)}万公里`
}

// 格式化车型平均参考价。
function formatAveragePrice(item: VehicleRankItem) {
  return `${(((item.priceMin + item.priceMax) / 2) / 10000).toFixed(1)}万`
}

// 格式化来源监控中的时间。
function formatDateTime(value: string | undefined) {
  if (!value) {
    return '暂无'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-CN', { hour12: false })
}

// 将来源健康状态映射为中文文案。
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

// 根据排名输出奖牌样式。
function getRankClass(rank = 0) {
  if (rank <= 3) {
    return `rank-badge top-${rank}`
  }

  return 'rank-badge'
}

// 根据风险等级输出风险标签样式。
function getRiskClass(riskLevel: VehicleRankItem['riskLevel']) {
  if (riskLevel === '低') {
    return 'risk-tag low'
  }

  if (riskLevel === '高') {
    return 'risk-tag high'
  }

  return 'risk-tag medium'
}

// 生成百分比条形的安全宽度。
function getMetricBarWidth(value = 0) {
  return `${Math.max(6, Math.min(100, value))}%`
}

// 生成本地分页按钮列表。
function buildPageButtons(currentPage: number, totalPages: number) {
  const maxButtons = 5
  const halfWindow = Math.floor(maxButtons / 2)
  const start = Math.max(1, Math.min(currentPage - halfWindow, totalPages - maxButtons + 1))
  const end = Math.min(totalPages, start + maxButtons - 1)

  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

// 根据当前排序状态渲染排序图标。
function renderSortIcon(tableState: RankingTableState, sortKey: RankingSortKey) {
  if (tableState.sortKey !== sortKey) {
    return <ArrowDownUp size={13} />
  }

  return tableState.sortDirection === 'asc' ? <ArrowUp size={13} /> : <ArrowDown size={13} />
}

// 判断表头排序按钮是否处于激活态。
function getSortButtonClass(tableState: RankingTableState, sortKey: RankingSortKey) {
  return tableState.sortKey === sortKey ? 'sort-button active' : 'sort-button'
}

// 汇总价格带分布用于价格走势视图。
function buildPriceBandRows(items: VehicleRankItem[]) {
  const bandMap = new Map<string, { totalShare: number; count: number }>()

  items.forEach((item) => {
    item.priceDistribution.forEach((point) => {
      const current = bandMap.get(point.label) ?? { totalShare: 0, count: 0 }
      bandMap.set(point.label, {
        totalShare: current.totalShare + point.share,
        count: current.count + 1,
      })
    })
  })

  return Array.from(bandMap.entries()).map(([label, value]) => ({
    label,
    averageShare: Math.round(value.totalShare / Math.max(1, value.count)),
  }))
}

// 渲染价格走势和价格带结构视图。
function renderPriceTrendView(items: VehicleRankItem[], dataMode: DataMode) {
  const compactItems = items.slice(0, 6)
  const priceBandRows = buildPriceBandRows(items)

  return (
    <section className="workspace-subview" aria-label="价格走势">
      <div className="section-title-row">
        <h2>价格走势</h2>
        <span>{getDataModeLabel(dataMode)} · 参考价区间</span>
      </div>
      <div className="price-band-grid" aria-label="价格带结构">
        {priceBandRows.map((row) => (
          <div className="price-band-card" key={row.label}>
            <span>{row.label}万</span>
            <strong>{row.averageShare}%</strong>
            <div className="bar-track">
              <i style={{ width: getMetricBarWidth(row.averageShare) }} />
            </div>
          </div>
        ))}
      </div>
      <div className="price-trend-list">
        {compactItems.map((item) => (
          <div className="price-trend-row" key={item.id}>
            <strong>{`${item.brand} ${item.model}`}</strong>
            <span>{formatPriceRange(item)}万</span>
            <div className="bar-track">
              <i style={{ width: getMetricBarWidth(item.valueScore) }} />
            </div>
            <em>均价 {formatAveragePrice(item)} / 综合价值分 {item.valueScore}</em>
          </div>
        ))}
      </div>
    </section>
  )
}

// 渲染来源监控详情视图。
function renderSourceMonitorView(
  ranking: RankingResponse,
  sourceStatus: SourceStatusResponse,
  officialMarket: OfficialUsedCarMarket,
  lastUnifiedRefresh: UnifiedDataRefreshResponse | null,
) {
  const latestRefresh = lastUnifiedRefresh ?? sourceStatus.dataRefresh?.latest ?? null

  return (
    <section className="workspace-subview" aria-label="来源监控">
      <div className="section-title-row">
        <h2>来源监控</h2>
        <span>{getDataModeLabel(ranking.dataMode)}</span>
      </div>
      <div className="source-summary-grid">
        <div>
          <span>来源覆盖</span>
          <strong>
            {ranking.sourceCoverage.availableSourceCount}/{ranking.sourceCoverage.sourceCount}
          </strong>
        </div>
        <div>
          <span>样本量</span>
          <strong>{ranking.sourceCoverage.sampleCount}</strong>
        </div>
        <div>
          <span>导入记录</span>
          <strong>{ranking.sourceCoverage.importedRecordCount}</strong>
        </div>
      </div>
      <p>{ranking.sourceCoverage.modeNote}</p>
      <p>公开观察源只参与价值榜参考，不参与 CADA 官方销量字段。</p>
      <div className="source-monitor-layout">
        <div className="source-monitor-table">
          <div className="source-monitor-row official">
            <span className={`health-dot ${officialMarket.dataFreshness === 'fresh' ? 'normal' : 'partial'}`} />
            <strong>CADA官方公开数据</strong>
            <em>{officialMarket.latestAvailableMonth}</em>
            <b>{officialMarket.dataFreshness === 'fresh' ? '实时官方数据' : '缓存/降级数据'}</b>
            <a href={officialMarket.sourceUrl} target="_blank" rel="noreferrer" aria-label="打开 CADA 来源页">
              <ExternalLink size={14} />
            </a>
          </div>
          {sourceStatus.sources.map((source) => (
            <div className="source-monitor-row" key={source.id}>
              <span className={`health-dot ${source.health}`} />
              <strong>{source.name}</strong>
              <em>{source.freshness}</em>
              <b>
                {getHealthLabel(source.health)} · {source.sampleCount} 条
              </b>
              <a href={source.url} target="_blank" rel="noreferrer" aria-label={`打开${source.name}`}>
                <ExternalLink size={14} />
              </a>
              <small>{source.note}</small>
            </div>
          ))}
        </div>
        <div className="refresh-card">
          <span>最近统一刷新</span>
          <strong>{latestRefresh ? latestRefresh.status : '暂无'}</strong>
          <em>{formatDateTime(latestRefresh?.finishedAt)}</em>
          <p>{latestRefresh?.message ?? '等待服务端刷新记录。'}</p>
        </div>
      </div>
    </section>
  )
}

// 判断车型是否已经在对比清单中。
function isCompared(compareIds: string[], vehicleId: string) {
  return compareIds.includes(vehicleId)
}

// 渲染对比清单中的单个指标行。
function renderCompareMetricRow(
  label: string,
  items: VehicleRankItem[],
  renderValue: (item: VehicleRankItem) => ReactNode,
) {
  return (
    <tr>
      <th>{label}</th>
      {items.map((item) => (
        <td key={`${label}-${item.id}`}>{renderValue(item)}</td>
      ))}
    </tr>
  )
}

// 渲染多车型对比清单视图。
function renderCompareView(
  rankingItems: VehicleRankItem[],
  compareItems: VehicleRankItem[],
  favoriteIds: string[],
  compareIds: string[],
  compareNotice: string,
  onToggleCompare: (vehicleId: string) => void,
  onSelectVehicle: (vehicle: VehicleRankItem) => void,
) {
  const candidates = rankingItems.filter((item) => !isCompared(compareIds, item.id)).slice(0, 6)

  return (
    <section className="workspace-subview compare-view" aria-label="对比清单">
      <div className="section-title-row">
        <h2>对比清单</h2>
        <span>最多 4 款 · 从当前价格区间中选择</span>
      </div>
      {compareNotice ? <p className="compare-notice">{compareNotice}</p> : null}
      {compareItems.length > 0 ? (
        <>
          <div className="compare-card-grid">
            {compareItems.map((item) => (
              <article className="compare-card" key={item.id}>
                <button
                  className="compare-remove-button"
                  type="button"
                  aria-label={`移出${item.brand}${item.model}`}
                  onClick={() => onToggleCompare(item.id)}
                >
                  <X size={14} />
                </button>
                <img src={getVehicleImagePath(item)} alt={`${item.brand} ${item.model}实车图`} />
                <div className="compare-card-heading">
                  <span className={getRankClass(item.rank)}>{item.rank}</span>
                  <div>
                    <h3>{`${item.brand} ${item.model}`}</h3>
                    <p>{item.modelYears}款</p>
                  </div>
                  {favoriteIds.includes(item.id) ? <Star size={15} className="favorite-star" fill="currentColor" /> : null}
                </div>
                <dl>
                  <div>
                    <dt>均价</dt>
                    <dd>{formatAveragePrice(item)}</dd>
                  </div>
                  <div>
                    <dt>综合分</dt>
                    <dd>{item.valueScore}</dd>
                  </div>
                  <div>
                    <dt>风险</dt>
                    <dd>
                      <span className={getRiskClass(item.riskLevel)}>{item.riskLevel}</span>
                    </dd>
                  </div>
                </dl>
                <button className="link-row" type="button" onClick={() => onSelectVehicle(item)}>
                  查看画像
                </button>
              </article>
            ))}
          </div>
          <div className="compare-table-wrap">
            <table className="compare-table">
              <tbody>
                {renderCompareMetricRow('参考价', compareItems, (item) => `${formatPriceRange(item)}万`)}
                {renderCompareMetricRow('保值率', compareItems, (item) => `${item.retentionRate}%`)}
                {renderCompareMetricRow('车龄里程', compareItems, formatAgeMileage)}
                {renderCompareMetricRow('来源置信度', compareItems, (item) => item.sourceConfidence)}
                {renderCompareMetricRow('样本量', compareItems, (item) => item.sampleSize)}
                {renderCompareMetricRow('风险等级', compareItems, (item) => (
                  <span className={getRiskClass(item.riskLevel)}>{item.riskLevel}</span>
                ))}
                {renderCompareMetricRow('采购建议', compareItems, (item) => item.advice)}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="compare-empty-state">
          <GitCompareArrows size={26} />
          <strong>还没有加入对比车型</strong>
          <span>从下方候选车型中加入，或回到综合价值榜选择。</span>
        </div>
      )}
      <div className="compare-candidate-list" aria-label="可加入对比车型">
        {candidates.map((item) => (
          <button className="compare-add-button" type="button" key={item.id} onClick={() => onToggleCompare(item.id)}>
            <Plus size={14} />
            {`${item.brand} ${item.model}`}
          </button>
        ))}
      </div>
    </section>
  )
}

// 渲染榜单工作区和高密度排序表格。
export function RankingWorkspace({
  ranking,
  paginatedRanking,
  tableState,
  officialMarket,
  sourceStatus,
  lastUnifiedRefresh,
  currentMonth,
  monthOptions,
  activeView,
  selectedId,
  favoriteIds,
  compareIds,
  compareItems,
  compareNotice,
  onViewChange,
  onSortChange,
  onPageChange,
  onPageSizeChange,
  onSelectVehicle,
  onToggleCompare,
  onImportCommitted,
}: RankingWorkspaceProps) {
  const pageButtons = buildPageButtons(paginatedRanking.page, paginatedRanking.totalPages)

  // 通过车型单元格按钮选择右侧画像并阻止触发整行点击。
  function handleModelCellSelect(event: MouseEvent<HTMLButtonElement>, item: VehicleRankItem) {
    event.stopPropagation()
    onSelectVehicle(item)
  }

  return (
    <main className="workspace" id="main-content" tabIndex={-1}>
      <div className="workspace-heading">
        <div>
          <h1>10-20万二手SUV价值终端</h1>
          <p>综合价值榜非官方销量榜，官方销量仅展示 CADA 二手车大盘</p>
        </div>
        <div className="scope-caption">
          <span>{ranking.month}</span>
          <strong>{ranking.scope === 'mtd' ? '价值榜本月至今' : '价值榜完整月参考'}</strong>
        </div>
      </div>

      <div className={`data-mode-strip ${ranking.dataMode}`}>
        <strong>价值榜：{getDataModeLabel(ranking.dataMode)}</strong>
        <span>{ranking.notice}</span>
        <em>
          官方大盘：CADA {officialMarket.latestAvailableMonth}
          {officialMarket.unavailableReason ? ' · 暂不可用' : ''}
        </em>
      </div>

      <div className="primary-tabs" role="tablist" aria-label="榜单视图">
        <button
          className={activeView === 'value' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeView === 'value'}
          onClick={() => onViewChange('value')}
        >
          综合价值榜
        </button>
        <button
          className={activeView === 'official' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeView === 'official'}
          onClick={() => onViewChange('official')}
        >
          官方二手车大盘
        </button>
        <button
          className={activeView === 'price' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeView === 'price'}
          onClick={() => onViewChange('price')}
        >
          价格走势
        </button>
        <button
          className={activeView === 'sources' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeView === 'sources'}
          onClick={() => onViewChange('sources')}
        >
          来源监控
        </button>
        <button
          className={activeView === 'compare' ? 'active' : ''}
          type="button"
          role="tab"
          aria-selected={activeView === 'compare'}
          onClick={() => onViewChange('compare')}
        >
          对比清单
          {compareIds.length > 0 ? <span className="tab-count">{compareIds.length}</span> : null}
        </button>
      </div>

      {activeView === 'official' ? <OfficialMarketDashboard market={officialMarket} /> : null}
      {activeView === 'price' ? renderPriceTrendView(ranking.items, ranking.dataMode) : null}
      {activeView === 'sources' ? (
        <>
          {renderSourceMonitorView(ranking, sourceStatus, officialMarket, lastUnifiedRefresh)}
          <DataImportPanel currentMonth={currentMonth} monthOptions={monthOptions} onImportCommitted={onImportCommitted} />
          <GalleryAuditPanel />
        </>
      ) : null}
      {activeView === 'compare'
        ? renderCompareView(
          ranking.items,
          compareItems,
          favoriteIds,
          compareIds,
          compareNotice,
          onToggleCompare,
          onSelectVehicle,
        )
        : null}

      {activeView !== 'value' ? null : (
      <section className="table-shell" aria-label="SUV 月度榜单">
        <div className="table-scroll">
          <table className="ranking-table">
            <thead>
              <tr>
                <th>排名</th>
                <th className="model-heading">车型</th>
                <th>年款</th>
                <th>
                  <button
                    className={getSortButtonClass(tableState, 'averagePrice')}
                    type="button"
                    onClick={() => onSortChange('averagePrice')}
                  >
                    <span>参考价(万)</span>
                    {renderSortIcon(tableState, 'averagePrice')}
                  </button>
                </th>
                <th>
                  <button
                    className={getSortButtonClass(tableState, 'retentionRate')}
                    type="button"
                    onClick={() => onSortChange('retentionRate')}
                  >
                    <span>保值率</span>
                    {renderSortIcon(tableState, 'retentionRate')}
                    <Info size={13} />
                  </button>
                </th>
                <th>
                  <button
                    className={getSortButtonClass(tableState, 'ageMileage')}
                    type="button"
                    onClick={() => onSortChange('ageMileage')}
                  >
                    <span>车龄里程</span>
                    {renderSortIcon(tableState, 'ageMileage')}
                  </button>
                </th>
                <th>
                  <button
                    className={getSortButtonClass(tableState, 'sourceConfidence')}
                    type="button"
                    onClick={() => onSortChange('sourceConfidence')}
                  >
                    <span>来源置信度</span>
                    {renderSortIcon(tableState, 'sourceConfidence')}
                  </button>
                </th>
                <th>
                  <button
                    className={getSortButtonClass(tableState, 'valueScore')}
                    type="button"
                    onClick={() => onSortChange('valueScore')}
                  >
                    <span>综合价值分</span>
                    {renderSortIcon(tableState, 'valueScore')}
                  </button>
                </th>
                <th>数据源</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRanking.items.map((item) => (
                <tr
                  key={item.id}
                  className={item.id === selectedId ? 'selected-row' : ''}
                  onClick={() => onSelectVehicle(item)}
                >
                  <td>
                    <span className={getRankClass(item.rank)}>{item.rank}</span>
                  </td>
                  <td>
                    <button
                      className="model-cell model-select-button"
                      type="button"
                      aria-label={`查看${item.brand}${item.model}车型画像`}
                      onClick={(event) => handleModelCellSelect(event, item)}
                    >
                      <img src={getVehicleImagePath(item)} alt={`${item.brand} ${item.model} 缩略图`} />
                      <span>{`${item.brand} ${item.model}`}</span>
                    </button>
                  </td>
                  <td>{item.modelYears}</td>
                  <td>{formatPriceRange(item)}万</td>
                  <td>{item.retentionRate}%</td>
                  <td>{formatAgeMileage(item)}</td>
                  <td>{item.sourceConfidence}</td>
                  <td className="strong-cell">{item.valueScore}</td>
                  <td>{item.sources.slice(0, 2).join(' / ')}</td>
                </tr>
              ))}
              {paginatedRanking.items.length === 0 ? (
                <tr>
                  <td colSpan={9}>
                    <div className="empty-table-state">当前价格区间暂无车型数据</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <div className="table-footer">
          <div className="pagination-summary">
            <strong>共 {paginatedRanking.totalItems} 条</strong>
            <span>
              第 {paginatedRanking.page}/{paginatedRanking.totalPages} 页
            </span>
            <em>非官方销量榜</em>
          </div>
          <div className="pagination-actions">
            <nav className="pagination-nav" aria-label="分页">
              <button
                className="page-button"
                type="button"
                aria-label="上一页"
                disabled={paginatedRanking.page <= 1}
                onClick={() => onPageChange(paginatedRanking.page - 1)}
              >
                <ArrowLeft size={13} />
              </button>
              {pageButtons.map((page) => (
                <button
                  className={page === paginatedRanking.page ? 'page-button active' : 'page-button'}
                  type="button"
                  key={page}
                  onClick={() => onPageChange(page)}
                >
                  {page}
                </button>
              ))}
              <button
                className="page-button"
                type="button"
                aria-label="下一页"
                disabled={paginatedRanking.page >= paginatedRanking.totalPages}
                onClick={() => onPageChange(paginatedRanking.page + 1)}
              >
                <ArrowRight size={13} />
              </button>
            </nav>
            <label className="page-size-control">
              <span>每页</span>
              <select
                value={paginatedRanking.pageSize}
                aria-label="每页条数"
                onChange={(event) => onPageSizeChange(Number(event.target.value) as PageSize)}
              >
                <option value="10">10 条</option>
                <option value="20">20 条</option>
                <option value="50">50 条</option>
              </select>
            </label>
            <label className="page-jump-control">
              <span>跳至</span>
              <input
                min="1"
                max={paginatedRanking.totalPages}
                type="number"
                value={paginatedRanking.page}
                aria-label="页码"
                onChange={(event) => onPageChange(Number(event.target.value))}
              />
              <span>页</span>
            </label>
          </div>
        </div>
      </section>
      )}
    </main>
  )
}
