import type { Request } from 'express'
import { describe, expect, it } from 'vitest'
import { isAdminRequestAllowed, isAllowedCorsOrigin, isProductionLikeEnvironment } from '../server/security'

// 构造最小 Express 请求对象以测试鉴权逻辑。
function buildRequest(headers: Record<string, string>, ip = '127.0.0.1'): Request {
  return { headers, ip, hostname: '127.0.0.1' } as unknown as Request
}

// 验证服务端管理接口的 CORS 和令牌防护。
describe('server security controls', () => {
  // 验证生产环境判定包含标准生产模式和 Vercel 部署环境。
  it('detects production-like environments', () => {
    expect(isProductionLikeEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isProductionLikeEnvironment({ VERCEL: '1' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isProductionLikeEnvironment({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(false)
  })

  // 验证生产环境只允许同源或显式配置的跨域来源。
  it('blocks untrusted production CORS origins', () => {
    const environment = { NODE_ENV: 'production', YUEZHI_CORS_ORIGINS: 'https://safe.example' } as NodeJS.ProcessEnv

    expect(isAllowedCorsOrigin('https://safe.example', 'api.example', environment)).toBe(true)
    expect(isAllowedCorsOrigin('https://api.example', 'api.example', environment)).toBe(true)
    expect(isAllowedCorsOrigin('http://127.0.0.1:5175', 'api.example', environment)).toBe(false)
    expect(isAllowedCorsOrigin('https://evil.example', 'api.example', environment)).toBe(false)
  })

  // 验证没有令牌时仅允许非生产本地回环请求执行管理操作。
  it('allows local admin actions only outside production without a token', () => {
    const request = buildRequest({ host: '127.0.0.1:8787' })

    expect(isAdminRequestAllowed(request, { NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBe(true)
    expect(isAdminRequestAllowed(request, { NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBe(false)
  })

  // 验证生产管理接口必须携带正确的管理员令牌。
  it('requires a valid admin token in production', () => {
    const environment = { NODE_ENV: 'production', YUEZHI_ADMIN_TOKEN: 'secret-token' } as NodeJS.ProcessEnv

    expect(isAdminRequestAllowed(buildRequest({ host: 'api.example', authorization: 'Bearer secret-token' }, '203.0.113.10'), environment)).toBe(true)
    expect(isAdminRequestAllowed(buildRequest({ host: 'api.example', authorization: 'Bearer wrong-token' }, '203.0.113.10'), environment)).toBe(false)
  })
})
