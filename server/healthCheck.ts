import type { ServiceHealthResponse } from '../src/types.ts'

// 生成健康检查请求地址。
function getHealthUrl() {
  return process.env.YUEZHI_HEALTH_URL ?? `http://127.0.0.1:${process.env.PORT ?? 8787}/api/health`
}

// 将布尔状态格式化为中文。
function formatExists(exists: boolean) {
  return exists ? '有' : '无'
}

// 请求本地健康检查接口。
async function fetchServiceHealth(url: string) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }

  return (await response.json()) as ServiceHealthResponse
}

// 打印健康检查摘要。
function printHealthSummary(health: ServiceHealthResponse, url: string) {
  console.log(`月值好车健康检查：${health.status}`)
  console.log(`地址：${url}`)
  console.log(`服务：${health.service}@${health.version}，运行 ${health.uptimeSeconds}s，月份 ${health.currentMonth}`)
  console.log(`CADA缓存：${formatExists(health.officialCache.exists)}，最新可用月：${health.officialCache.latestAvailableMonth ?? '暂无'}`)
  console.log(`榜单缓存：${formatExists(health.rankingCache.exists)}，记录数：${health.rankingCache.itemCount ?? 0}`)
  console.log(`最近刷新：${health.latestRefresh ? `${health.latestRefresh.trigger}/${health.latestRefresh.status}` : '暂无'}`)
  console.log(`来源覆盖：${health.sourceCoverage.availableSourceCount}/${health.sourceCoverage.sourceCount}`)

  if (health.reasons.length > 0) {
    console.log('降级原因：')
    for (const reason of health.reasons) {
      console.log(`- ${reason}`)
    }
  }
}

// 执行命令行健康检查。
async function main() {
  const url = getHealthUrl()

  try {
    const health = await fetchServiceHealth(url)
    printHealthSummary(health, url)
  } catch (error) {
    process.exitCode = 1
    console.error(`健康检查失败：${error instanceof Error ? error.message : '未知错误'}`)
    console.error(`请确认 API 已启动：${url}`)
  }
}

// 启动命令行入口。
void main()
