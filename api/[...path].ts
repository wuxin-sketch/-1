import 'cheerio'
import 'cors'
import 'express'
import app from '../server/index.ts'

// 将所有 /api 请求交给 Express 应用处理，并交给 Vercel 构建阶段静态打包。
export default app
