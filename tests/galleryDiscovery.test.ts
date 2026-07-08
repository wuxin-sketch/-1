import { describe, expect, it } from 'vitest'
import { discoverGalleryCandidates } from '../server/gallery/discovery'
import type { VehicleGalleryTarget } from '../src/types'

// 定义图库发现测试使用的目标车型。
const target: VehicleGalleryTarget = {
  vehicleId: 'honda-crv',
  brand: '本田',
  model: 'CR-V',
  modelYears: '2021-2023',
  aliases: ['Honda CR-V'],
  yearHints: [2021, 2022, 2023],
  generationHints: ['e:HEV'],
  kinds: ['interior'],
  categoryKeywords: {
    exterior: ['front'],
    interior: ['interior', 'cabin'],
    console: ['dashboard'],
    detail: ['wheel'],
  },
}

// 构建 Commons 测试页面。
function buildCommonsPage(id: string, licenseName: string) {
  return {
    title: `File:2022 Honda CR-V e:HEV interior ${id}.jpg`,
    imageinfo: [
      {
        url: `https://upload.wikimedia.org/${id}.jpg`,
        thumburl: `https://upload.wikimedia.org/${id}-thumb.jpg`,
        descriptionurl: `https://commons.wikimedia.org/wiki/File:${id}.jpg`,
        mime: 'image/jpeg',
        width: 1600,
        height: 1000,
        extmetadata: {
          ImageDescription: { value: '2022 Honda CR-V e:HEV interior cabin dashboard' },
          Artist: { value: 'Commons Photographer' },
          LicenseShortName: { value: licenseName },
          LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        },
      },
    ],
  }
}

// 验证 Commons 候选发现和授权过滤。
describe('gallery discovery', () => {
  // 验证发现逻辑只保留开放授权且匹配达标的候选图。
  it('returns only allowed and well-matched commons candidates', async () => {
    const fetcher = async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        query: {
          pages: {
            valid: buildCommonsPage('valid', 'CC BY-SA 4.0'),
            blocked: buildCommonsPage('blocked', 'CC BY-NC 4.0'),
          },
        },
      }),
    })

    const result = await discoverGalleryCandidates({
      targets: [target],
      kinds: ['interior'],
      fetcher,
      now: new Date('2026-07-07T10:00:00.000Z'),
    })

    expect(result.candidates).toHaveLength(1)
    expect(result.candidates[0].id).toContain('honda-crv-interior')
    expect(result.candidates[0].licenseName).toBe('CC BY-SA 4.0')
    expect(result.candidates[0].reviewStatus).toBe('pending')
  })
})
