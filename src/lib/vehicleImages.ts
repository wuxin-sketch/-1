import type { ApprovedGalleryAsset, GalleryAssetKind, VehicleRankItem } from '../types'
import { vehicleGalleryManifest } from '../data/vehicleGalleryManifest'

// 定义车型图库的中文图片分类。
export type VehicleGalleryKind = '外观' | '内饰' | '中控' | '细节'

// 定义车型图库单张图片结构。
export interface VehicleGalleryImage {
  kind: VehicleGalleryKind
  label: string
  src: string
  alt: string
  isMissing: boolean
  asset?: ApprovedGalleryAsset
  sourceNote?: string
}

// 定义图库资产类别到中文分类的映射。
const galleryKindLabels: Record<GalleryAssetKind, VehicleGalleryKind> = {
  exterior: '外观',
  interior: '内饰',
  console: '中控',
  detail: '细节',
}

// 定义车型弹窗需要展示的图库顺序。
const galleryKindOrder: GalleryAssetKind[] = ['exterior', 'interior', 'console', 'detail']

// 定义未知车型列表缩略图兜底资源。
const fallbackVehicleImage = '/assets/vehicle-photos/fallback.jpg'

// 构建车型分类到授权资产的快速索引。
const galleryAssetByVehicleKind = new Map(vehicleGalleryManifest.map((asset) => [`${asset.vehicleId}:${asset.kind}`, asset]))

// 从 manifest 中读取指定车型和分类的授权图库资产。
function findGalleryAsset(vehicleId: string, kind: GalleryAssetKind) {
  return galleryAssetByVehicleKind.get(`${vehicleId}:${kind}`)
}

// 构建缺少授权资产时的图库占位项。
function buildMissingGalleryImage(vehicleName: string, kind: GalleryAssetKind): VehicleGalleryImage {
  const label = galleryKindLabels[kind]

  return {
    kind: label,
    label,
    src: '',
    alt: `${vehicleName}${label}待授权实拍图`,
    isMissing: true,
    sourceNote: '待授权实拍图',
  }
}

// 构建已经批准入库的图库展示项。
function buildApprovedGalleryImage(vehicleName: string, kind: GalleryAssetKind, asset: ApprovedGalleryAsset): VehicleGalleryImage {
  const label = galleryKindLabels[kind]
  const qualityLabel = asset.quality === 'precise' ? '精确授权图' : '本地参考图'

  return {
    kind: label,
    label,
    src: asset.src,
    alt: `${vehicleName}${label}授权实拍图`,
    isMissing: false,
    asset,
    sourceNote: `${qualityLabel} · ${asset.sourceProvider} · ${asset.licenseName}`,
  }
}

// 根据车型 ID 返回本地缩略图路径。
export function getVehicleImagePath(vehicle: Pick<VehicleRankItem, 'id'>) {
  return findGalleryAsset(vehicle.id, 'exterior')?.src ?? fallbackVehicleImage
}

// 根据车型信息返回可切换的授权实车图库。
export function getVehicleGallery(vehicle: Pick<VehicleRankItem, 'id' | 'brand' | 'model'>): VehicleGalleryImage[] {
  const vehicleName = `${vehicle.brand} ${vehicle.model}`

  return galleryKindOrder.map((kind) => {
    const asset = findGalleryAsset(vehicle.id, kind)
    return asset ? buildApprovedGalleryImage(vehicleName, kind, asset) : buildMissingGalleryImage(vehicleName, kind)
  })
}
