import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ExternalLink, Image, Scissors, Search, ShieldCheck, XCircle } from 'lucide-react'
import {
  approveGalleryCandidate,
  discoverGalleryCandidates,
  fetchGalleryStatus,
  getGalleryCandidatePreviewUrl,
  rejectGalleryCandidate,
} from '../services/galleryApi'
import { vehicleGalleryKindLabels } from '../data/vehicleGalleryTargets'
import type { GalleryAssetKind, GalleryCandidate, GalleryCoverageState, GalleryCropMode, GalleryCropSelection, GalleryStatusResponse } from '../types'

// 将图库覆盖状态转换为中文文案。
function getCoverageStateLabel(state: GalleryCoverageState) {
  if (state === 'precise') {
    return '精确授权'
  }

  if (state === 'reference') {
    return '本地参考'
  }

  if (state === 'pending') {
    return '待审核'
  }

  return '待授权'
}

// 将图库覆盖状态转换为样式类名。
function getCoverageStateClass(state: GalleryCoverageState) {
  return `gallery-coverage-chip ${state}`
}

// 格式化图库候选图置信分。
function formatConfidence(candidate: GalleryCandidate) {
  return `${Math.round(candidate.confidence)}分`
}

// 判断候选图是否需要人工裁切确认。
function needsCropConfirmation(candidate: GalleryCandidate) {
  return candidate.kind === 'console' || candidate.kind === 'detail'
}

// 为中控和细节候选图生成默认人工裁切确认。
function buildCropSelection(candidate: GalleryCandidate): GalleryCropSelection | undefined {
  if (!needsCropConfirmation(candidate)) {
    return undefined
  }

  return {
    mode: candidate.kind === 'console' ? 'console-crop' : 'detail-crop',
    note: candidate.kind === 'console' ? '人工确认中控区域裁切。' : '人工确认细节区域裁切。',
  }
}

// 根据候选图和选择模式生成裁切确认备注。
function buildCropSelectionForMode(candidate: GalleryCandidate, mode: GalleryCropMode): GalleryCropSelection {
  const noteMap: Record<GalleryCropMode, string> = {
    source: '人工确认使用授权原图。',
    'center-crop': '人工确认使用授权原图中心区域裁切。',
    'console-crop': '人工确认中控区域裁切。',
    'detail-crop': '人工确认细节区域裁切。',
  }

  return {
    mode,
    note: noteMap[mode] ?? (candidate.kind === 'console' ? '人工确认中控区域裁切。' : '人工确认细节区域裁切。'),
  }
}

// 渲染授权图库自动化审核面板。
export function GalleryAuditPanel() {
  const [status, setStatus] = useState<GalleryStatusResponse | null>(null)
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isDiscovering, setIsDiscovering] = useState(false)
  const [activeCandidateId, setActiveCandidateId] = useState('')
  const [cropSelections, setCropSelections] = useState<Record<string, GalleryCropSelection>>({})

  // 读取最新图库审核状态。
  async function loadStatus() {
    setIsLoading(true)
    try {
      setStatus(await fetchGalleryStatus())
    } finally {
      setIsLoading(false)
    }
  }

  // 首次渲染时加载图库状态。
  useEffect(() => {
    void loadStatus()
  }, [])

  // 取出待审核候选图并按置信分排序。
  const pendingCandidates = useMemo(
    () => (status?.candidates ?? []).filter((candidate) => candidate.reviewStatus === 'pending').slice(0, 12),
    [status?.candidates],
  )

  // 读取候选图当前选择的裁切确认。
  function getCandidateCropSelection(candidate: GalleryCandidate) {
    return cropSelections[candidate.id] ?? buildCropSelection(candidate)
  }

  // 更新候选图的人工裁切确认模式。
  function handleCropModeChange(candidate: GalleryCandidate, mode: GalleryCropMode) {
    setCropSelections((current) => ({
      ...current,
      [candidate.id]: buildCropSelectionForMode(candidate, mode),
    }))
  }

  // 触发开放授权候选图发现。
  async function handleDiscover() {
    setIsDiscovering(true)
    setMessage('正在搜索开放授权候选图...')

    try {
      const result = await discoverGalleryCandidates()
      setStatus(result.status)
      setMessage(`发现完成：新增 ${result.addedCount} 张，跳过重复 ${result.skippedCount} 张。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '候选图发现失败。')
    } finally {
      setIsDiscovering(false)
    }
  }

  // 批准单张候选图并刷新状态。
  async function handleApprove(candidate: GalleryCandidate) {
    setActiveCandidateId(candidate.id)
    setMessage('')

    try {
      const result = await approveGalleryCandidate(candidate.id, getCandidateCropSelection(candidate))
      setStatus(result.status)
      setMessage(`已入库：${result.candidate.vehicleId} / ${vehicleGalleryKindLabels[result.candidate.kind]}。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '候选图批准失败。')
    } finally {
      setActiveCandidateId('')
    }
  }

  // 拒绝单张候选图并刷新状态。
  async function handleReject(candidateId: string) {
    setActiveCandidateId(candidateId)
    setMessage('')

    try {
      const result = await rejectGalleryCandidate(candidateId)
      setStatus(result.status)
      setMessage(`已拒绝：${result.candidate.vehicleId} / ${vehicleGalleryKindLabels[result.candidate.kind]}。`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '候选图拒绝失败。')
    } finally {
      setActiveCandidateId('')
    }
  }

  return (
    <section className="workspace-subview gallery-audit-panel" aria-label="图片资产审核">
      <div className="section-title-row">
        <h2>图片资产审核</h2>
        <span>开放授权优先</span>
      </div>

      <div className="gallery-audit-toolbar">
        <div>
          <strong>{isLoading ? '读取中' : `${status?.coverageRate ?? 0}%`}</strong>
          <span>精确授权覆盖率</span>
        </div>
        <div>
          <strong>{isLoading ? '读取中' : `${status?.totalCoverageRate ?? 0}%`}</strong>
          <span>含本地参考可用率</span>
        </div>
        <div>
          <strong>{status ? `${status.preciseAssetCount}/${status.assetCount}` : '读取中'}</strong>
          <span>精确图 / 全部资产</span>
        </div>
        <button className="outline-button primary" type="button" disabled={isDiscovering} onClick={handleDiscover}>
          <Search size={15} />
          {isDiscovering ? '发现中' : '发现候选图'}
        </button>
      </div>

      {message ? <p className="gallery-audit-message">{message}</p> : null}

      <div className="gallery-coverage-grid" aria-label="车型图库覆盖状态">
        {(status?.targets ?? []).map((target) => (
          <div className="gallery-coverage-row" key={target.vehicleId}>
            <strong>{`${target.brand} ${target.model}`}</strong>
            <span>{target.modelYears}款</span>
            {(Object.keys(target.coverage) as GalleryAssetKind[]).map((kind) => (
              <em className={getCoverageStateClass(target.coverage[kind])} key={`${target.vehicleId}-${kind}`}>
                {vehicleGalleryKindLabels[kind]} · {getCoverageStateLabel(target.coverage[kind])}
              </em>
            ))}
          </div>
        ))}
      </div>

      <div className="gallery-candidate-heading">
        <div>
          <h3>待审核候选图</h3>
          <span>{pendingCandidates.length} 张显示中 / 共 {status?.pendingCandidateCount ?? 0} 张</span>
        </div>
        <ShieldCheck size={18} />
      </div>

      {pendingCandidates.length > 0 ? (
        <div className="gallery-candidate-grid">
          {pendingCandidates.map((candidate) => (
            <article className="gallery-candidate-card" key={candidate.id}>
              <div className="gallery-candidate-preview">
                <img src={getGalleryCandidatePreviewUrl(candidate.id)} alt={`${candidate.title}候选预览`} loading="lazy" />
                <div className="gallery-candidate-preview-overlay">
                  <strong>预览受限</strong>
                  <small>打开来源复核</small>
                </div>
                <span>{formatConfidence(candidate)}</span>
              </div>
              <div className="gallery-candidate-body">
                <div>
                  <strong>{candidate.title}</strong>
                  <span>{`${candidate.vehicleId} · ${vehicleGalleryKindLabels[candidate.kind]}`}</span>
                </div>
                <p>{candidate.licenseName} · {candidate.author}</p>
                {needsCropConfirmation(candidate) ? (
                  <div className="gallery-crop-confirmation">
                    <Scissors size={14} />
                    <label>
                      <span>裁切确认</span>
                      <select
                        value={getCandidateCropSelection(candidate)?.mode ?? (candidate.kind === 'console' ? 'console-crop' : 'detail-crop')}
                        onChange={(event) => handleCropModeChange(candidate, event.target.value as GalleryCropMode)}
                      >
                        <option value={candidate.kind === 'console' ? 'console-crop' : 'detail-crop'}>
                          {candidate.kind === 'console' ? '中控区域' : '细节区域'}
                        </option>
                        <option value="center-crop">中心裁切</option>
                        <option value="source">授权原图</option>
                      </select>
                    </label>
                  </div>
                ) : null}
                <ul>
                  {candidate.evidence.slice(0, 3).map((item, index) => (
                    <li key={`${candidate.id}-evidence-${index}`}>{item}</li>
                  ))}
                </ul>
                <div className="gallery-candidate-actions">
                  <a className="outline-button" href={candidate.sourcePageUrl} target="_blank" rel="noreferrer">
                    <ExternalLink size={14} />
                    来源
                  </a>
                  <button className="outline-button" type="button" disabled={activeCandidateId === candidate.id} onClick={() => handleReject(candidate.id)}>
                    <XCircle size={14} />
                    拒绝
                  </button>
                  <button
                    className="outline-button primary"
                    type="button"
                    disabled={activeCandidateId === candidate.id}
                    onClick={() => handleApprove(candidate)}
                  >
                    <CheckCircle2 size={14} />
                    批准入库
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="gallery-empty-state">
          <Image size={24} />
          <strong>暂无待审核候选图</strong>
          <span>点击发现候选图后，开放授权且匹配分达标的图片会进入这里。</span>
        </div>
      )}
    </section>
  )
}
