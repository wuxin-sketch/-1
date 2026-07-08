import { describe, expect, it } from 'vitest'
import { isAllowedOpenLicense, normalizeLicenseName, validateGalleryLicense } from '../server/gallery/license'

// 验证图库授权白名单和禁止授权规则。
describe('gallery license validation', () => {
  // 验证可缓存和可裁切的开放授权可以通过。
  it('allows CC0, CC BY, CC BY-SA, and public domain licenses', () => {
    expect(isAllowedOpenLicense('CC0 1.0')).toBe(true)
    expect(isAllowedOpenLicense('CC BY 4.0')).toBe(true)
    expect(isAllowedOpenLicense('CC-BY-SA-4.0')).toBe(true)
    expect(isAllowedOpenLicense('Public domain')).toBe(true)
  })

  // 验证禁止商用或禁止演绎的授权不能自动入库。
  it('blocks unknown, non-commercial, no-derivatives, and all-rights-reserved licenses', () => {
    expect(isAllowedOpenLicense('')).toBe(false)
    expect(isAllowedOpenLicense('CC BY-NC 4.0')).toBe(false)
    expect(isAllowedOpenLicense('CC BY-ND 4.0')).toBe(false)
    expect(isAllowedOpenLicense('All rights reserved')).toBe(false)
  })

  // 验证授权校验必须同时具备作者、许可证和链接。
  it('requires author, license name, and license url', () => {
    expect(validateGalleryLicense({ licenseName: 'CC BY-SA 4.0', licenseUrl: 'https://example.test/license', author: 'Author' }).allowed).toBe(true)
    expect(validateGalleryLicense({ licenseName: 'CC BY-SA 4.0', licenseUrl: '', author: 'Author' }).allowed).toBe(false)
  })

  // 验证 Commons HTML 元数据会先清理再判断。
  it('normalizes html metadata before validation', () => {
    expect(normalizeLicenseName('<span>CC BY-SA 4.0</span>')).toBe('CC BY-SA 4.0')
  })
})
