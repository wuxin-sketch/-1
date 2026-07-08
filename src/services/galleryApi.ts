import { vehicleGalleryTargets } from '../data/vehicleGalleryTargets'
import type { GalleryCandidateActionResponse, GalleryCropSelection, GalleryDiscoverResponse, GalleryStatusResponse } from '../types'
import { buildAdminHeaders } from './adminAuth'

// 构建图库状态接口失败时的空状态。
function buildFallbackGalleryStatus(): GalleryStatusResponse {
  return {
    updatedAt: new Date().toISOString(),
    targetCount: vehicleGalleryTargets.length,
    assetCount: 0,
    preciseAssetCount: 0,
    referenceAssetCount: 0,
    pendingCandidateCount: 0,
    rejectedCandidateCount: 0,
    coverageRate: 0,
    totalCoverageRate: 0,
    targets: vehicleGalleryTargets.map((target) => ({
      vehicleId: target.vehicleId,
      brand: target.brand,
      model: target.model,
      modelYears: target.modelYears,
      coverage: {
        exterior: 'missing',
        interior: 'missing',
        console: 'missing',
        detail: 'missing',
      },
      assets: {},
      pendingCount: 0,
      rejectedCount: 0,
    })),
    candidates: [],
  }
}

// 从本地 API 获取授权图库覆盖和候选状态。
export async function fetchGalleryStatus(): Promise<GalleryStatusResponse> {
  try {
    const response = await fetch('/api/gallery/status', {
      headers: buildAdminHeaders(),
    })
    if (!response.ok) {
      throw new Error(`gallery status failed: ${response.status}`)
    }

    return (await response.json()) as GalleryStatusResponse
  } catch {
    return buildFallbackGalleryStatus()
  }
}

// 请求服务端发现开放授权候选图。
export async function discoverGalleryCandidates(): Promise<GalleryDiscoverResponse> {
  const response = await fetch('/api/gallery/discover', {
    method: 'POST',
    headers: buildAdminHeaders({
      'content-type': 'application/json',
    }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? `gallery discover failed: ${response.status}`)
  }

  return (await response.json()) as GalleryDiscoverResponse
}

// 请求服务端批准指定图库候选图。
export async function approveGalleryCandidate(candidateId: string, cropSelection?: GalleryCropSelection): Promise<GalleryCandidateActionResponse> {
  const response = await fetch(`/api/gallery/candidates/${encodeURIComponent(candidateId)}/approve`, {
    method: 'POST',
    headers: buildAdminHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ note: '前端人工审核批准入库。', cropSelection }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? `gallery approve failed: ${response.status}`)
  }

  return (await response.json()) as GalleryCandidateActionResponse
}

// 请求服务端拒绝指定图库候选图。
export async function rejectGalleryCandidate(candidateId: string, reason = '前端人工审核拒绝。'): Promise<GalleryCandidateActionResponse> {
  const response = await fetch(`/api/gallery/candidates/${encodeURIComponent(candidateId)}/reject`, {
    method: 'POST',
    headers: buildAdminHeaders({
      'content-type': 'application/json',
    }),
    body: JSON.stringify({ reason }),
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null
    throw new Error(payload?.message ?? `gallery reject failed: ${response.status}`)
  }

  return (await response.json()) as GalleryCandidateActionResponse
}

// 生成候选图本地预览代理 URL。
export function getGalleryCandidatePreviewUrl(candidateId: string) {
  return `/api/gallery/candidates/${encodeURIComponent(candidateId)}/preview`
}
