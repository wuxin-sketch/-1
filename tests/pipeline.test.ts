import { mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { parseVehicleCsv } from '../server/pipeline/csv'
import { buildSourceCoverage, readRankingCache, writeRankingCache } from '../server/pipeline/cache'
import { assertValidPipelineMonth, getCachePath, getDefaultJsonImportPath, getRunPath } from '../server/pipeline/paths'
import { readRawVehicleRecords } from '../server/pipeline/importer'
import { normalizeRawRecords } from '../server/pipeline/normalizer'
import { createRankingResponse, defaultRankingQuery } from '../src/lib/rankingEngine'

// 定义管线测试使用的临时月份。
const testMonth = '2099-01'

// 定义管线测试使用的临时导入目录。
const tempImportDir = resolve(process.cwd(), 'data', 'imports', 'test-pipeline')

// 清理管线测试产生的临时文件。
afterEach(async () => {
  await rm(getCachePath(testMonth), { force: true })
  await rm(tempImportDir, { force: true, recursive: true })
})

// 验证真实数据管线的导入、归一化和缓存行为。
describe('data pipeline', () => {
  // 验证管线路径只接受安全的月份和运行记录名。
  it('rejects unsafe month and run path inputs', () => {
    expect(() => assertValidPipelineMonth('../../package')).toThrow('YYYY-MM')
    expect(() => getDefaultJsonImportPath('2099-13')).toThrow('YYYY-MM')
    expect(() => getRunPath('../escape')).toThrow()
  })

  // 验证中文 CSV 表头可以映射为原始车型字段。
  it('parses csv records with Chinese headers and quoted ranges', () => {
    const csv = [
      '车型ID,品牌,车型,参考价,热度指数,保值率,数据源',
      'honda-crv,本田,CR-V,"12.8-15.6万",91,74,"瓜子、车300"',
    ].join('\n')
    const records = parseVehicleCsv(csv)

    expect(records).toHaveLength(1)
    expect(records[0].modelId).toBe('honda-crv')
    expect(records[0].priceRange).toBe('12.8-15.6万')
    expect(records[0].sources).toBe('瓜子、车300')
  })

  // 验证 JSON 导入器可以读取 records 包裹结构。
  it('reads json imports with records wrapper', async () => {
    await mkdir(tempImportDir, { recursive: true })
    const file = resolve(tempImportDir, 'records.json')
    await writeFile(file, JSON.stringify({ records: [{ modelId: 'toyota-rav4', brand: '丰田', model: 'RAV4荣放' }] }), 'utf8')

    const records = await readRawVehicleRecords(file)

    expect(records).toHaveLength(1)
    expect(records[0].modelId).toBe('toyota-rav4')
  })

  // 验证缺失关键字段会降低来源置信度但保留可展示默认值。
  it('normalizes records and penalizes missing critical fields', () => {
    const [record] = normalizeRawRecords([{ modelId: 'toyota-rav4', brand: '丰田', model: 'RAV4荣放', sourceConfidence: '90' }])

    expect(record.id).toBe('toyota-rav4')
    expect(record.priceMin).toBeGreaterThan(0)
    expect(record.sourceConfidence).toBeLessThan(90)
    expect(record.dataMode).toBe('imported')
  })

  // 验证月度缓存会驱动榜单进入导入数据模式。
  it('uses cached imported records to build ranking responses', async () => {
    const [record] = normalizeRawRecords([
      {
        modelId: 'cached-suv',
        brand: '缓存',
        model: '测试SUV',
        priceMin: 120000,
        priceMax: 160000,
        heatIndex: 88,
        retentionRate: 70,
        ageYears: 3,
        mileageWanKm: 5,
        sourceConfidence: 82,
        sampleSize: 120,
        sources: ['导入CSV'],
      },
    ])
    const sourceCoverage = buildSourceCoverage({
      sourceCount: 1,
      availableSourceCount: 1,
      sampleCount: 120,
      importedRecordCount: 1,
      modeNote: '测试导入缓存。',
    })

    await writeRankingCache({
      month: testMonth,
      dataMode: 'imported',
      items: [record],
      updatedAt: '2099-01-31T12:00:00.000Z',
      sourceCoverage,
      pipelineRunId: 'test-run',
    })

    const cache = await readRankingCache(testMonth)
    const ranking = createRankingResponse(
      { ...defaultRankingQuery, month: testMonth, priceMin: 100000, priceMax: 200000 },
      cache?.items,
      {
        dataMode: cache?.dataMode,
        sourceCoverage: cache?.sourceCoverage,
        pipelineRunId: cache?.pipelineRunId,
        updatedAt: cache?.updatedAt,
      },
    )

    expect(cache?.dataMode).toBe('imported')
    expect(ranking.dataMode).toBe('imported')
    expect(ranking.pipelineRunId).toBe('test-run')
    expect(ranking.items[0].brand).toBe('缓存')
  })
})
