import type { ApprovedGalleryAsset, GalleryAssetKind } from '../types'

// 定义本地种子图库的车型 ID 列表。
const seedVehicleIds = [
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

// 定义本地种子图库的四类图片文件名后缀。
const seedKindFileSuffix: Record<GalleryAssetKind, string> = {
  exterior: '',
  interior: '-interior',
  console: '-console',
  detail: '-detail',
}

// 定义本地种子图库的来源页面。
const seedSourcePages: Record<string, { exterior: string; interior: string }> = {
  'honda-crv': {
    exterior: 'https://commons.wikimedia.org/wiki/File:2021_Honda_CR-V_2.4_Black_Edition.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Honda_CR-V_2.0_RS_e-HEV_-_interior_view.jpg',
  },
  'toyota-rav4': {
    exterior: 'https://commons.wikimedia.org/wiki/File:2021_Toyota_RAV4_PHV.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:The_interior_of_Toyota_RAV4_Adventure_(6AA-AXAN64-ANXVB).jpg',
  },
  'nissan-xtrail': {
    exterior: 'https://commons.wikimedia.org/wiki/File:Nissan_X-Trail_IV_IMG001.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:NISSAN_X-TRAIL_ePOWER_(T33)_CHINA_VERSION_INTERIOR.jpg',
  },
  'vw-tiguan-l': {
    exterior: 'https://commons.wikimedia.org/wiki/File:Volkswagen_Tiguan_L_Pro_007.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Tiguan-fl-2020-innenraum.jpg',
  },
  'buick-envision': {
    exterior: 'https://commons.wikimedia.org/wiki/File:2021_Buick_Envision.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:2022_Buick_Envision_interior.jpg',
  },
  'honda-breeze': {
    exterior: 'https://commons.wikimedia.org/wiki/File:Honda_Breeze_009.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Honda_CR-V_2.0_RS_e-HEV_-_interior_view.jpg',
  },
  'mazda-cx5': {
    exterior: 'https://commons.wikimedia.org/wiki/File:2020-2021_Mazda_CX-5_XD_AWD.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Mazda_CX-5_25S_L_Package_2WD_(6BA-KF5P)_interior.jpg',
  },
  'skoda-kodiaq': {
    exterior: 'https://commons.wikimedia.org/wiki/File:2021_SKODA_Kodiaq_1.4_Ambition_silver_front_view_in_Brunei.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:2021_SKODA_Kodiaq_1.4_Ambition_silver_interior_view_in_Brunei.jpg',
  },
  'hyundai-santafe': {
    exterior: 'https://commons.wikimedia.org/wiki/File:Hyundai_Santa_Fe_IV_China_001.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Dashboard_Hyundai_Santa_Fe.jpg',
  },
  'chevrolet-equinox': {
    exterior: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Equinox_III_facelift_001.jpg',
    interior: 'https://commons.wikimedia.org/wiki/File:Chevrolet_Equinox_2017_CUV_Interior.jpg',
  },
}

// 根据车型和分类生成本地种子图库路径。
function buildSeedAssetPath(vehicleId: string, kind: GalleryAssetKind) {
  if (kind === 'exterior') {
    return `/assets/vehicle-photos/${vehicleId}.jpg`
  }

  return `/assets/vehicle-gallery/${vehicleId}${seedKindFileSuffix[kind]}.jpg`
}

// 根据车型和分类选择可追溯来源页面。
function getSeedSourcePage(vehicleId: string, kind: GalleryAssetKind) {
  const source = seedSourcePages[vehicleId]
  return kind === 'interior' || kind === 'console' ? source.interior : source.exterior
}

// 根据车型和分类生成种子图库授权记录。
function buildSeedAsset(vehicleId: string, kind: GalleryAssetKind): ApprovedGalleryAsset {
  const src = buildSeedAssetPath(vehicleId, kind)
  const sourcePageUrl = getSeedSourcePage(vehicleId, kind)
  const isCrop = kind === 'console' || kind === 'detail'

  return {
    id: `seed-${vehicleId}-${kind}`,
    vehicleId,
    kind,
    quality: 'reference',
    src,
    localPath: `public${src}`,
    sourceProvider: 'Wikimedia Commons',
    sourcePageUrl,
    fileUrl: sourcePageUrl,
    author: 'Wikimedia Commons 贡献者',
    licenseName: '开放授权元数据以源页为准',
    licenseUrl: sourcePageUrl,
    width: 0,
    height: 0,
    approvedAt: '2026-07-07T00:00:00.000+08:00',
    reviewerNote: isCrop ? '本地裁切自同车型来源图，用于保持四类图片一致。' : '本地已缓存实拍参考图。',
    cropSelection: isCrop
      ? {
          mode: kind === 'console' ? 'console-crop' : 'detail-crop',
          note: '本地参考图裁切记录，等待精确授权图替换。',
        }
      : undefined,
    matchEvidence: isCrop ? ['本地裁切资产', '车型 ID 与来源图一致'] : ['本地缓存资产', '车型 ID 与来源页一致'],
    status: 'approved',
  }
}

// 构建前端可读取的本地种子图库 manifest。
export function buildSeedGalleryAssets(): ApprovedGalleryAsset[] {
  return seedVehicleIds.flatMap((vehicleId) =>
    (['exterior', 'interior', 'console', 'detail'] as GalleryAssetKind[]).map((kind) => buildSeedAsset(vehicleId, kind)),
  )
}
