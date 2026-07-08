import type { VehicleRankItem } from '../types'

// 定义对比清单最多容纳的车型数量。
export const MAX_COMPARE_ITEMS = 4

// 定义对比清单更新后的结果结构。
export interface CompareListUpdate {
  ids: string[]
  notice: string
}

// 从本地存储文本中解析车型 ID 列表。
export function parseStoredIdList(rawValue: string | null) {
  if (!rawValue) {
    return []
  }

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

// 将车型 ID 列表序列化为本地存储文本。
export function stringifyIdList(ids: string[]) {
  return JSON.stringify([...new Set(ids)])
}

// 切换收藏清单中的单个车型 ID。
export function toggleFavoriteId(currentIds: string[], vehicleId: string) {
  if (currentIds.includes(vehicleId)) {
    return currentIds.filter((id) => id !== vehicleId)
  }

  return [...currentIds, vehicleId]
}

// 更新对比清单中的单个车型 ID 并生成提示文案。
export function updateCompareIds(currentIds: string[], vehicleId: string, maxItems = MAX_COMPARE_ITEMS): CompareListUpdate {
  if (currentIds.includes(vehicleId)) {
    return {
      ids: currentIds.filter((id) => id !== vehicleId),
      notice: '已从对比清单移除。',
    }
  }

  if (currentIds.length >= maxItems) {
    return {
      ids: [...currentIds.slice(1), vehicleId],
      notice: `对比清单最多 ${maxItems} 款，已替换最早添加车型。`,
    }
  }

  return {
    ids: [...currentIds, vehicleId],
    notice: '已加入对比清单。',
  }
}

// 按 ID 顺序从榜单中提取车型对象。
export function selectVehiclesByIds(items: VehicleRankItem[], ids: string[]) {
  const vehicleById = new Map(items.map((item) => [item.id, item]))

  return ids.flatMap((id) => {
    const vehicle = vehicleById.get(id)
    return vehicle ? [vehicle] : []
  })
}

// 根据榜单生成首次进入对比页时的默认车型 ID。
export function buildInitialCompareIds(items: VehicleRankItem[], currentIds: string[], maxItems = 3) {
  if (currentIds.length > 0) {
    return currentIds.slice(0, MAX_COMPARE_ITEMS)
  }

  return items.slice(0, maxItems).map((item) => item.id)
}
