import { describe, expect, it } from 'vitest'
import { vehicleSeed } from '../src/data/vehicles'
import { mergeVehicleDetailWithRankingItem } from '../src/lib/vehicleDetails'
import type { VehicleRankItem } from '../src/types'

// 验证车型详情合并逻辑保留榜单计算字段。
describe('vehicle detail merging', () => {
  // 验证详情缺少分值时仍保留榜单综合价值分。
  it('preserves the ranking value score when detail does not include one', () => {
    const rankingItem: VehicleRankItem = { ...vehicleSeed[0], rank: 2, valueScore: 67 }
    const detail: VehicleRankItem = { ...vehicleSeed[0], rank: undefined, valueScore: undefined }

    const merged = mergeVehicleDetailWithRankingItem(rankingItem, detail)

    expect(merged.valueScore).toBe(67)
    expect(merged.rank).toBe(2)
  })

  // 验证详情缺失时直接使用榜单车型。
  it('returns the ranking item when no detail is available', () => {
    const rankingItem: VehicleRankItem = { ...vehicleSeed[1], rank: 1, valueScore: 69 }

    expect(mergeVehicleDetailWithRankingItem(rankingItem, null)).toBe(rankingItem)
  })
})
