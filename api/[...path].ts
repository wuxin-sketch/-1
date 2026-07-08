import { tsImport } from 'tsx/esm/api'
import 'cheerio'
import 'cors'
import 'express'

// 预加载动态后端运行所需的生产依赖，确保 Vercel 将它们打入函数包。
const { default: app } = await tsImport('../server/index.ts', import.meta.url)

// 将所有 /api 请求交给 Express 应用处理。
export default app
