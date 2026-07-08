import { ExternalLink } from 'lucide-react'
import type { DataMode, OfficialUsedCarMarket, VehicleRankItem } from '../types'
import { getDataModeLabel } from '../lib/dataMode'

interface BottomPanelsProps {
  items: VehicleRankItem[]
  dataMode: DataMode
  officialMarket: OfficialUsedCarMarket
  onOpenComparison: () => void
}

// 生成同价位矩阵中使用的条形宽度。
function getBarWidth(value = 0) {
  return `${Math.max(8, Math.min(100, value))}%`
}

// 格式化 CADA 官方交易量数值。
function formatOfficialVolume(value: number | null) {
  if (value === null) {
    return '暂无'
  }

  return `${value.toFixed(2).replace(/\.00$/, '')}万辆`
}

// 渲染底部同价位矩阵与官方车型参考榜。
export function BottomPanels({ items, dataMode, officialMarket, onOpenComparison }: BottomPanelsProps) {
  const compactItems = items.slice(0, 5)

  return (
    <section className="bottom-grid" aria-label="下方对比区域">
      <article className="bottom-panel">
        <div className="section-title-row">
          <h2>同价位对比矩阵</h2>
          <button className="link-action" type="button" onClick={onOpenComparison}>
            更多维度对比
            <ExternalLink size={14} />
          </button>
        </div>
        <div className="matrix-table-wrap">
          <table className="matrix-table">
            <thead>
              <tr>
                <th>车型</th>
                <th>综合价值分</th>
                <th>保值率</th>
                <th>来源置信度</th>
                <th>车龄里程</th>
                <th>参考价(万)</th>
              </tr>
            </thead>
            <tbody>
              {compactItems.map((item) => (
                <tr key={item.id}>
                  <td>{`${item.brand} ${item.model}`}</td>
                  <td>
                    <span className="mini-bar">
                      <i style={{ width: getBarWidth(item.valueScore) }} />
                    </span>
                    {item.valueScore}
                  </td>
                  <td>{item.retentionRate}%</td>
                  <td>{item.sourceConfidence}</td>
                  <td>{`${item.ageYears.toFixed(1)}年 / ${item.mileageWanKm.toFixed(1)}万公里`}</td>
                  <td>{`${(item.priceMin / 10000).toFixed(1)}-${(item.priceMax / 10000).toFixed(1)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <article className="bottom-panel">
        <div className="section-title-row">
          <h2>CADA车型Top10参考</h2>
          <span>不限SUV/价格区间</span>
        </div>
        <div className="reference-list">
          {officialMarket.officialModelTopTen.length > 0 ? (
            officialMarket.officialModelTopTen.slice(0, 6).map((item) => (
              <div className="reference-row" key={`${item.rank}-${item.model}`}>
                <strong>{item.rank}</strong>
                <span>{item.model}</span>
                <em>CADA 官方公开数据</em>
                <b>{formatOfficialVolume(item.volumeWan)}</b>
              </div>
            ))
          ) : (
            <div className="reference-row">
              <strong>--</strong>
              <span>官方车型Top10暂不可用</span>
              <em>{getDataModeLabel(dataMode)}</em>
              <b>{officialMarket.unavailableReason ?? '等待CADA接口返回'}</b>
            </div>
          )}
        </div>
      </article>
    </section>
  )
}
