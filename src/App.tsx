import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomPanels } from './components/BottomPanels'
import { FilterRail } from './components/FilterRail'
import { MethodologyDialog } from './components/MethodologyDialog'
import { RankingWorkspace } from './components/RankingWorkspace'
import { TerminalHeader } from './components/TerminalHeader'
import { VehicleInspector } from './components/VehicleInspector'
import { buildRankingCsv } from './lib/csv'
import { downloadCsv } from './lib/download'
import { createRankingResponse, defaultRankingQuery, sampleSourceCoverage } from './lib/rankingEngine'
import {
  buildInitialCompareIds,
  parseStoredIdList,
  selectVehiclesByIds,
  stringifyIdList,
  toggleFavoriteId,
  updateCompareIds,
} from './lib/selectionLists'
import {
  createDefaultRankingTableState,
  getNextSortState,
  getPricePresetRange,
  paginateItems,
  sortVehicles,
  type PageSize,
  type PricePresetId,
  type RankingSortKey,
} from './lib/tableControls'
import { mergeVehicleDetailWithRankingItem } from './lib/vehicleDetails'
import {
  fetchDataRefreshStatus,
  fetchOfficialUsedCarMarket,
  fetchMonthOptions,
  fetchRankings,
  fetchSourceStatuses,
  fetchVehicle,
  refreshUnifiedData,
} from './services/rankingsApi'
import type {
  DataRefreshStatusResponse,
  ImportCommitResponse,
  MonthOption,
  OfficialUsedCarMarket,
  RankingQuery,
  RankingResponse,
  SourceStatusResponse,
  UnifiedDataRefreshResponse,
  VehicleRankItem,
  WorkspaceView,
} from './types'
import './App.css'

// 定义收藏车型在浏览器本地存储中的键名。
const FAVORITE_STORAGE_KEY = 'yuezhi.favoriteVehicleIds'

// 定义对比车型在浏览器本地存储中的键名。
const COMPARE_STORAGE_KEY = 'yuezhi.compareVehicleIds'

// 根据月份 ID 构建加载中的月份选项。
function buildLoadingMonthOption(month: string): MonthOption {
  const [year, monthIndex] = month.split('-')

  return {
    id: month,
    label: `${year}年${Number(monthIndex)}月`,
    status: 'pending',
    statusLabel: '读取中',
    note: '正在读取今年月份数据状态。',
    hasRankingCache: false,
    officialVolumeWan: null,
    officialMomPercent: null,
    isCurrentMonth: false,
    isLatestOfficialMonth: false,
  }
}

// 从月份 ID 中读取年份。
function getYearFromMonth(month: string) {
  const year = Number(month.slice(0, 4))
  return Number.isFinite(year) ? year : new Date().getFullYear()
}

// 从浏览器本地存储中读取车型 ID 列表。
function readIdListFromStorage(storageKey: string) {
  if (typeof window === 'undefined') {
    return []
  }

  return parseStoredIdList(window.localStorage.getItem(storageKey))
}

// 将车型 ID 列表写入浏览器本地存储。
function writeIdListToStorage(storageKey: string, ids: string[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(storageKey, stringifyIdList(ids))
}

// 构建官方大盘加载前的初始状态。
function buildInitialOfficialMarket(): OfficialUsedCarMarket {
  return {
    dataMode: 'official',
    dataFreshness: 'unavailable',
    officialSource: 'CADA',
    latestAvailableMonth: '加载中',
    nationalVolumeWan: null,
    momPercent: null,
    monthlyVolumeTrend: [],
    provinceTop: [],
    officialModelTopTen: [],
    transferRateTrend: [],
    managerIndexTrend: [],
    sourceUrl: 'https://data.cada.cn/main/usedCar.do',
    updatedAt: '加载中',
    unavailableReason: '正在加载官方数据。',
  }
}

// 渲染月值好车的终端式主应用。
function App() {
  const [query, setQuery] = useState<RankingQuery>(defaultRankingQuery)
  const [tableState, setTableState] = useState(() => createDefaultRankingTableState())
  const [activeView, setActiveView] = useState<WorkspaceView>('value')
  const [ranking, setRanking] = useState<RankingResponse>(() => createRankingResponse(defaultRankingQuery))
  const [officialMarket, setOfficialMarket] = useState<OfficialUsedCarMarket>(() => buildInitialOfficialMarket())
  const [sourceStatus, setSourceStatus] = useState<SourceStatusResponse>({
    sources: [],
    latestRun: null,
    dataMode: 'sample',
    sourceCoverage: sampleSourceCoverage,
  })
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleRankItem | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshingData, setIsRefreshingData] = useState(false)
  const [lastUnifiedRefresh, setLastUnifiedRefresh] = useState<UnifiedDataRefreshResponse | null>(null)
  const [dataRefreshStatus, setDataRefreshStatus] = useState<DataRefreshStatusResponse | null>(null)
  const [refreshMessage, setRefreshMessage] = useState('')
  const [isMethodOpen, setIsMethodOpen] = useState(false)
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>(() => [buildLoadingMonthOption(defaultRankingQuery.month)])
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => readIdListFromStorage(FAVORITE_STORAGE_KEY))
  const [compareIds, setCompareIds] = useState<string[]>(() => readIdListFromStorage(COMPARE_STORAGE_KEY))
  const [compareNotice, setCompareNotice] = useState('')
  const dashboardRequestIdRef = useRef(0)

  // 根据排序状态生成当前展示顺序。
  const sortedRankingItems = useMemo(
    () => sortVehicles(ranking.items, tableState.sortKey, tableState.sortDirection),
    [ranking.items, tableState.sortDirection, tableState.sortKey],
  )

  // 根据分页状态生成当前页车型。
  const paginatedRanking = useMemo(
    () => paginateItems(sortedRankingItems, tableState.page, tableState.pageSize),
    [sortedRankingItems, tableState.page, tableState.pageSize],
  )

  // 根据当前榜单确定右侧车型详情。
  const activeVehicle = useMemo(
    () => selectedVehicle ?? paginatedRanking.items[0] ?? sortedRankingItems[0] ?? null,
    [paginatedRanking.items, selectedVehicle, sortedRankingItems],
  )

  // 根据对比清单 ID 生成当前可对比车型。
  const compareItems = useMemo(
    () => selectVehiclesByIds(sortedRankingItems, compareIds),
    [compareIds, sortedRankingItems],
  )

  // 持久化收藏车型清单。
  useEffect(() => {
    writeIdListToStorage(FAVORITE_STORAGE_KEY, favoriteIds)
  }, [favoriteIds])

  // 持久化对比车型清单。
  useEffect(() => {
    writeIdListToStorage(COMPARE_STORAGE_KEY, compareIds)
  }, [compareIds])

  // 拉取榜单、来源状态和默认车型详情。
  const loadDashboardData = useCallback(async function loadDashboardData(targetQuery: RankingQuery = query) {
    // 标记本次请求，避免慢接口覆盖后续月份状态。
    const requestId = dashboardRequestIdRef.current + 1
    dashboardRequestIdRef.current = requestId

    // 判断当前异步请求是否仍是最新请求。
    function isCurrentDashboardRequest() {
      return dashboardRequestIdRef.current === requestId
    }

    setIsLoading(true)
    try {
      // 优先读取榜单，让手机端首屏不被辅助接口阻塞。
      const rankingResponse = await fetchRankings({ ...targetQuery, metric: 'value' })
      const firstVehicle = rankingResponse.items[0] ?? null

      if (!isCurrentDashboardRequest()) {
        return
      }

      setRanking(rankingResponse)
      setSelectedVehicle(firstVehicle)
      setIsLoading(false)

      // 并行补齐车型详情、来源状态、官方大盘和刷新状态。
      const [detail, sourceResponse, officialResponse, monthResponse, refreshStatusResponse] = await Promise.all([
        firstVehicle ? fetchVehicle(firstVehicle.id, targetQuery.month) : Promise.resolve(null),
        fetchSourceStatuses(targetQuery.month),
        fetchOfficialUsedCarMarket(targetQuery.month),
        fetchMonthOptions(getYearFromMonth(targetQuery.month)),
        fetchDataRefreshStatus(),
      ])

      if (!isCurrentDashboardRequest()) {
        return
      }

      setSourceStatus(sourceResponse)
      setOfficialMarket(officialResponse)
      setMonthOptions(monthResponse)
      setDataRefreshStatus(refreshStatusResponse)
      setLastUnifiedRefresh(refreshStatusResponse.history.latest ?? sourceResponse.dataRefresh?.latest ?? null)
      setSelectedVehicle(firstVehicle ? mergeVehicleDetailWithRankingItem(firstVehicle, detail) : null)
    } finally {
      if (isCurrentDashboardRequest()) {
        setIsLoading(false)
      }
    }
  }, [query])

  // 同步榜单数据和来源状态。
  useEffect(() => {
    void loadDashboardData()
  }, [loadDashboardData])

  // 切换主工作区视图。
  function handleViewChange(view: WorkspaceView) {
    setActiveView(view)
    if (view === 'value') {
      setQuery((current) => ({ ...current, metric: 'value' }))
    }
  }

  // 切换当前统计月份。
  function handleMonthChange(month: string) {
    setSelectedVehicle(null)
    setTableState((current) => ({ ...current, page: 1 }))
    setQuery((current) => ({ ...current, month }))
  }

  // 打开公开观察源监控视图。
  function handleOpenSourceMonitor() {
    setActiveView('sources')
  }

  // 打开对比清单并在首次进入时填入榜单前三款。
  function handleOpenComparison() {
    setCompareIds((currentIds) => buildInitialCompareIds(sortedRankingItems, currentIds))
    setActiveView('compare')
  }

  // 切换本月至今或完整月参考。
  function handleScopeChange(scope: RankingQuery['scope']) {
    setQuery((current) => ({ ...current, scope }))
    setTableState((current) => ({ ...current, page: 1 }))
  }

  // 切换价格预设并刷新榜单查询。
  function handlePricePresetChange(pricePreset: PricePresetId) {
    const priceRange = getPricePresetRange(pricePreset)
    setSelectedVehicle(null)
    setTableState((current) => ({ ...current, pricePreset, page: 1 }))
    setQuery((current) => ({ ...current, ...priceRange }))
  }

  // 切换本地表格排序。
  function handleSortChange(sortKey: RankingSortKey) {
    setTableState((current) => ({
      ...current,
      ...getNextSortState(current.sortKey, current.sortDirection, sortKey),
      page: 1,
    }))
  }

  // 切换每页展示条数。
  function handlePageSizeChange(pageSize: PageSize) {
    setTableState((current) => ({ ...current, pageSize, page: 1 }))
  }

  // 切换当前页码。
  function handlePageChange(page: number) {
    if (Number.isNaN(page)) {
      return
    }

    setTableState((current) => ({ ...current, page: Math.max(1, page) }))
  }

  // 重置筛选、排序和分页状态。
  function handleResetFilters() {
    const defaultState = createDefaultRankingTableState()
    setActiveView('value')
    setSelectedVehicle(null)
    setTableState(defaultState)
    setQuery({
      ...defaultRankingQuery,
      ...getPricePresetRange(defaultState.pricePreset),
      scope: 'mtd',
      metric: 'value',
    })
  }

  // 选中榜单中的车型并更新右侧画像。
  async function handleSelectVehicle(vehicle: VehicleRankItem) {
    setSelectedVehicle(vehicle)
    const detail = await fetchVehicle(vehicle.id, query.month)
    setSelectedVehicle(mergeVehicleDetailWithRankingItem(vehicle, detail))
  }

  // 切换指定车型的收藏状态。
  function handleToggleFavorite(vehicleId: string) {
    setFavoriteIds((currentIds) => toggleFavoriteId(currentIds, vehicleId))
  }

  // 切换指定车型的对比状态并更新提示文案。
  function handleToggleCompare(vehicleId: string) {
    setCompareIds((currentIds) => {
      const update = updateCompareIds(currentIds, vehicleId)
      setCompareNotice(update.notice)
      return update.ids
    })
  }

  // 导入真实数据后刷新当前工作区状态。
  async function handleImportCommitted(result: ImportCommitResponse) {
    const nextQuery = { ...query, month: result.month, metric: 'value' as const }
    setActiveView('sources')
    setSelectedVehicle(null)
    setTableState((current) => ({ ...current, page: 1 }))
    setQuery(nextQuery)
    setRefreshMessage(`人工导入完成：${result.run.successCount} 条记录已写入 ${result.month}。`)
    await loadDashboardData(nextQuery)
  }

  // 手动刷新当前榜单数据。
  async function handleRefresh() {
    setIsRefreshingData(true)
    setRefreshMessage('正在刷新官方与公开观察数据...')

    try {
      const result = await refreshUnifiedData(query.month)
      const [rankingResponse, sourceResponse, officialResponse, monthResponse, refreshStatusResponse] = await Promise.all([
        fetchRankings({ ...query, metric: 'value' }),
        fetchSourceStatuses(query.month),
        fetchOfficialUsedCarMarket(query.month),
        fetchMonthOptions(getYearFromMonth(query.month)),
        fetchDataRefreshStatus(),
      ])
      const firstVehicle = rankingResponse.items[0] ?? null
      const detail = firstVehicle ? await fetchVehicle(firstVehicle.id, query.month) : null

      setRanking(rankingResponse)
      setSourceStatus(sourceResponse)
      setOfficialMarket(officialResponse)
      setMonthOptions(monthResponse)
      setDataRefreshStatus(refreshStatusResponse)
      setLastUnifiedRefresh(refreshStatusResponse.history.latest ?? sourceResponse.dataRefresh?.latest ?? result)
      setRefreshMessage(result.message)
      setSelectedVehicle(firstVehicle ? mergeVehicleDetailWithRankingItem(firstVehicle, detail) : null)
    } finally {
      setIsRefreshingData(false)
    }
  }

  // 导出当前榜单为 CSV 文件。
  function handleExport() {
    downloadCsv('月值好车-10-20万二手SUV榜单.csv', buildRankingCsv(ranking.items))
  }

  // 打开数据口径说明弹窗。
  function handleOpenMethodology() {
    setIsMethodOpen(true)
  }

  // 关闭数据口径说明弹窗。
  function handleCloseMethodology() {
    setIsMethodOpen(false)
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        跳到主内容
      </a>
      <TerminalHeader
        ranking={ranking}
        officialMarket={officialMarket}
        monthOptions={monthOptions}
        isLoading={isLoading || isRefreshingData}
        isRefreshingData={isRefreshingData}
        lastUnifiedRefresh={lastUnifiedRefresh}
        dataRefreshStatus={dataRefreshStatus}
        refreshMessage={refreshMessage}
        favoriteCount={favoriteIds.length}
        compareCount={compareIds.length}
        onRefresh={handleRefresh}
        onExport={handleExport}
        onOpenMethodology={handleOpenMethodology}
      />

      <div className="terminal-grid">
        <FilterRail
          query={query}
          monthOptions={monthOptions}
          pricePreset={tableState.pricePreset}
          sourceStatus={sourceStatus}
          officialMarket={officialMarket}
          lastUnifiedRefresh={lastUnifiedRefresh}
          refreshMessage={refreshMessage}
          onScopeChange={handleScopeChange}
          onMonthChange={handleMonthChange}
          onPricePresetChange={handlePricePresetChange}
          onResetFilters={handleResetFilters}
          onOpenSourceMonitor={handleOpenSourceMonitor}
          onOpenMethodology={handleOpenMethodology}
        />
        <div className="center-stack">
          <RankingWorkspace
            ranking={ranking}
            paginatedRanking={paginatedRanking}
            tableState={tableState}
            officialMarket={officialMarket}
            sourceStatus={sourceStatus}
            lastUnifiedRefresh={lastUnifiedRefresh}
            currentMonth={query.month}
            monthOptions={monthOptions}
            activeView={activeView}
            selectedId={activeVehicle?.id ?? ''}
            favoriteIds={favoriteIds}
            compareIds={compareIds}
            compareItems={compareItems}
            compareNotice={compareNotice}
            onViewChange={handleViewChange}
            onSortChange={handleSortChange}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onSelectVehicle={handleSelectVehicle}
            onToggleCompare={handleToggleCompare}
            onImportCommitted={handleImportCommitted}
          />
          <BottomPanels
            items={sortedRankingItems}
            dataMode={ranking.dataMode}
            officialMarket={officialMarket}
            onOpenComparison={handleOpenComparison}
          />
        </div>
        {activeVehicle ? (
          <VehicleInspector
            vehicle={activeVehicle}
            dataMode={ranking.dataMode}
            officialMarket={officialMarket}
            isFavorite={favoriteIds.includes(activeVehicle.id)}
            isCompared={compareIds.includes(activeVehicle.id)}
            onToggleFavorite={() => handleToggleFavorite(activeVehicle.id)}
            onToggleCompare={() => handleToggleCompare(activeVehicle.id)}
          />
        ) : null}
      </div>

      <footer className="app-footer">
        <span>数据口径版本：V2026.06</span>
        <span>建议使用 Chrome / Edge 最新版访问</span>
        <span>数据仅供参考，投资有风险，交易需谨慎</span>
      </footer>

      <MethodologyDialog isOpen={isMethodOpen} onClose={handleCloseMethodology} />
    </div>
  )
}

export default App
