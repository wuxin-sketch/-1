import type { CorsOptions } from 'cors'
import type { NextFunction, Request, Response } from 'express'
import { timingSafeEqual } from 'node:crypto'

// 定义管理员令牌支持读取的环境变量名称。
const adminTokenEnvironmentKeys = ['YUEZHI_ADMIN_TOKEN', 'ADMIN_API_TOKEN'] as const

// 定义本地开发默认允许的前端来源。
const localDevelopmentOrigins = new Set(['http://127.0.0.1:5175', 'http://localhost:5175', 'http://127.0.0.1:4175', 'http://localhost:4175'])

// 从逗号分隔环境变量中解析可信来源列表。
function parseCsvEnvironmentValue(value: string | undefined) {
  return new Set(
    String(value ?? '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean),
  )
}

// 判断当前运行环境是否应按生产环境处理。
export function isProductionLikeEnvironment(environment: NodeJS.ProcessEnv = process.env) {
  return environment.NODE_ENV === 'production' || environment.VERCEL === '1' || environment.VERCEL === 'true'
}

// 读取服务端管理员令牌。
export function readAdminToken(environment: NodeJS.ProcessEnv = process.env) {
  return adminTokenEnvironmentKeys.map((key) => environment[key]).find((value): value is string => Boolean(value?.trim()))?.trim() ?? ''
}

// 判断主机名是否为本机回环地址。
export function isLoopbackHostName(hostName: string) {
  const normalized = hostName.trim().toLowerCase().replace(/^\[|\]$/g, '')
  return normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '::1' || normalized === '::ffff:127.0.0.1'
}

// 从请求 Host 头中提取主机名。
function getRequestHostName(request: Request) {
  const host = request.headers.host ?? request.hostname ?? ''
  return String(host).split(':')[0] ?? ''
}

// 判断请求是否来自本机回环入口。
function isLoopbackRequest(request: Request) {
  return isLoopbackHostName(getRequestHostName(request)) || isLoopbackHostName(request.ip ?? '')
}

// 判断跨域来源是否允许访问当前服务。
export function isAllowedCorsOrigin(origin: string | undefined, requestHost = '', environment: NodeJS.ProcessEnv = process.env) {
  if (!origin) {
    return true
  }

  const configuredOrigins = parseCsvEnvironmentValue(environment.YUEZHI_CORS_ORIGINS ?? environment.CORS_ORIGIN)
  if (configuredOrigins.has(origin)) {
    return true
  }

  try {
    const originUrl = new URL(origin)
    if (originUrl.host === requestHost) {
      return true
    }

    if (!isProductionLikeEnvironment(environment) && isLoopbackHostName(originUrl.hostname) && localDevelopmentOrigins.has(origin)) {
      return true
    }
  } catch {
    return false
  }

  return false
}

// 为当前请求生成 CORS 配置。
export function buildCorsOptionsForRequest(request: Request, environment: NodeJS.ProcessEnv = process.env): CorsOptions {
  const requestHost = String(request.headers.host ?? '')

  return {
    origin(origin, callback) {
      callback(null, isAllowedCorsOrigin(origin, requestHost, environment))
    },
    optionsSuccessStatus: 204,
  }
}

// 创建可传给 cors 中间件的动态配置委托。
export function createCorsOptionsDelegate(environment: NodeJS.ProcessEnv = process.env) {
  return (request: Request, callback: (error: Error | null, options?: CorsOptions) => void) => {
    callback(null, buildCorsOptionsForRequest(request, environment))
  }
}

// 使用常量时间比较校验管理员令牌。
export function isAdminTokenAccepted(providedToken: string, expectedToken: string) {
  if (!providedToken || !expectedToken) {
    return false
  }

  const provided = Buffer.from(providedToken)
  const expected = Buffer.from(expectedToken)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

// 从请求头中读取管理员令牌。
function readRequestAdminToken(request: Request) {
  const authorization = String(request.headers.authorization ?? '')
  if (authorization.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }

  const headerToken = request.headers['x-admin-token']
  return Array.isArray(headerToken) ? headerToken[0] ?? '' : String(headerToken ?? '')
}

// 判断请求是否允许执行管理员操作。
export function isAdminRequestAllowed(request: Request, environment: NodeJS.ProcessEnv = process.env) {
  const expectedToken = readAdminToken(environment)
  if (expectedToken) {
    return isAdminTokenAccepted(readRequestAdminToken(request), expectedToken)
  }

  return !isProductionLikeEnvironment(environment) && isLoopbackRequest(request)
}

// 拦截未授权的管理员接口请求。
export function requireAdminRequest(request: Request, response: Response, next: NextFunction) {
  if (isAdminRequestAllowed(request)) {
    next()
    return
  }

  response.status(readAdminToken() ? 401 : 403).json({
    message: readAdminToken() ? '管理员令牌无效或缺失。' : '生产环境必须配置 YUEZHI_ADMIN_TOKEN 或 ADMIN_API_TOKEN。',
  })
}
