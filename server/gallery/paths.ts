import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 定义图库存储需要访问的本地路径集合。
export interface GalleryStorePaths {
  projectRoot: string
  galleryDataDir: string
  candidatesPath: string
  approvedPath: string
  publicGalleryDir: string
  manifestPath: string
  attributionPath: string
}

// 定位服务端图库模块所在目录。
const galleryServerDir = dirname(fileURLToPath(import.meta.url))

// 定位项目根目录。
const projectRoot = resolve(galleryServerDir, '..', '..')

// 构建图库存储使用的默认路径集合。
export function getDefaultGalleryStorePaths(): GalleryStorePaths {
  const galleryDataDir = resolve(projectRoot, 'data', 'gallery')

  return {
    projectRoot,
    galleryDataDir,
    candidatesPath: resolve(galleryDataDir, 'candidates.json'),
    approvedPath: resolve(galleryDataDir, 'approved.json'),
    publicGalleryDir: resolve(projectRoot, 'public', 'assets', 'vehicle-gallery'),
    manifestPath: resolve(projectRoot, 'src', 'data', 'vehicleGalleryManifest.ts'),
    attributionPath: resolve(projectRoot, 'public', 'assets', 'vehicle-photos', 'ATTRIBUTION.md'),
  }
}
