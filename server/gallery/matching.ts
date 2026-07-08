import type { GalleryAssetKind, VehicleGalleryTarget } from '../../src/types.ts'

// 把待匹配文本归一化为小写紧凑字符串。
function normalizeMatchText(value: string) {
  return value
    .toLowerCase()
    .replace(/[._/()[\]{}:：,，-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 从候选图描述中提取可能的年份线索。
export function extractYearHints(text: string) {
  const matches = normalizeMatchText(text).match(/\b(19|20)\d{2}\b/g) ?? []
  return Array.from(new Set(matches.map((value) => Number(value)).filter((year) => Number.isFinite(year))))
}

// 判断候选图年份是否与目标年款范围重叠。
export function hasYearOverlap(candidateYears: number[], target: Pick<VehicleGalleryTarget, 'yearHints'>) {
  if (candidateYears.length === 0) {
    return true
  }

  return candidateYears.some((year) => target.yearHints.includes(year))
}

// 计算单个候选图与目标车型及分类的匹配分。
export function scoreGalleryCandidateText(target: VehicleGalleryTarget, kind: GalleryAssetKind, text: string) {
  const normalizedText = normalizeMatchText(text)
  const evidence: string[] = []
  const warnings: string[] = []
  let confidence = 20

  const aliasHit = target.aliases.find((alias) => normalizedText.includes(normalizeMatchText(alias)))
  if (aliasHit) {
    confidence += 35
    evidence.push(`车型别名命中：${aliasHit}`)
  } else {
    warnings.push('未直接命中车型别名。')
  }

  const categoryHits = target.categoryKeywords[kind].filter((keyword) => normalizedText.includes(normalizeMatchText(keyword)))
  if (categoryHits.length > 0) {
    confidence += Math.min(25, categoryHits.length * 12)
    evidence.push(`分类关键词命中：${categoryHits.join(' / ')}`)
  } else if (kind !== 'exterior') {
    warnings.push('未命中目标分类关键词。')
  }

  const generationHit = target.generationHints.find((hint) => normalizedText.includes(normalizeMatchText(hint)))
  if (generationHit) {
    confidence += 12
    evidence.push(`代际线索命中：${generationHit}`)
  }

  const candidateYears = extractYearHints(text)
  if (candidateYears.length > 0 && hasYearOverlap(candidateYears, target)) {
    confidence += 18
    evidence.push(`年份重叠：${candidateYears.join(' / ')}`)
  } else if (candidateYears.length > 0) {
    confidence -= 30
    warnings.push(`年份线索 ${candidateYears.join(' / ')} 与目标年款 ${target.modelYears} 不重叠。`)
  } else {
    warnings.push('未读取到明确年份线索。')
  }

  return {
    confidence: Math.max(0, Math.min(100, confidence)),
    evidence,
    warnings,
    candidateYears,
  }
}
