import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getVehicleGallery, getVehicleImagePath } from '../src/lib/vehicleImages'

// 定义当前榜单中需要四类图库一致性的已知车型。
const knownVehicleIds = [
  'honda-crv',
  'toyota-rav4',
  'nissan-xtrail',
  'vw-tiguan-l',
  'buick-envision',
  'honda-breeze',
  'mazda-cx5',
  'skoda-kodiaq',
  'hyundai-santafe',
  'chevrolet-equinox',
]

// 验证车型缩略图映射。
describe('vehicle image mapping', () => {
  // 验证已知车型使用对应本地缩略图。
  it('returns a dedicated local thumbnail for known vehicles', () => {
    expect(getVehicleImagePath({ id: 'honda-crv' })).toMatch(/^\/assets\/vehicle-(photos|gallery)\/honda-crv(-exterior)?\.jpg$/)
    expect(getVehicleImagePath({ id: 'toyota-rav4' })).toMatch(/^\/assets\/vehicle-(photos|gallery)\/toyota-rav4(-exterior)?\.jpg$/)
  })

  // 验证未知车型使用兜底缩略图。
  it('returns the fallback thumbnail for unknown vehicles', () => {
    expect(getVehicleImagePath({ id: 'unknown-model' })).toBe('/assets/vehicle-photos/fallback.jpg')
  })

  // 验证已知车型图库包含外观、内饰、中控、细节四类实车图片。
  it('returns a four-part local gallery for known vehicles', () => {
    const gallery = getVehicleGallery({ id: 'honda-crv', brand: '本田', model: 'CR-V' })

    expect(gallery).toHaveLength(4)
    expect(gallery.map((item) => item.kind)).toEqual(['外观', '内饰', '中控', '细节'])
    expect(gallery[0].src).toMatch(/^\/assets\/vehicle-(photos|gallery)\/honda-crv(-exterior)?\.jpg$/)
    expect(gallery.slice(1).map((item) => item.src)).toEqual([
      '/assets/vehicle-gallery/honda-crv-interior.jpg',
      '/assets/vehicle-gallery/honda-crv-console.jpg',
      '/assets/vehicle-gallery/honda-crv-detail.jpg',
    ])
    expect(gallery.every((item) => item.src.endsWith('.jpg'))).toBe(true)
  })

  // 验证已知车型不会复用跨车型共享中控图。
  it('uses vehicle-scoped console images for every known vehicle', () => {
    knownVehicleIds.forEach((vehicleId) => {
      const gallery = getVehicleGallery({ id: vehicleId, brand: vehicleId, model: 'SUV' })
      const consoleImage = gallery.find((item) => item.kind === '中控')
      const assetPath = resolve(process.cwd(), 'public', consoleImage?.src.replace(/^\//, '') ?? '')

      expect(consoleImage?.src).toBe(`/assets/vehicle-gallery/${vehicleId}-console.jpg`)
      expect(consoleImage?.src).not.toContain('shared-console')
      expect(existsSync(assetPath)).toBe(true)
    })
  })

  // 验证未知车型图库不会复用其他车型图片。
  it('returns missing gallery placeholders for unknown vehicles', () => {
    const gallery = getVehicleGallery({ id: 'unknown-model', brand: '未知', model: 'SUV' })

    expect(gallery).toHaveLength(4)
    expect(gallery.every((item) => item.isMissing)).toBe(true)
    expect(gallery.every((item) => item.src === '')).toBe(true)
    expect(gallery.map((item) => item.sourceNote)).toEqual(['待授权实拍图', '待授权实拍图', '待授权实拍图', '待授权实拍图'])
  })
})
