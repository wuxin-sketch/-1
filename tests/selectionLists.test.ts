import { describe, expect, it } from 'vitest'
import type { VehicleRankItem } from '../src/types'
import {
  buildInitialCompareIds,
  parseStoredIdList,
  selectVehiclesByIds,
  stringifyIdList,
  toggleFavoriteId,
  updateCompareIds,
} from '../src/lib/selectionLists'

// 构建选择清单测试使用的车型样本。
function buildVehicle(id: string): VehicleRankItem {
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
  }
}

// 验证收藏和对比清单的纯函数行为。
describe('vehicle selection lists', () => {
  // 验证本地存储文本可以安全解析。
  it('parses and serializes stored id lists', () => {
    expect(parseStoredIdList('["a","b",1]')).toEqual(['a', 'b'])
    expect(parseStoredIdList('bad json')).toEqual([])
    expect(stringifyIdList(['a', 'a', 'b'])).toBe('["a","b"]')
  })

  // 验证收藏清单可以添加和移除车型。
  it('toggles favorite ids', () => {
    expect(toggleFavoriteId(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggleFavoriteId(['a', 'b'], 'a')).toEqual(['b'])
  })

  // 验证对比清单达到上限后会替换最早车型。
  it('updates comparison ids with max replacement', () => {
    expect(updateCompareIds(['a', 'b'], 'c', 3)).toEqual({
      ids: ['a', 'b', 'c'],
      notice: '已加入对比清单。',
    })
    expect(updateCompareIds(['a', 'b', 'c'], 'd', 3)).toEqual({
      ids: ['b', 'c', 'd'],
      notice: '对比清单最多 3 款，已替换最早添加车型。',
    })
  })

  // 验证对比车型会按清单顺序输出。
  it('selects vehicles in comparison order', () => {
    const items = [buildVehicle('a'), buildVehicle('b'), buildVehicle('c')]

    expect(selectVehiclesByIds(items, ['c', 'a']).map((item) => item.id)).toEqual(['c', 'a'])
    expect(buildInitialCompareIds(items, [])).toEqual(['a', 'b', 'c'])
  })
})
