import 'cheerio'
import 'cors'
import 'express'
import type { IncomingMessage, ServerResponse } from 'node:http'
import app from '../server/index.ts'

// 将 Vercel 请求显式转交给 Express 应用处理。
export default function handler(request: IncomingMessage, response: ServerResponse) {
  return app(request, response)
}
