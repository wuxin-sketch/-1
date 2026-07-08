import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, Download, Info, RefreshCw, UserCircle } from 'lucide-react'
import type { DataRefreshStatusResponse, MonthOption, OfficialUsedCarMarket, RankingResponse, UnifiedDataRefreshResponse } from '../types'

interface TerminalHeaderProps {
  ranking: RankingResponse
  officialMarket: OfficialUsedCarMarket
  monthOptions: MonthOption[]
  isLoading: boolean
  isRefreshingData: boolean
  lastUnifiedRefresh: UnifiedDataRefreshResponse | null
  dataRefreshStatus: DataRefreshStatusResponse | null
  refreshMessage: string
  favoriteCount: number
  compareCount: number
  onRefresh: () => void
  onExport: () => void
  onOpenMethodology: () => void
}

// 定义个人中心昵称在本地存储中的键名。
const PROFILE_NAME_STORAGE_KEY = 'yuezhi.profileName'

// 读取本地个人中心昵称。
function readProfileName() {
  if (typeof window === 'undefined') {
    return '本地用户'
  }

  return window.localStorage.getItem(PROFILE_NAME_STORAGE_KEY) || '本地用户'
}

// 写入本地个人中心昵称。
function writeProfileName(value: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PROFILE_NAME_STORAGE_KEY, value)
}

// 格式化官方更新时间用于顶部状态栏。
function formatUpdatedAt(value: string) {
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) {
    return value
  }

  return parsed.toLocaleString('zh-CN', { hour12: false })
}

// 根据官方数据新鲜度生成顶部状态文案。
function getOfficialFreshnessLabel(market: OfficialUsedCarMarket) {
  if (market.dataFreshness === 'fresh') {
    return '实时官方数据'
  }

  if (market.dataFreshness === 'cached') {
    return '缓存官方数据'
  }

  return '官方数据暂不可用'
}

// 根据官方数据新鲜度生成顶部时间文案。
function getOfficialTimeLabel(market: OfficialUsedCarMarket) {
  if (market.dataFreshness === 'cached' && market.cachedAt) {
    return `缓存时间：${formatUpdatedAt(market.cachedAt)}`
  }

  return `官方获取：${formatUpdatedAt(market.sourceFetchedAt ?? market.updatedAt)}`
}

// 根据最近统一刷新结果生成顶部状态文案。
function getRefreshSummary(refresh: UnifiedDataRefreshResponse | null, fallbackMessage: string) {
  if (fallbackMessage) {
    return fallbackMessage
  }

  if (!refresh) {
    return '等待首次统一刷新'
  }

  const triggerText = refresh.trigger === 'startup' ? '启动自动刷新' : refresh.trigger === 'scheduled' ? '定时自动刷新' : '手动刷新'
  return `${triggerText}：${refresh.status} / ${formatUpdatedAt(refresh.finishedAt)}`
}

// 根据调度状态生成自动刷新计划文案。
function getSchedulerSummary(status: DataRefreshStatusResponse | null) {
  if (!status) {
    return '正在读取自动刷新状态。'
  }

  if (!status.scheduler.enabled) {
    return '自动刷新未开启；可通过服务环境变量启用。'
  }

  const nextRunText = status.scheduler.nextRunAt ? formatUpdatedAt(status.scheduler.nextRunAt) : '等待本次刷新完成后计算'
  const runningText = status.scheduler.isRunning ? '，当前正在刷新' : ''
  return `自动刷新已开启，目标月份 ${status.scheduler.targetMonth}，下次刷新 ${nextRunText}${runningText}。`
}

// 根据月份状态生成消息中心列表。
function buildNotificationItems(
  monthOptions: MonthOption[],
  market: OfficialUsedCarMarket,
  refreshText: string,
  dataRefreshStatus: DataRefreshStatusResponse | null,
) {
  const selectedMonth = monthOptions.find((option) => option.id === market.selectedMonth)
  const pendingMonths = monthOptions.filter((option) => option.status === 'pending')
  const publicMonths = monthOptions.filter((option) => option.status === 'public')
  const scheduledRefresh = dataRefreshStatus?.history.scheduled

  return [
    {
      title: `CADA 最新完整月：${market.latestAvailableMonth}`,
      body: market.selectedMonthStatus === 'pending'
        ? `${market.selectedMonthLabel ?? '当前月份'}完整月度暂未发布，不能作为官方完整月度销量。`
        : `${market.selectedMonthLabel ?? market.latestAvailableMonth}已读取官方月度大盘。`,
    },
    {
      title: `当前月份状态：${selectedMonth?.statusLabel ?? '读取中'}`,
      body: selectedMonth?.note ?? '正在读取月份状态。',
    },
    {
      title: '公开观察缓存',
      body: publicMonths.length > 0 ? `已有 ${publicMonths.length} 个月具备公开观察或导入缓存。` : '尚无额外公开观察缓存。',
    },
    {
      title: '待补真实数据',
      body: pendingMonths.length > 0 ? `${pendingMonths.map((item) => item.label).join('、')} 仍等待真实缓存或官方完整月度。` : '今年已展示月份均有真实状态。',
    },
    {
      title: '自动刷新计划',
      body: getSchedulerSummary(dataRefreshStatus),
    },
    {
      title: '最近刷新',
      body: scheduledRefresh ? `${refreshText}；最近定时刷新 ${formatUpdatedAt(scheduledRefresh.finishedAt)}。` : refreshText,
    },
  ]
}

// 渲染顶部终端导航与全局操作。
export function TerminalHeader({
  ranking,
  officialMarket,
  monthOptions,
  isLoading,
  isRefreshingData,
  lastUnifiedRefresh,
  dataRefreshStatus,
  refreshMessage,
  favoriteCount,
  compareCount,
  onRefresh,
  onExport,
  onOpenMethodology,
}: TerminalHeaderProps) {
  const officialLabel = getOfficialFreshnessLabel(officialMarket)
  const refreshSummary = getRefreshSummary(lastUnifiedRefresh, refreshMessage)
  const [activePanel, setActivePanel] = useState<'notifications' | 'profile' | null>(null)
  const [profileName, setProfileName] = useState(() => readProfileName())
  const headerRef = useRef<HTMLElement | null>(null)
  const notificationItems = useMemo(
    () => buildNotificationItems(monthOptions, officialMarket, refreshSummary, dataRefreshStatus),
    [monthOptions, officialMarket, refreshSummary, dataRefreshStatus],
  )

  // 在点击页内其他区域或按下 Escape 时关闭顶部弹层。
  useEffect(() => {
    if (!activePanel) {
      return undefined
    }

    // 处理顶部弹层外部点击关闭。
    function handleDocumentPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Node && headerRef.current?.contains(target)) {
        return
      }

      setActivePanel(null)
    }

    // 处理 Escape 键关闭顶部弹层。
    function handleDocumentKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setActivePanel(null)
      }
    }

    document.addEventListener('pointerdown', handleDocumentPointerDown, true)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [activePanel])

  // 切换消息中心面板。
  function handleToggleNotifications() {
    setActivePanel((current) => (current === 'notifications' ? null : 'notifications'))
  }

  // 切换个人中心面板。
  function handleToggleProfile() {
    setActivePanel((current) => (current === 'profile' ? null : 'profile'))
  }

  // 更新并保存本地个人昵称。
  function handleProfileNameChange(value: string) {
    setProfileName(value)
    writeProfileName(value)
  }

  return (
    <header className="terminal-header" ref={headerRef}>
      <div className="brand-lockup" aria-label="月值好车">
        <div className="brand-mark">月</div>
        <div>
          <strong>月值好车</strong>
        </div>
      </div>

      <div className="header-meta">
        <span>{getOfficialTimeLabel(officialMarket)}</span>
        <span>CADA最新可用月：{officialMarket.latestAvailableMonth}</span>
        <span>价值榜月份：{ranking.month}</span>
        <span className={`data-mode-pill official ${officialMarket.dataFreshness}`}>
          {officialLabel}
        </span>
        <span className="refresh-message">{refreshSummary}</span>
        <span>收藏 {favoriteCount} 款 / 对比 {compareCount} 款</span>
      </div>

      <nav className="header-actions" aria-label="全局操作">
        <button className="outline-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCw size={16} className={isRefreshingData ? 'spin-icon' : ''} />
          {isRefreshingData ? '刷新中' : '刷新数据'}
        </button>
        <button className="outline-button" type="button" onClick={onExport}>
          <Download size={16} />
          导出CSV
        </button>
        <button className="outline-button" type="button" onClick={onOpenMethodology}>
          <Info size={16} />
          查看口径
        </button>
        <div className="header-popover-wrap">
          <button className="icon-button" type="button" aria-label="消息中心" aria-expanded={activePanel === 'notifications'} onClick={handleToggleNotifications}>
            <Bell size={18} />
            <span className="icon-dot" aria-hidden="true" />
          </button>
          {activePanel === 'notifications' ? (
            <section className="header-popover notification-popover" aria-label="消息中心">
              <div className="popover-title-row">
                <strong>消息中心</strong>
                <span>{notificationItems.length} 条</span>
              </div>
              <div className="notification-list">
                {notificationItems.map((item) => (
                  <article className="notification-item" key={item.title}>
                    <strong>{item.title}</strong>
                    <p>{item.body}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}
        </div>
        <div className="header-popover-wrap">
          <button className="icon-button" type="button" aria-label="个人中心" aria-expanded={activePanel === 'profile'} onClick={handleToggleProfile}>
            <UserCircle size={20} />
          </button>
          {activePanel === 'profile' ? (
            <section className="header-popover profile-popover" aria-label="个人中心">
              <div className="popover-title-row">
                <strong>个人中心</strong>
                <span>本地模式</span>
              </div>
              <label className="profile-field">
                <span>昵称</span>
                <input value={profileName} onChange={(event) => handleProfileNameChange(event.target.value)} />
              </label>
              <div className="profile-stat-grid">
                <div>
                  <span>收藏车型</span>
                  <strong>{favoriteCount}</strong>
                </div>
                <div>
                  <span>对比车型</span>
                  <strong>{compareCount}</strong>
                </div>
                <div>
                  <span>当前月份</span>
                  <strong>{ranking.month}</strong>
                </div>
              </div>
              <div className="profile-action-row">
                <button className="outline-button" type="button" onClick={onExport}>
                  <Download size={15} />
                  导出榜单
                </button>
                <button className="outline-button" type="button" onClick={onOpenMethodology}>
                  <Info size={15} />
                  查看口径
                </button>
              </div>
              <p>所有收藏、对比和昵称只保存在当前浏览器本地，不会上传到服务器。</p>
            </section>
          ) : null}
        </div>
      </nav>
    </header>
  )
}
