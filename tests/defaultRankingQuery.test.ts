import { describe, expect, it } from 'vitest'
import { buildDefaultRankingQuery, getDefaultQueryMonth } from '../src/lib/rankingEngine'

// 验证默认榜单查询会跟随当前自然月份。
describe('default ranking query', () => {
  // 验证 2026 年 7 月 7 日默认月份为 2026-07。
  it('uses the current month instead of a hard-coded month', () => {
    const now = new Date('2026-07-07T12:00:00+08:00')

    expect(getDefaultQueryMonth(now)).toBe('2026-07')
    expect(buildDefaultRankingQuery(now).month).toBe('2026-07')
  })
})
