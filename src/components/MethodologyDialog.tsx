import { X } from 'lucide-react'

interface MethodologyDialogProps {
  isOpen: boolean
  onClose: () => void
}

// 渲染数据口径说明弹窗。
export function MethodologyDialog({ isOpen, onClose }: MethodologyDialogProps) {
  if (!isOpen) {
    return null
  }

  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section className="method-dialog" role="dialog" aria-modal="true" aria-labelledby="method-title">
        <div className="section-title-row">
          <h2 id="method-title">查看口径</h2>
          <button className="ghost-icon-button" type="button" aria-label="关闭" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
        <p>
          官方销量口径仅使用中国汽车流通协会 CADA 公开二手车数据。公开官方数据暂未提供“10-20万二手SUV单车型”
          真实成交量，因此车型榜保留为综合价值榜，不能解读为官方单车型销量。
        </p>
        <dl>
          <div>
            <dt>综合价值分</dt>
            <dd>45% 价格价值 + 25% 保值率 + 20% 车龄里程健康度 + 10% 来源置信度。</dd>
          </div>
          <div>
            <dt>官方大盘</dt>
            <dd>展示 CADA 全国二手车月度交易量、环比、省份 Top、转籍率、经理人指数和官方车型 Top10 参考。</dd>
          </div>
          <div>
            <dt>公开观察</dt>
            <dd>瓜子、易车、汽车之家、懂车帝等公开源只作为价值榜观察信号，不参与官方销量字段。</dd>
          </div>
        </dl>
      </section>
    </div>
  )
}
