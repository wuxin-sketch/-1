import { describe, expect, it } from 'vitest'
import { normalizeSourceHtml, sourceAdapters, validateSourceHtml } from '../server/sources/adapters'
import { collectFixtureSourceStatuses, readFixtureHtml } from '../server/sources/collector'

// 验证公开源 fixture 可以被解析为车型信号。
describe('source adapters', () => {
  it('normalizes explicit data-model snapshots', async () => {
    const html = await readFixtureHtml('guazi')
    const snapshots = normalizeSourceHtml(html, 'guazi')

    expect(snapshots).toHaveLength(4)
    expect(snapshots[0].modelId).toBe('honda-crv')
  })

  it('marks usable fixture source as normal', async () => {
    const html = await readFixtureHtml('che300')
    const status = validateSourceHtml(html, {
      id: 'che300',
      name: '车300',
      url: 'https://www.che300.com/',
    })

    expect(status.health).toBe('normal')
    expect(status.sampleCount).toBeGreaterThan(0)
  })

  it('downgrades empty source content', () => {
    const status = validateSourceHtml('', {
      id: 'empty',
      name: '空源',
      url: 'https://example.com/',
    })

    expect(status.health).toBe('offline')
  })

  it('counts keyword mentions as public source weak signals', () => {
    const html = '<html><body>本田CR-V二手车 本田 CR-V二手车 丰田RAV4二手车</body></html>'
    const snapshots = normalizeSourceHtml(html, 'public-text')

    expect(snapshots.find((snapshot) => snapshot.modelId === 'honda-crv')?.listingCount).toBe(2)
    expect(snapshots.find((snapshot) => snapshot.modelId === 'toyota-rav4')?.listingCount).toBe(1)
  })

  it('includes expanded public source adapters and fixtures', async () => {
    const sourceIds = sourceAdapters.map((adapter) => adapter.id)
    const statuses = await collectFixtureSourceStatuses()

    expect(sourceIds).toEqual(expect.arrayContaining(['yiche', 'che168', 'autohome', 'dongchedi']))
    expect(statuses).toHaveLength(sourceAdapters.length)
    expect(statuses.every((status) => status.sampleCount > 0)).toBe(true)
  })
})
