import { ExternalLink } from 'lucide-react'
import type { OfficialUsedCarMarket } from '../types'

interface OfficialMarketDashboardProps {
  market: OfficialUsedCarMarket
}

// 格式化 CADA 官方数值并保留接口原单位。
function formatOfficialNumber(value: number | null, suffix: string) {
  if (value === null) {
    return '暂无'
  }

  return `${value.toFixed(2).replace(/\.00$/, '')}${suffix}`
}

// 格式化 CADA 官方百分比数值。
function formatOfficialPercent(value: number | null) {
  if (value === null) {
    return '暂无'
  }

  return `${value.toFixed(1)}%`
}

// 格式化官方缓存和获取时间。
function formatOfficialDateTime(value: string | undefined) {
  if (!value) {
    return '暂无'
  }

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-CN', { hour12: false })
}

// 根据官方数据新鲜度生成大盘状态文案。
function getOfficialFreshnessText(market: OfficialUsedCarMarket) {
  if (market.dataFreshness === 'fresh') {
    return `实时官方数据 · 获取时间：${formatOfficialDateTime(market.sourceFetchedAt ?? market.updatedAt)}`
  }

  if (market.dataFreshness === 'cached') {
    return `缓存官方数据 · 缓存时间：${formatOfficialDateTime(market.cachedAt)}`
  }

  return '官方数据暂不可用'
}

// 生成当前选中月份的官方状态文案。
function getSelectedMonthText(market: OfficialUsedCarMarket) {
  const label = market.selectedMonthLabel ?? market.latestAvailableMonth
  const status = market.selectedMonthStatus === 'pending' ? '完整月度未发布' : '官方完整月度'

  return `当前月份：${label} · ${status}`
}

// 获取转籍率趋势中的最新点。
function getLatestTransferRate(market: OfficialUsedCarMarket) {
  return market.transferRateTrend.at(-1) ?? null
}

// 获取经理人指数趋势中的最新点。
function getLatestManagerIndex(market: OfficialUsedCarMarket) {
  return market.managerIndexTrend.at(-1) ?? null
}

// 计算官方月度趋势条的相对宽度。
function getOfficialBarWidth(value: number | null, maxValue: number) {
  if (value === null || maxValue <= 0) {
    return '6%'
  }

  return `${Math.max(8, Math.round((value / maxValue) * 100))}%`
}

// 渲染 CADA 官方二手车大盘视图。
export function OfficialMarketDashboard({ market }: OfficialMarketDashboardProps) {
  const latestTransferRate = getLatestTransferRate(market)
  const latestManagerIndex = getLatestManagerIndex(market)
  const recentMonthlyTrend = market.monthlyVolumeTrend.slice(-8)
  const maxVolume = Math.max(...recentMonthlyTrend.map((item) => item.volumeWan ?? 0), 0)

  if (market.unavailableReason && !market.monthlyVolumeTrend.length) {
    return (
      <section className="official-dashboard official-empty" aria-label="CADA 官方二手车大盘">
        <strong>官方数据暂不可用</strong>
        <p>{market.unavailableReason}</p>
        <a href={market.sourceUrl} target="_blank" rel="noreferrer">
          打开 CADA 来源页
          <ExternalLink size={14} />
        </a>
      </section>
    )
  }

  return (
    <section className="official-dashboard" aria-label="CADA 官方二手车大盘">
      <div className="official-status-line">
        <strong>CADA 官方公开数据</strong>
        <span>最新可用月：{market.latestAvailableMonth}</span>
        <span>{getSelectedMonthText(market)}</span>
        <span>{getOfficialFreshnessText(market)}</span>
        <a href={market.sourceUrl} target="_blank" rel="noreferrer">
          来源页
          <ExternalLink size={14} />
        </a>
      </div>

      {market.unavailableReason ? <p className="official-warning">{market.unavailableReason}</p> : null}

      <div className="official-kpi-grid">
        <div>
          <span>{market.selectedMonthLabel ?? market.latestAvailableMonth}全国交易量</span>
          <strong>{formatOfficialNumber(market.nationalVolumeWan, '万辆')}</strong>
          <em>CADA 官方公开数据</em>
        </div>
        <div>
          <span>环比</span>
          <strong>{formatOfficialPercent(market.momPercent)}</strong>
          <em>按接口原值展示</em>
        </div>
        <div>
          <span>最新转籍率</span>
          <strong>{formatOfficialPercent(latestTransferRate?.ratePercent ?? null)}</strong>
          <em>{latestTransferRate?.label ?? '暂无'}</em>
        </div>
        <div>
          <span>经理人指数</span>
          <strong>{formatOfficialNumber(latestManagerIndex?.index ?? null, '')}</strong>
          <em>{latestManagerIndex?.label ?? '暂无'}</em>
        </div>
      </div>

      <div className="official-panel-grid">
        <article className="official-panel">
          <div className="section-title-row">
            <h2>全国月度交易趋势</h2>
            <span>单位：万辆 / %</span>
          </div>
          <div className="official-trend-list">
            {recentMonthlyTrend.map((item) => (
              <div className="official-trend-row" key={item.label}>
                <span>{item.label}</span>
                <div className="bar-track">
                  <i style={{ width: getOfficialBarWidth(item.volumeWan, maxVolume) }} />
                </div>
                <strong>{formatOfficialNumber(item.volumeWan, '')}</strong>
                <em>{formatOfficialPercent(item.momPercent)}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="official-panel">
          <div className="section-title-row">
            <h2>省份交易 Top</h2>
            <span>CADA 官方公开数据</span>
          </div>
          <div className="official-rank-list">
            {market.provinceTop.slice(0, 8).map((item, index) => (
              <div className="official-rank-row" key={item.province}>
                <strong>{index + 1}</strong>
                <span>{item.province}</span>
                <em>{formatOfficialNumber(item.volumeWan, '万辆')}</em>
              </div>
            ))}
          </div>
        </article>

        <article className="official-panel official-wide-panel">
          <div className="section-title-row">
            <h2>CADA 官方车型 Top10</h2>
            <span>不限SUV/价格区间</span>
          </div>
          <div className="official-model-grid">
            {market.officialModelTopTen.map((item) => (
              <div className="official-model-row" key={`${item.rank}-${item.model}`}>
                <strong>{item.rank}</strong>
                <span>{item.model}</span>
                <em>{formatOfficialNumber(item.volumeWan, '万辆')}</em>
                <small>{item.scopeNote}</small>
              </div>
            ))}
          </div>
        </article>
      </div>
    </section>
  )
}
