import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildRankingCsv } from '../src/lib/csv'
import { createRankingResponse, defaultRankingQuery } from '../src/lib/rankingEngine'
import { computeVehicleScore } from '../src/lib/scoring'
import { vehicleSeed } from '../src/data/vehicles'

// 定义不应出现在用户可见口径中的旧文案。
const deprecatedPublicCopy = ['成交热度榜', '25% 成交热度', '35% 价格价值'] as const

// 读取项目内的文本文件。
async function readProjectFile(path: string) {
  return readFile(resolve(process.cwd(), path), 'utf8')
}

// 验证口径可信化相关文案不会回退到旧版本。
describe('copy regression for data methodology', () => {
  // 验证 README 使用 CADA 官方大盘和综合价值榜口径。
  it('keeps README aligned with official market and value ranking wording', async () => {
    const readme = await readProjectFile('README.md')

    expect(readme).toContain('CADA 官方二手车大盘')
    expect(readme).toContain('综合价值榜')
    expect(readme).toContain('YUEZHI_AUTO_REFRESH')
    expect(readme).toContain('dataRefresh')
    expect(readme).toContain('45% 价格价值 + 25% 保值率 + 20% 车龄里程健康度 + 10% 来源置信度')

    for (const copy of deprecatedPublicCopy) {
      expect(readme).not.toContain(copy)
    }
  })

  // 验证主要前端文案不再出现旧销量榜入口。
  it('keeps main frontend surfaces away from old heat ranking wording', async () => {
    const files = await Promise.all([
      readProjectFile('src/App.tsx'),
      readProjectFile('src/components/RankingWorkspace.tsx'),
      readProjectFile('src/components/FilterRail.tsx'),
      readProjectFile('src/components/MethodologyDialog.tsx'),
      readProjectFile('src/components/TerminalHeader.tsx'),
    ])
    const visibleCopy = files.join('\n')

    expect(visibleCopy).toContain('非官方销量榜')
    expect(visibleCopy).toContain('官方二手车大盘')

    for (const copy of deprecatedPublicCopy) {
      expect(visibleCopy).not.toContain(copy)
    }
  })

  // 验证 CSV 用户导出只包含综合价值字段。
  it('keeps exported CSV focused on value ranking fields', () => {
    const ranking = createRankingResponse(defaultRankingQuery)
    const csv = buildRankingCsv(ranking.items)

    expect(csv).toContain('综合价值分')
    expect(csv).toContain('来源置信度')
    expect(csv).not.toContain('热度指数')
    expect(csv).not.toContain('成交热度榜')
  })

  // 验证公开热度变化不会影响综合价值评分。
  it('keeps value score independent from public observation heat', () => {
    const lowSignalVehicle = { ...vehicleSeed[0], heatIndex: 1 }
    const highSignalVehicle = { ...vehicleSeed[0], heatIndex: 100 }

    expect(computeVehicleScore(lowSignalVehicle)).toBe(computeVehicleScore(highSignalVehicle))
  })
})
