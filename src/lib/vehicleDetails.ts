import type { VehicleRankItem } from '../types'

// 合并榜单行与车型详情并保留榜单计算字段。
export function mergeVehicleDetailWithRankingItem(rankingItem: VehicleRankItem, detail: VehicleRankItem | null) {
  if (!detail) {
    return rankingItem
  }

  return {
    ...rankingItem,
    ...detail,
    rank: detail.rank ?? rankingItem.rank,
    valueScore: detail.valueScore ?? rankingItem.valueScore,
  }
}
