import type { DataMode } from '../types'

// 根据数据模式生成指标前缀。
export function getMetricPrefix(dataMode: DataMode) {
  if (dataMode === 'official') {
    return '价值'
  }

  if (dataMode === 'live') {
    return '公开'
  }

  if (dataMode === 'imported') {
    return '导入'
  }

  if (dataMode === 'unavailable') {
    return '暂无'
  }

  return '示例'
}

// 根据数据模式生成状态文案。
export function getDataModeLabel(dataMode: DataMode) {
  if (dataMode === 'official') {
    return '官方CADA数据'
  }

  if (dataMode === 'live') {
    return '公开观察信号'
  }

  if (dataMode === 'imported') {
    return '导入数据'
  }

  if (dataMode === 'unavailable') {
    return '暂无真实数据'
  }

  return '示例数据'
}
