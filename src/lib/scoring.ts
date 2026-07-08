import type { VehicleRankItem } from '../types'

// 定义综合评分所需的权重。
const SCORE_WEIGHTS = {
  priceValue: 0.45,
  retention: 0.25,
  ageMileage: 0.2,
  confidence: 0.1,
}

// 将数值压缩到 0 到 100 的评分区间。
export function normalizeScore(value: number, min: number, max: number, invert = false) {
  if (max === min) {
    return 50
  }

  const raw = ((value - min) / (max - min)) * 100
  const bounded = Math.max(0, Math.min(100, raw))
  return invert ? 100 - bounded : bounded
}

// 计算车型在价格区间内的价格价值分。
export function computePriceValue(vehicle: VehicleRankItem) {
  const averagePrice = (vehicle.priceMin + vehicle.priceMax) / 2
  return normalizeScore(averagePrice, 100000, 200000, true)
}

// 计算车龄和里程共同构成的健康度。
export function computeAgeMileageHealth(vehicle: VehicleRankItem) {
  const ageScore = normalizeScore(vehicle.ageYears, 2, 6, true)
  const mileageScore = normalizeScore(vehicle.mileageWanKm, 2, 9, true)
  return ageScore * 0.45 + mileageScore * 0.55
}

// 计算单个车型的综合性价比分。
export function computeVehicleScore(vehicle: VehicleRankItem) {
  const priceValue = computePriceValue(vehicle)
  const ageMileage = computeAgeMileageHealth(vehicle)

  return Math.round(
    priceValue * SCORE_WEIGHTS.priceValue +
      vehicle.retentionRate * SCORE_WEIGHTS.retention +
      ageMileage * SCORE_WEIGHTS.ageMileage +
      vehicle.sourceConfidence * SCORE_WEIGHTS.confidence,
  )
}

// 根据价格区间过滤车型样本。
export function filterByPrice(items: VehicleRankItem[], priceMin: number, priceMax: number) {
  return items.filter((item) => item.priceMax >= priceMin && item.priceMin <= priceMax)
}

// 按车型 ID 去重并保留置信度更高的样本。
export function dedupeVehicles(items: VehicleRankItem[]) {
  const byId = new Map<string, VehicleRankItem>()

  for (const item of items) {
    const current = byId.get(item.id)
    if (!current || item.sourceConfidence > current.sourceConfidence) {
      byId.set(item.id, item)
    }
  }

  return Array.from(byId.values())
}

// 为车型列表补充分数与排名。
export function enrichRankings(items: VehicleRankItem[], sortBy: 'value' | 'heat') {
  const enriched = items.map((item) => ({
    ...item,
    valueScore: computeVehicleScore(item),
  }))

  const sorted = enriched.sort((left, right) => {
    if (sortBy === 'heat') {
      return right.heatIndex - left.heatIndex
    }

    return (right.valueScore ?? 0) - (left.valueScore ?? 0)
  })

  return sorted.map((item, index) => ({
    ...item,
    rank: index + 1,
  }))
}
