// 定义允许自动入库的开放授权关键词。
const allowedLicensePatterns = [/^CC0\b/i, /^CC BY\b/i, /^CC-BY\b/i, /^CC BY-SA\b/i, /^CC-BY-SA\b/i, /public domain/i]

// 定义禁止自动入库的授权限制关键词。
const blockedLicensePatterns = [/\bNC\b/i, /\bND\b/i, /non-?commercial/i, /no derivatives/i, /all rights reserved/i, /copyrighted/i]

// 清理授权名称中的 HTML 和多余空白。
export function normalizeLicenseName(value: string | undefined | null) {
  return String(value ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// 判断授权名称是否属于可缓存、可裁切的开放授权。
export function isAllowedOpenLicense(licenseName: string | undefined | null) {
  const normalized = normalizeLicenseName(licenseName)

  if (!normalized) {
    return false
  }

  if (blockedLicensePatterns.some((pattern) => pattern.test(normalized))) {
    return false
  }

  return allowedLicensePatterns.some((pattern) => pattern.test(normalized))
}

// 返回图库候选图授权校验结论。
export function validateGalleryLicense(params: { licenseName?: string | null; licenseUrl?: string | null; author?: string | null }) {
  const licenseName = normalizeLicenseName(params.licenseName)
  const licenseUrl = String(params.licenseUrl ?? '').trim()
  const author = normalizeLicenseName(params.author)

  if (!licenseName || !licenseUrl || !author) {
    return { allowed: false, reason: '缺少作者、许可证或许可证链接，不能自动入库。' }
  }

  if (!isAllowedOpenLicense(licenseName)) {
    return { allowed: false, reason: `许可证 ${licenseName} 不在开放授权白名单内。` }
  }

  return { allowed: true, reason: '许可证允许本地缓存和必要裁切。' }
}
