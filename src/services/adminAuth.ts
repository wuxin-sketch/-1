// 定义浏览器中保存管理员令牌的本地键名。
const adminTokenStorageKey = 'yuezhi-admin-token'

// 从浏览器本地存储读取管理员令牌。
export function readAdminTokenFromBrowser() {
  if (typeof window === 'undefined') {
    return ''
  }

  try {
    return window.localStorage.getItem(adminTokenStorageKey)?.trim() ?? ''
  } catch {
    return ''
  }
}

// 为需要管理员权限的请求补充认证请求头。
export function buildAdminHeaders(headers: Record<string, string> = {}) {
  const token = readAdminTokenFromBrowser()
  if (!token) {
    return headers
  }

  return {
    ...headers,
    'x-admin-token': token,
  }
}

// 暴露令牌键名，便于运维人员在浏览器中设置。
export const adminTokenLocalStorageKey = adminTokenStorageKey
