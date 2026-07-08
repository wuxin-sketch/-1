import { describe, expect, it } from 'vitest'
import type { VehicleRankItem } from '../src/types'
import {
  createDefaultRankingTableState,
  getNextSortState,
  getPricePresetRange,
  paginateItems,
  sortVehicles,
} from '../src/lib/tableControls'

// 构建表格控制测试使用的车型样本。
function buildVehicle(id: string, overrides: Partial<VehicleRankItem>): VehicleRankItem {
  return {
    id,
    brand: '测试',
    model: id,
    segment: 'SUV',
    modelYears: '2021-2023',
    priceMin: 100000,
    priceMax: 120000,
    heatIndex: 0,
    retentionRate: 70,
    ageYears: 3,
    mileageWanKm: 5,
    sourceConfidence: 80,
    sampleSize: 1,
    sources: ['测试源'],
    updatedAt: '2026-06-30T10:00:00.000Z',
    riskLevel: '低',
    riskNotes: [],
    advice: '',
    heatBreakdown: { search: 0, view: 0, inquiry: 0, sold: 0 },
    priceDistribution: [],
    valueScore: 80,
    ...overrides,
  }
}

// 验证价值榜本地筛选、排序和分页控制逻辑。
describe('ranking table controls', () => {
  // 验证价格预设映射到正确查询范围。
  it('maps price presets to API query ranges', () => {
    expect(getPricePresetRange('10-20')).toEqual({ priceMin: 100000, priceMax: 200000 })
    expect(getPricePresetRange('14-16')).toEqual({ priceMin: 140000, priceMax: 160000 })
  })

  // 验证默认状态符合验收要求。
  it('creates the default table state', () => {
    expect(createDefaultRankingTableState()).toEqual({
      pricePreset: '10-20',
      sortKey: 'valueScore',
      sortDirection: 'desc',
      page: 1,
      pageSize: 10,
    })
  })

  // 验证排序切换同列反向、换列使用默认方向。
  it('creates next sort state for repeated and new columns', () => {
    expect(getNextSortState('valueScore', 'desc', 'valueScore')).toEqual({
      sortKey: 'valueScore',
      sortDirection: 'asc',
    })
    expect(getNextSortState('valueScore', 'desc', 'averagePrice')).toEqual({
      sortKey: 'averagePrice',
      sortDirection: 'asc',
    })
  })

  // 验证车型可以按综合价值分和价格排序。
  it('sorts vehicles by value score and average price', () => {
    const items = [
      buildVehicle('a', { priceMin: 140000, priceMax: 160000, valueScore: 70 }),
      buildVehicle('b', { priceMin: 100000, priceMax: 120000, valueScore: 90 }),
    ]

    expect(sortVehicles(items, 'valueScore', 'desc').map((item) => item.id)).toEqual(['b', 'a'])
    expect(sortVehicles(items, 'averagePrice', 'asc').map((item) => item.id)).toEqual(['b', 'a'])
  })

  // 验证分页会限制边界页并返回正确切片。
  it('paginates items and clamps out-of-range pages', () => {
    const items = Array.from({ length: 23 }, (_, index) => index + 1)
    const pageThree = paginateItems(items, 3, 10)
    const overflow = paginateItems(items, 99, 10)

    expect(pageThree.items).toEqual([21, 22, 23])
    expect(pageThree.totalPages).toBe(3)
    expect(overflow.page).toBe(3)
    expect(overflow.items).toEqual([21, 22, 23])
  })
})
