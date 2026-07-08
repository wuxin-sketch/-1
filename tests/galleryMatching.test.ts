import { describe, expect, it } from 'vitest'
import { extractYearHints, hasYearOverlap, scoreGalleryCandidateText } from '../server/gallery/matching'
import type { VehicleGalleryTarget } from '../src/types'

// 定义图库匹配测试使用的目标车型。
const target: VehicleGalleryTarget = {
  vehicleId: 'honda-crv',
  brand: '本田',
  model: 'CR-V',
  modelYears: '2021-2023',
  aliases: ['Honda CR-V', '本田 CR-V'],
  yearHints: [2021, 2022, 2023],
  generationHints: ['e:HEV', 'Black Edition'],
  kinds: ['exterior', 'interior', 'console', 'detail'],
  categoryKeywords: {
    exterior: ['exterior', 'front'],
    interior: ['interior', 'cabin'],
    console: ['dashboard', 'console'],
    detail: ['wheel', 'badge'],
  },
}

// 验证图库候选图匹配打分。
describe('gallery candidate matching', () => {
  // 验证文本中可以提取年份线索。
  it('extracts unique year hints from text', () => {
    expect(extractYearHints('2021 Honda CR-V and 2021 interior, updated in 2023')).toEqual([2021, 2023])
  })

  // 验证候选年份需要与目标年款重叠。
  it('detects year overlap with target years', () => {
    expect(hasYearOverlap([2022], target)).toBe(true)
    expect(hasYearOverlap([2016], target)).toBe(false)
    expect(hasYearOverlap([], target)).toBe(true)
  })

  // 验证车型别名、年份和分类关键词共同提高置信分。
  it('scores alias, category, generation, and year evidence', () => {
    const score = scoreGalleryCandidateText(target, 'interior', '2022 Honda CR-V e:HEV interior cabin photo')

    expect(score.confidence).toBeGreaterThanOrEqual(80)
    expect(score.evidence.join('\n')).toContain('车型别名命中')
    expect(score.evidence.join('\n')).toContain('分类关键词命中')
    expect(score.evidence.join('\n')).toContain('年份重叠')
  })

  // 验证年份错位会降低置信分并产生警告。
  it('penalizes non-overlapping year evidence', () => {
    const score = scoreGalleryCandidateText(target, 'console', '2016 Honda CR-V dashboard console photo')

    expect(score.confidence).toBeLessThan(70)
    expect(score.warnings.join('\n')).toContain('不重叠')
  })
})
