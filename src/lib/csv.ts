import type { VehicleRankItem } from '../types'

// 中和电子表格会识别为公式的单元格前缀。
function neutralizeSpreadsheetFormula(value: string) {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
}

// 转义 CSV 单元格内容。
export function escapeCsvCell(value: string | number | undefined) {
  const raw = neutralizeSpreadsheetFormula(String(value ?? ''))
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replaceAll('"', '""')}"`
  }

  return raw
}

// 将榜单数据转换为 CSV 文本。
export function buildRankingCsv(items: VehicleRankItem[]) {
  const header = ['排名', '车型', '年款', '参考价', '保值率', '车龄里程', '来源置信度', '综合价值分', '数据源']
  const rows = items.map((item) => [
    item.rank,
    `${item.brand} ${item.model}`,
    item.modelYears,
    `${(item.priceMin / 10000).toFixed(1)}-${(item.priceMax / 10000).toFixed(1)}万`,
    `${item.retentionRate}%`,
    `${item.ageYears.toFixed(1)}年 / ${item.mileageWanKm.toFixed(1)}万公里`,
    item.sourceConfidence,
    item.valueScore,
    item.sources.join(' / '),
  ])

  return [header, ...rows].map((row) => row.map(escapeCsvCell).join(',')).join('\n')
}
