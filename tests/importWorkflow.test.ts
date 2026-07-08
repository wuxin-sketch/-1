import { existsSync } from 'node:fs'
import { readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { clearImportPreviewStoreForTests, commitImportPreview, importPreviewMaxCount, previewImportData } from '../server/pipeline/importWorkflow'
import { readRankingCache } from '../server/pipeline/cache'
import { getCachePath, getLatestRunPath, runsDir } from '../server/pipeline/paths'

// 定义导入闭环测试使用的月份。
const testMonth = '2099-02'

// 定义导入闭环测试使用的导入目录。
const importsDir = resolve(process.cwd(), 'data', 'imports')

// 保存测试运行前的最新管线记录内容。
let originalLatestRunContent: string | null = null

// 构建导入闭环测试使用的 CSV 内容。
function buildCsvContent() {
  return [
    'modelId,brand,model,segment,modelYears,priceMin,priceMax,heatIndex,retentionRate,ageYears,mileageWanKm,sourceConfidence,sampleSize,sources,updatedAt',
    'honda-crv,Honda,CR-V,SUV,2021-2023,11.9,16.8,96,78,2.8,4.1,92,182,Imported CSV,2099-02-28',
  ].join('\n')
}

// 备份最新管线记录以便测试后恢复。
beforeEach(async () => {
  clearImportPreviewStoreForTests()
  const latestRunPath = getLatestRunPath()
  originalLatestRunContent = existsSync(latestRunPath) ? await readFile(latestRunPath, 'utf8') : null
})

// 清理导入闭环测试产生的临时缓存和归档文件。
afterEach(async () => {
  clearImportPreviewStoreForTests()
  await rm(getCachePath(testMonth), { force: true })

  if (existsSync(importsDir)) {
    const files = await readdir(importsDir)
    await Promise.all(
      files
        .filter((file) => file.startsWith(`${testMonth}-`) && file.includes('real-month.csv'))
        .map((file) => rm(resolve(importsDir, file), { force: true })),
    )
  }

  if (existsSync(runsDir)) {
    const runFiles = await readdir(runsDir)
    await Promise.all(
      runFiles
        .filter((file) => file.startsWith(`${testMonth}-import-`))
        .map((file) => rm(resolve(runsDir, file), { force: true })),
    )
  }

  if (originalLatestRunContent) {
    await writeFile(getLatestRunPath(), originalLatestRunContent, 'utf8')
  } else {
    await rm(getLatestRunPath(), { force: true })
  }
})

// 验证真实月度数据导入闭环。
describe('import workflow', () => {
  // 验证导入预览会拒绝可能逃逸数据目录的月份参数。
  it('rejects unsafe preview month without storing a preview', () => {
    const preview = previewImportData({
      month: '../../package',
      fileName: 'real-month.csv',
      content: buildCsvContent(),
    })

    expect(preview.previewId).toBeNull()
    expect(preview.errors.some((error) => error.includes('YYYY-MM'))).toBe(true)
  })

  // 验证导入预览缓存数量受控，避免未确认上传长期占满内存。
  it('limits pending preview memory count', () => {
    for (let index = 0; index < importPreviewMaxCount; index += 1) {
      const preview = previewImportData(
        {
          month: testMonth,
          fileName: `real-month-${index}.csv`,
          content: buildCsvContent(),
        },
        new Date(`2099-02-28T10:${String(index).padStart(2, '0')}:00.000Z`),
      )

      expect(preview.previewId).toBeTruthy()
    }

    const blockedPreview = previewImportData({
      month: testMonth,
      fileName: 'real-month-overflow.csv',
      content: buildCsvContent(),
    })

    expect(blockedPreview.previewId).toBeNull()
    expect(blockedPreview.errors.length).toBeGreaterThan(0)
  })

  // 验证 CSV 内容可以生成可确认的预览。
  it('previews csv content with normalized records and warnings', () => {
    const preview = previewImportData(
      {
        month: testMonth,
        fileName: 'real-month.csv',
        content: buildCsvContent(),
      },
      new Date('2099-02-28T10:00:00.000Z'),
    )

    expect(preview.previewId).toBeTruthy()
    expect(preview.recordCount).toBe(1)
    expect(preview.validRecordCount).toBe(1)
    expect(preview.errors).toEqual([])
    expect(preview.previewItems[0].id).toBe('honda-crv')
  })

  // 验证确认导入会归档原文件并写入 imported 月度缓存。
  it('commits a preview into archived import and ranking cache', async () => {
    const preview = previewImportData(
      {
        month: testMonth,
        fileName: 'real-month.csv',
        content: buildCsvContent(),
      },
      new Date('2099-02-28T10:00:00.000Z'),
    )

    const result = await commitImportPreview(preview.previewId ?? '', new Date('2099-02-28T10:01:00.000Z'))
    const cache = await readRankingCache(testMonth)

    expect(result.month).toBe(testMonth)
    expect(result.run.dataMode).toBe('imported')
    expect(result.run.successCount).toBe(1)
    expect(result.importedFile).toContain('real-month.csv')
    expect(cache?.dataMode).toBe('imported')
    expect(cache?.items[0].id).toBe('honda-crv')
  })

  // 验证过期或不存在的预览不能确认入库。
  it('rejects missing previews on commit', async () => {
    await expect(commitImportPreview('missing-preview-id')).rejects.toThrow('导入预览已过期或不存在')
  })
})
