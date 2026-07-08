import { useEffect, useState, type MouseEvent } from 'react'
import { AlertTriangle, ChevronLeft, ChevronRight, GitCompareArrows, ImageOff, Star, X, ZoomIn } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { DataMode, OfficialUsedCarMarket, VehicleRankItem } from '../types'
import { getDataModeLabel } from '../lib/dataMode'
import { getVehicleGallery, getVehicleImagePath } from '../lib/vehicleImages'

interface VehicleInspectorProps {
  vehicle: VehicleRankItem
  dataMode: DataMode
  officialMarket: OfficialUsedCarMarket
  isFavorite: boolean
  isCompared: boolean
  onToggleFavorite: () => void
  onToggleCompare: () => void
}

// 格式化官方大盘数值。
function formatOfficialNumber(value: number | null, suffix: string) {
  if (value === null) {
    return '暂无'
  }

  return `${value.toFixed(2).replace(/\.00$/, '')}${suffix}`
}

// 格式化官方百分比数值。
function formatOfficialPercent(value: number | null) {
  if (value === null) {
    return '暂无'
  }

  return `${value.toFixed(1)}%`
}

// 格式化综合价值分并处理缺失数据。
function formatValueScore(value: number | undefined) {
  return typeof value === 'number' ? value : '暂无'
}

// 生成观察热度构成的展示行。
function buildHeatBreakdownRows(breakdown: VehicleRankItem['heatBreakdown']) {
  return [
    { label: '搜索热度', value: breakdown.search, color: '#0f766e' },
    { label: '浏览热度', value: breakdown.view, color: '#14b8a6' },
    { label: '咨询热度', value: breakdown.inquiry, color: '#f59e0b' },
    { label: '成交线索', value: breakdown.sold, color: '#ef4444' },
  ]
}

// 生成观察热度条形图的屏幕阅读器摘要。
function buildHeatBreakdownSummary(rows: ReturnType<typeof buildHeatBreakdownRows>) {
  return `观察热度构成：${rows.map((row) => `${row.label}${row.value}%`).join('，')}。`
}

// 生成价格带分布图的屏幕阅读器摘要。
function buildPriceDistributionSummary(distribution: VehicleRankItem['priceDistribution']) {
  const primaryBand = distribution.reduce((best, point) => (point.share > best.share ? point : best), distribution[0] ?? { label: '暂无', share: 0 })
  return `价格带分布：${distribution.map((point) => `${point.label}万元占${point.share}%`).join('，')}；占比最高为${primaryBand.label}万元。`
}

// 计算车型图库上一张图片索引。
function getPreviousGalleryIndex(currentIndex: number, itemCount: number) {
  return itemCount > 0 ? (currentIndex + itemCount - 1) % itemCount : 0
}

// 计算车型图库下一张图片索引。
function getNextGalleryIndex(currentIndex: number, itemCount: number) {
  return itemCount > 0 ? (currentIndex + 1) % itemCount : 0
}

// 渲染车型图库中的大图或待授权占位。
function renderGalleryStageImage(image: ReturnType<typeof getVehicleGallery>[number]) {
  if (image.isMissing) {
    return (
      <div className="vehicle-gallery-placeholder" role="img" aria-label={image.alt}>
        <ImageOff size={30} />
        <strong>{image.label}待授权实拍图</strong>
        <span>等待开放授权候选审核入库</span>
      </div>
    )
  }

  return <img src={image.src} alt={image.alt} />
}

// 渲染车型图库中的缩略图或待授权占位。
function renderGalleryThumbImage(image: ReturnType<typeof getVehicleGallery>[number]) {
  if (image.isMissing) {
    return (
      <span className="vehicle-gallery-thumb-placeholder" aria-hidden="true">
        <ImageOff size={16} />
      </span>
    )
  }

  return <img src={image.src} alt="" />
}

// 渲染右侧选中车型画像与风险提示。
export function VehicleInspector({
  vehicle,
  dataMode,
  officialMarket,
  isFavorite,
  isCompared,
  onToggleFavorite,
  onToggleCompare,
}: VehicleInspectorProps) {
  // 管理车型大图查看浮层状态。
  const [isImageDialogOpen, setIsImageDialogOpen] = useState(false)
  // 管理车型图库当前查看的图片位置。
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const vehicleImagePath = getVehicleImagePath(vehicle)
  const vehicleGallery = getVehicleGallery(vehicle)
  const activeGalleryImage = vehicleGallery[activeImageIndex] ?? vehicleGallery[0]!
  const vehicleName = `${vehicle.brand} ${vehicle.model}`
  const heatRows = buildHeatBreakdownRows(vehicle.heatBreakdown)
  const heatSummaryId = `${vehicle.id}-heat-summary`
  const priceSummaryId = `${vehicle.id}-price-summary`

  // 处理车型切换时关闭旧大图浮层。
  useEffect(() => {
    setIsImageDialogOpen(false)
    setActiveImageIndex(0)
  }, [vehicle.id])

  // 处理大图浮层打开后的键盘切图、关闭和页面滚动锁定。
  useEffect(() => {
    if (!isImageDialogOpen) {
      return undefined
    }

    const originalOverflow = document.body.style.overflow

    // 监听 Esc 键关闭大图浮层。
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsImageDialogOpen(false)
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault()
        setActiveImageIndex((currentIndex) => getPreviousGalleryIndex(currentIndex, vehicleGallery.length))
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault()
        setActiveImageIndex((currentIndex) => getNextGalleryIndex(currentIndex, vehicleGallery.length))
      }
    }

    document.body.style.overflow = 'hidden'
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = originalOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isImageDialogOpen, vehicleGallery.length])

  // 打开车型大图浮层。
  function handleOpenImageDialog() {
    setActiveImageIndex(0)
    setIsImageDialogOpen(true)
  }

  // 关闭车型大图浮层。
  function handleCloseImageDialog() {
    setIsImageDialogOpen(false)
  }

  // 阻止大图内容区点击冒泡到遮罩。
  function handleDialogContentClick(event: MouseEvent<HTMLDivElement>) {
    event.stopPropagation()
  }

  // 切换到图库上一张图片。
  function handleShowPreviousImage() {
    setActiveImageIndex((currentIndex) => getPreviousGalleryIndex(currentIndex, vehicleGallery.length))
  }

  // 切换到图库下一张图片。
  function handleShowNextImage() {
    setActiveImageIndex((currentIndex) => getNextGalleryIndex(currentIndex, vehicleGallery.length))
  }

  // 切换到指定图库图片。
  function handleSelectGalleryImage(index: number) {
    setActiveImageIndex(index)
  }

  return (
    <aside className="vehicle-inspector" aria-label="选中车型画像">
      <section className="inspector-section vehicle-hero-panel">
        <div className="section-title-row">
          <h2>选中车型画像</h2>
          <div className="inspector-actions">
            <button
              className={isFavorite ? 'ghost-icon-button active' : 'ghost-icon-button'}
              type="button"
              aria-pressed={isFavorite}
              onClick={onToggleFavorite}
            >
              <Star size={16} fill={isFavorite ? 'currentColor' : 'none'} />
              {isFavorite ? '已收藏' : '收藏'}
            </button>
            <button
              className={isCompared ? 'ghost-icon-button active' : 'ghost-icon-button'}
              type="button"
              aria-pressed={isCompared}
              onClick={onToggleCompare}
            >
              <GitCompareArrows size={15} />
              {isCompared ? '已对比' : '加入对比'}
            </button>
          </div>
        </div>

        <div className="vehicle-identity">
          <div>
            <h3>{vehicleName}</h3>
            <p>{vehicle.modelYears}款</p>
            <span>{vehicle.segment}</span>
          </div>
          <button className="vehicle-image-button" type="button" aria-label={`放大查看${vehicleName}图片`} onClick={handleOpenImageDialog}>
            <img src={vehicleImagePath} alt={`${vehicleName}实车图`} />
            <span aria-hidden="true">
              <ZoomIn size={15} />
            </span>
          </button>
        </div>

        <div className="metric-grid">
          <div>
            <span>参考价（万）</span>
            <strong>价值榜</strong>
            <em>{`${(vehicle.priceMin / 10000).toFixed(1)}-${(vehicle.priceMax / 10000).toFixed(1)}`}</em>
          </div>
          <div>
            <span>保值率(3年)</span>
            <strong>价值榜</strong>
            <em>{vehicle.retentionRate}%</em>
          </div>
          <div>
            <span>车龄里程</span>
            <strong>价值榜</strong>
            <em>{`${vehicle.ageYears.toFixed(1)}年 / ${vehicle.mileageWanKm.toFixed(1)}万公里`}</em>
          </div>
          <div>
            <span>综合价值分</span>
            <strong>{getDataModeLabel(dataMode)}</strong>
            <em>{formatValueScore(vehicle.valueScore)}</em>
          </div>
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <h2>观察热度构成</h2>
          <span>热度指数：{vehicle.heatIndex}</span>
        </div>
        <p className="sr-only" id={heatSummaryId}>{buildHeatBreakdownSummary(heatRows)}</p>
        <div className="heat-bars" aria-describedby={heatSummaryId}>
          {heatRows.map((row) => (
            <div className="heat-row" key={row.label}>
              <span className="legend-square" style={{ background: row.color }} />
              <span>{row.label}</span>
              <div className="bar-track">
                <i style={{ width: `${Math.max(6, row.value)}%`, background: row.color }} />
              </div>
              <em>{row.value}%</em>
            </div>
          ))}
        </div>
      </section>

      <section className="inspector-section">
        <div className="section-title-row">
          <h2>官方大盘摘要</h2>
          <span>CADA 官方公开数据</span>
        </div>
        <div className="official-inspector-list">
          <div>
            <span>当前官方月</span>
            <strong>{officialMarket.selectedMonthLabel ?? officialMarket.latestAvailableMonth}</strong>
          </div>
          <div>
            <span>全国交易量</span>
            <strong>{formatOfficialNumber(officialMarket.nationalVolumeWan, '万辆')}</strong>
          </div>
          <div>
            <span>环比</span>
            <strong>{formatOfficialPercent(officialMarket.momPercent)}</strong>
          </div>
          <p>
            CADA 最新完整月为 {officialMarket.latestAvailableMonth}。公开官方数据未提供当前筛选粒度的 10-20 万二手 SUV
            单车型真实成交量。
          </p>
        </div>
      </section>

      <section className="inspector-section chart-section">
        <div className="section-title-row">
          <h2>价格带分布</h2>
          <span>单位：万元</span>
        </div>
        <p className="sr-only" id={priceSummaryId}>{buildPriceDistributionSummary(vehicle.priceDistribution)}</p>
        <div className="mini-chart" role="img" aria-describedby={priceSummaryId}>
          <div aria-hidden="true">
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={vehicle.priceDistribution} margin={{ top: 8, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <Tooltip formatter={(value) => [`${value}%`, '占比']} />
                <Bar dataKey="share" radius={[2, 2, 0, 0]}>
                  {vehicle.priceDistribution.map((item) => (
                    <Cell key={item.label} fill={item.label === '14-16' ? '#0f766e' : '#94a3b8'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="inspector-section risk-panel">
        <div className="section-title-row danger-title">
          <h2>
            <AlertTriangle size={16} />
            风险提示
          </h2>
          <span>风险等级：{vehicle.riskLevel}</span>
        </div>
        <ul>
          {vehicle.riskNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
        <p>{vehicle.advice}</p>
      </section>

      {isImageDialogOpen ? (
        <div className="vehicle-image-dialog" role="dialog" aria-modal="true" aria-label={`${vehicleName}大图`} onClick={handleCloseImageDialog}>
          <div className="vehicle-image-dialog-content" onClick={handleDialogContentClick}>
            <div className="vehicle-image-dialog-header">
              <div>
                <strong>{vehicleName}</strong>
                <span>{vehicle.modelYears}款 · {vehicle.segment}</span>
              </div>
              <span className="vehicle-gallery-kind">{activeGalleryImage.sourceNote ?? activeGalleryImage.kind}</span>
              <button className="ghost-icon-button" type="button" aria-label="关闭大图" onClick={handleCloseImageDialog}>
                <X size={18} />
              </button>
            </div>
            <div className="vehicle-gallery-stage">
              <button className="gallery-nav-button previous" type="button" aria-label="上一张车型图片" onClick={handleShowPreviousImage}>
                <ChevronLeft size={24} />
              </button>
              {renderGalleryStageImage(activeGalleryImage)}
              <button className="gallery-nav-button next" type="button" aria-label="下一张车型图片" onClick={handleShowNextImage}>
                <ChevronRight size={24} />
              </button>
            </div>
            <div className="vehicle-gallery-strip" role="list" aria-label="车型图片分类">
              {vehicleGallery.map((image, index) => (
                <button
                  className={`vehicle-gallery-thumb${index === activeImageIndex ? ' active' : ''}`}
                  type="button"
                  key={image.kind}
                  aria-label={`查看${image.label}图`}
                  aria-pressed={index === activeImageIndex}
                  onClick={() => handleSelectGalleryImage(index)}
                >
                  {renderGalleryThumbImage(image)}
                  <span>{image.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </aside>
  )
}
