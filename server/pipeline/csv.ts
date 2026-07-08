import type { RawVehicleRecord } from '../../src/types.ts'

// 解析单行 CSV 内容。
function parseCsvLine(line: string) {
  const cells: string[] = []
  let current = ''
  let quoted = false

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]
    const next = line[index + 1]

    if (char === '"' && quoted && next === '"') {
      current += '"'
      index += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === ',' && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += char
    }
  }

  cells.push(current.trim())
  return cells
}

// 将 CSV 表头映射到原始记录字段。
function mapHeader(header: string) {
  const normalized = header.trim()
  const mapping: Record<string, keyof RawVehicleRecord> = {
    modelId: 'modelId',
    id: 'modelId',
    车型ID: 'modelId',
    brand: 'brand',
    品牌: 'brand',
    model: 'model',
    车型: 'model',
    segment: 'segment',
    级别: 'segment',
    modelYears: 'modelYears',
    年款: 'modelYears',
    priceMin: 'priceMin',
    最低价: 'priceMin',
    priceMax: 'priceMax',
    最高价: 'priceMax',
    priceRange: 'priceRange',
    参考价: 'priceRange',
    heatIndex: 'heatIndex',
    热度指数: 'heatIndex',
    retentionRate: 'retentionRate',
    保值率: 'retentionRate',
    ageYears: 'ageYears',
    车龄: 'ageYears',
    mileageWanKm: 'mileageWanKm',
    里程: 'mileageWanKm',
    sourceConfidence: 'sourceConfidence',
    来源置信度: 'sourceConfidence',
    sampleSize: 'sampleSize',
    样本量: 'sampleSize',
    sources: 'sources',
    数据源: 'sources',
    updatedAt: 'updatedAt',
    更新时间: 'updatedAt',
    riskLevel: 'riskLevel',
    风险等级: 'riskLevel',
    riskNotes: 'riskNotes',
    风险提示: 'riskNotes',
    advice: 'advice',
    购买建议: 'advice',
  }

  return mapping[normalized]
}

// 将 CSV 文本解析为原始车型记录。
export function parseVehicleCsv(content: string) {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/).filter((line) => line.trim())
  if (lines.length < 2) {
    return []
  }

  const headers = parseCsvLine(lines[0]).map(mapHeader)

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line)
    const record: RawVehicleRecord = {}

    headers.forEach((header, index) => {
      if (header && values[index] !== undefined && values[index] !== '') {
        record[header] = values[index] as never
      }
    })

    return record
  })
}
