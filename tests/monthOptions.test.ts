import { describe, expect, it } from 'vitest'
import type { OfficialUsedCarMarket } from '../src/types'
import { buildMonthOptions, formatMonthId, formatMonthLabel, parseOfficialMonthLabel } from '../src/lib/monthOptions'

// 构建月份选项测试使用的官方大盘。
function buildOfficialMarket(): OfficialUsedCarMarket {
  return {
    dataMode: 'official',
    dataFreshness: 'fresh',
    officialSource: 'CADA',
    latestAvailableMonth: '2026年5月',
    nationalVolumeWan: 160,
    momPercent: -4.2,
    monthlyVolumeTrend: [
      { label: '2026年1月', volumeWan: 173, momPercent: -7.6 },
      { label: '2026年2月', volumeWan: 130, momPercent: -24.8 },
      { label: '2026年3月', volumeWan: 179, momPercent: 37.7 },
      { label: '2026年4月', volumeWan: 167, momPercent: -6.7 },
      { label: '2026年5月', volumeWan: 160, momPercent: -4.2 },
    ],
    provinceTop: [],
    officialModelTopTen: [],
    transferRateTrend: [],
    managerIndexTrend: [],
    sourceUrl: 'https://data.cada.cn/main/usedCar.do',
    updatedAt: '2026-07-07T08:00:00.000Z',
  }
}

// 验证今年月份筛选状态生成逻辑。
describe('month options', () => {
  // 验证月份格式化工具。
  it('formats and parses month labels', () => {
    expect(formatMonthId(2026, 7)).toBe('2026-07')
    expect(formatMonthLabel('2026-07')).toBe('2026年7月')
    expect(parseOfficialMonthLabel('2026年5月')).toBe('2026-05')
  })

  // 验证官方完整月、公开观察月和待更新月能被区分。
  it('marks official, public, and pending months', () => {
    const options = buildMonthOptions({
      year: 2026,
      currentDate: new Date('2026-07-07T12:00:00+08:00'),
      officialMarket: buildOfficialMarket(),
      rankingCaches: [{ month: '2026-06', dataMode: 'live' }],
    })

    expect(options).toHaveLength(7)
    expect(options.find((option) => option.id === '2026-05')?.status).toBe('official')
    expect(options.find((option) => option.id === '2026-06')?.status).toBe('public')
    expect(options.find((option) => option.id === '2026-07')?.status).toBe('pending')
  })

  // 验证人工导入缓存不会冒充 CADA 官方完整月度。
  it('marks imported ranking caches as public imported months', () => {
    const options = buildMonthOptions({
      year: 2026,
      currentDate: new Date('2026-07-07T12:00:00+08:00'),
      officialMarket: buildOfficialMarket(),
      rankingCaches: [{ month: '2026-06', dataMode: 'imported' }],
    })
    const importedMonth = options.find((option) => option.id === '2026-06')

    expect(importedMonth?.status).toBe('public')
    expect(importedMonth?.statusLabel).toBe('人工导入缓存')
    expect(importedMonth?.officialVolumeWan).toBeNull()
  })
})
