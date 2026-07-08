import { vehicleSeed } from '../../src/data/vehicles.ts'
import type { NormalizedVehicleRecord, RawVehicleRecord, VehicleRankItem } from '../../src/types.ts'

// 建立示例车型默认值索引。
const seedByModel = new Map(vehicleSeed.map((item) => [`${item.brand} ${item.model}`, item]))

// 建立示例车型 ID 默认值索引。
const seedById = new Map(vehicleSeed.map((item) => [item.id, item]))

// 将任意值转为干净字符串。
function cleanString(value: unknown, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }

  return String(value).trim() || fallback
}

// 将价格字段转为人民币元。
function normalizePrice(value: unknown, fallback: number) {
  const numeric = Number(String(value ?? '').replace(/[^\d.]/g, ''))
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return fallback
  }

  return numeric < 1000 ? Math.round(numeric * 10000) : Math.round(numeric)
}

// 将通用数字字段转为数值。
function normalizeNumber(value: unknown, fallback: number) {
  const numeric = Number(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(numeric) ? numeric : fallback
}

// 从价格区间字段中解析最低价和最高价。
function parsePriceRange(range: string | undefined) {
  if (!range) {
    return null
  }

  const matches = range.match(/\d+(?:\.\d+)?/g)
  if (!matches || matches.length < 2) {
    return null
  }

  return {
    priceMin: normalizePrice(matches[0], 0),
    priceMax: normalizePrice(matches[1], 0),
  }
}

// 将来源字段转为数组。
function normalizeSources(value: RawVehicleRecord['sources'], fallback: string[]) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean)
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(/[、/,|]/).map((item) => cleanString(item)).filter(Boolean)
  }

  return fallback
}

// 将风险提示字段转为数组。
function normalizeRiskNotes(value: RawVehicleRecord['riskNotes'], fallback: string[]) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanString(item)).filter(Boolean)
  }

  if (typeof value === 'string' && value.trim()) {
    return value.split(/[;；|]/).map((item) => cleanString(item)).filter(Boolean)
  }

  return fallback
}

// 为缺失较多的记录降低来源置信度。
function applyMissingFieldPenalty(baseConfidence: number, raw: RawVehicleRecord) {
  const criticalFields: Array<keyof RawVehicleRecord> = [
    'priceMin',
    'priceMax',
    'heatIndex',
    'retentionRate',
    'ageYears',
    'mileageWanKm',
    'sampleSize',
  ]
  const missingCount = criticalFields.filter((field) => raw[field] === undefined || raw[field] === '').length
  return Math.max(35, Math.round(baseConfidence - missingCount * 5))
}

// 为未知车型生成稳定 ID。
function createGeneratedModelId(raw: RawVehicleRecord, index: number) {
  const base = `${cleanString(raw.brand)}-${cleanString(raw.model)}-${index}`
  let hash = 0

  for (const char of base) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }

  return `import-${hash.toString(16)}`
}

// 查找原始记录对应的默认车型样本。
function findSeedVehicle(raw: RawVehicleRecord) {
  if (raw.modelId && seedById.has(raw.modelId)) {
    return seedById.get(raw.modelId)
  }

  const fullName = `${cleanString(raw.brand)} ${cleanString(raw.model)}`
  return seedByModel.get(fullName)
}

// 将原始记录归一化为榜单车型。
export function normalizeRawRecord(raw: RawVehicleRecord, index = 0, importedFrom?: string): NormalizedVehicleRecord {
  const seed = findSeedVehicle(raw)
  const priceRange = parsePriceRange(raw.priceRange)
  const fallback: VehicleRankItem = seed ?? vehicleSeed[index % vehicleSeed.length]
  const priceMin = normalizePrice(raw.priceMin ?? priceRange?.priceMin, fallback.priceMin)
  const priceMax = normalizePrice(raw.priceMax ?? priceRange?.priceMax, fallback.priceMax)
  const sourceConfidence = applyMissingFieldPenalty(normalizeNumber(raw.sourceConfidence, fallback.sourceConfidence), raw)

  return {
    ...fallback,
    id: cleanString(raw.modelId, seed?.id ?? createGeneratedModelId(raw, index)),
    brand: cleanString(raw.brand, fallback.brand),
    model: cleanString(raw.model, fallback.model),
    segment: cleanString(raw.segment, fallback.segment),
    modelYears: cleanString(raw.modelYears, fallback.modelYears),
    priceMin,
    priceMax,
    heatIndex: normalizeNumber(raw.heatIndex, fallback.heatIndex),
    retentionRate: normalizeNumber(raw.retentionRate, fallback.retentionRate),
    ageYears: normalizeNumber(raw.ageYears, fallback.ageYears),
    mileageWanKm: normalizeNumber(raw.mileageWanKm, fallback.mileageWanKm),
    sourceConfidence,
    sampleSize: normalizeNumber(raw.sampleSize, fallback.sampleSize),
    sources: normalizeSources(raw.sources, fallback.sources),
    updatedAt: cleanString(raw.updatedAt, new Date().toISOString()),
    riskLevel: raw.riskLevel ?? fallback.riskLevel,
    riskNotes: normalizeRiskNotes(raw.riskNotes, fallback.riskNotes),
    advice: cleanString(raw.advice, fallback.advice),
    dataMode: 'imported',
    importedFrom,
  }
}

// 将原始记录列表归一化为车型列表。
export function normalizeRawRecords(records: RawVehicleRecord[], importedFrom?: string) {
  return records.map((record, index) => normalizeRawRecord(record, index, importedFrom))
}
