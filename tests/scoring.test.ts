import { describe, expect, it } from 'vitest'
import { vehicleSeed } from '../src/data/vehicles'
import { buildRankingCsv, escapeCsvCell } from '../src/lib/csv'
import { createRankingResponse, defaultRankingQuery } from '../src/lib/rankingEngine'
import { computeVehicleScore, dedupeVehicles, filterByPrice } from '../src/lib/scoring'

// 验证综合评分公式能输出有效分值。
describe('scoring engine', () => {
  it('computes a bounded composite score', () => {
    const score = computeVehicleScore(vehicleSeed[0])

    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('does not use public heat index in value scoring', () => {
    const lowHeatVehicle = { ...vehicleSeed[0], heatIndex: 1 }
    const highHeatVehicle = { ...vehicleSeed[0], heatIndex: 100 }

    expect(computeVehicleScore(lowHeatVehicle)).toBe(computeVehicleScore(highHeatVehicle))
  })

  it('filters vehicles by the requested price range', () => {
    const filtered = filterByPrice(vehicleSeed, 100000, 120000)

    expect(filtered.every((item) => item.priceMin <= 120000 && item.priceMax >= 100000)).toBe(true)
  })

  it('keeps the higher confidence duplicate vehicle', () => {
    const duplicateLow = { ...vehicleSeed[0], sourceConfidence: 20 }
    const deduped = dedupeVehicles([duplicateLow, vehicleSeed[0]])

    expect(deduped).toHaveLength(1)
    expect(deduped[0].sourceConfidence).toBe(vehicleSeed[0].sourceConfidence)
  })

  it('sorts heat rankings by heat index', () => {
    const ranking = createRankingResponse({ ...defaultRankingQuery, metric: 'heat' })

    expect(ranking.items[0].heatIndex).toBeGreaterThanOrEqual(ranking.items[1].heatIndex)
  })

  it('exports csv with Chinese headers and rows', () => {
    const ranking = createRankingResponse(defaultRankingQuery)
    const csv = buildRankingCsv(ranking.items.slice(0, 1))
    const firstItem = ranking.items[0]

    expect(csv).toContain('排名,车型,年款')
    expect(csv).toContain('综合价值分')
    expect(csv).not.toContain('热度指数')
    expect(csv).toContain(`${firstItem.brand} ${firstItem.model}`)
  })

  // 验证 CSV 导出会中和电子表格公式前缀。
  it('neutralizes spreadsheet formulas in exported cells', () => {
    expect(escapeCsvCell('=cmd')).toBe("'=cmd")
    expect(escapeCsvCell('@SUM(1,2)')).toBe('"\'@SUM(1,2)"')
  })
})
