import type { VehicleRankItem } from '../types'

// 定义价格筛选预设项。
export const PRICE_PRESETS = [
  { id: '10-20', label: '10-20万', priceMin: 100000, priceMax: 200000 },
  { id: '10-12', label: '10-12万', priceMin: 100000, priceMax: 120000 },
  { id: '12-14', label: '12-14万', priceMin: 120000, priceMax: 140000 },
  { id: '14-16', label: '14-16万', priceMin: 140000, priceMax: 160000 },
  { id: '16-18', label: '16-18万', priceMin: 160000, priceMax: 180000 },
  { id: '18-20', label: '18-20万', priceMin: 180000, priceMax: 200000 },
] as const

// 定义表格排序字段。
export type RankingSortKey = 'averagePrice' | 'retentionRate' | 'ageMileage' | 'sourceConfidence' | 'valueScore'

// 定义表格排序方向。
export type SortDirection = 'asc' | 'desc'

// 定义价格筛选预设 ID。
export type PricePresetId = (typeof PRICE_PRESETS)[number]['id']

// 定义表格分页大小。
export type PageSize = 10 | 20 | 50

// 定义价值榜本地交互状态。
export interface RankingTableState {
  pricePreset: PricePresetId
  sortKey: RankingSortKey
  sortDirection: SortDirection
  page: number
  pageSize: PageSize
}

// 定义表格分页计算结果。
export interface PaginatedItems<T> {
  items: T[]
  totalItems: number
  totalPages: number
  page: number
  pageSize: PageSize
}

// 定义默认价格预设。
export const DEFAULT_PRICE_PRESET: PricePresetId = '10-20'

// 定义默认排序字段。
export const DEFAULT_SORT_KEY: RankingSortKey = 'valueScore'

// 定义默认排序方向。
export const DEFAULT_SORT_DIRECTION: SortDirection = 'desc'

// 定义默认分页大小。
export const DEFAULT_PAGE_SIZE: PageSize = 10

// 创建价值榜默认本地交互状态。
export function createDefaultRankingTableState(): RankingTableState {
  return {
    pricePreset: DEFAULT_PRICE_PRESET,
    sortKey: DEFAULT_SORT_KEY,
    sortDirection: DEFAULT_SORT_DIRECTION,
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
  }
}

// 根据价格预设 ID 查找预设配置。
export function getPricePreset(presetId: PricePresetId) {
  return PRICE_PRESETS.find((preset) => preset.id === presetId) ?? PRICE_PRESETS[0]
}

// 根据价格预设 ID 获取价格查询范围。
export function getPricePresetRange(presetId: PricePresetId) {
  const preset = getPricePreset(presetId)
  return {
    priceMin: preset.priceMin,
    priceMax: preset.priceMax,
  }
}

// 计算车型平均参考价。
export function getAveragePrice(vehicle: VehicleRankItem) {
  return (vehicle.priceMin + vehicle.priceMax) / 2
}

// 计算车龄里程排序值。
export function getAgeMileageSortValue(vehicle: VehicleRankItem) {
  return vehicle.ageYears * 100 + vehicle.mileageWanKm
}

// 根据排序字段读取车型排序值。
export function getVehicleSortValue(vehicle: VehicleRankItem, sortKey: RankingSortKey) {
  if (sortKey === 'averagePrice') {
    return getAveragePrice(vehicle)
  }

  if (sortKey === 'ageMileage') {
    return getAgeMileageSortValue(vehicle)
  }

  return vehicle[sortKey] ?? 0
}

// 按本地表格排序状态排序车型。
export function sortVehicles(
  items: VehicleRankItem[],
  sortKey: RankingSortKey,
  sortDirection: SortDirection,
) {
  return [...items].sort((left, right) => {
    const leftValue = getVehicleSortValue(left, sortKey)
    const rightValue = getVehicleSortValue(right, sortKey)
    const direction = sortDirection === 'asc' ? 1 : -1

    if (leftValue === rightValue) {
      return (left.rank ?? 0) - (right.rank ?? 0)
    }

    return (leftValue - rightValue) * direction
  })
}

// 根据当前排序状态生成下一次排序状态。
export function getNextSortState(
  currentKey: RankingSortKey,
  currentDirection: SortDirection,
  nextKey: RankingSortKey,
) {
  if (currentKey === nextKey) {
    return {
      sortKey: nextKey,
      sortDirection: (currentDirection === 'asc' ? 'desc' : 'asc') as SortDirection,
    }
  }

  return {
    sortKey: nextKey,
    sortDirection: (nextKey === 'averagePrice' || nextKey === 'ageMileage' ? 'asc' : 'desc') as SortDirection,
  }
}

// 按页码和分页大小切分表格数据。
export function paginateItems<T>(items: T[], page: number, pageSize: PageSize): PaginatedItems<T> {
  const totalItems = items.length
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.max(1, Math.min(page, totalPages))
  const startIndex = (safePage - 1) * pageSize

  return {
    items: items.slice(startIndex, startIndex + pageSize),
    totalItems,
    totalPages,
    page: safePage,
    pageSize,
  }
}
