import * as cheerio from 'cheerio'
import type { SourceAdapter, SourceSnapshot, SourceStatus } from '../../src/types.ts'

// 定义需要从公开页面中识别的车型关键词。
const TRACKED_MODELS = [
  { id: 'honda-crv', labels: ['CR-V', '本田CR-V', '本田 CR-V'] },
  { id: 'toyota-rav4', labels: ['RAV4荣放', '丰田RAV4', '丰田 RAV4'] },
  { id: 'nissan-xtrail', labels: ['奇骏', '日产奇骏', '日产 奇骏'] },
  { id: 'vw-tiguan-l', labels: ['途观L', '大众途观', '大众 途观'] },
  { id: 'buick-envision', labels: ['昂科威', '别克昂科威', '别克 昂科威'] },
  { id: 'honda-breeze', labels: ['皓影', '本田皓影', '本田 皓影'] },
  { id: 'mazda-cx5', labels: ['CX-5', '马自达CX-5', '马自达 CX-5'] },
  { id: 'skoda-kodiaq', labels: ['柯迪亚克', '斯柯达柯迪亚克'] },
  { id: 'hyundai-santafe', labels: ['胜达', '现代胜达', '现代 胜达'] },
  { id: 'chevrolet-equinox', labels: ['探界者', '雪佛兰探界者'] },
]

// 从公开 URL 拉取 HTML，不处理登录、验证码或反爬绕过。
async function fetchPublicHtml(url: string) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) YuezhiHaocheBot/1.0',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      },
    })

    if (!response.ok) {
      throw new Error(`source request failed: ${response.status}`)
    }

    return decodePublicHtml(response)
  } finally {
    clearTimeout(timeout)
  }
}

// 按公开页面声明的字符集解码 HTML。
async function decodePublicHtml(response: Response) {
  const contentType = response.headers.get('content-type') ?? ''
  const charset = contentType.match(/charset=([^;]+)/i)?.[1]?.trim().toLowerCase()
  const buffer = await response.arrayBuffer()

  try {
    return new TextDecoder(charset || 'utf-8').decode(buffer)
  } catch {
    return new TextDecoder('utf-8').decode(buffer)
  }
}

// 拉取中国汽车流通协会公开数据页。
async function fetchCadaHtml() {
  return fetchPublicHtml('https://www.cada.cn/Data/list_86_1.html')
}

// 拉取瓜子二手车公开入口页。
async function fetchGuaziHtml() {
  return fetchPublicHtml('https://www.guazi.com/')
}

// 拉取车300公开入口页。
async function fetchChe300Html() {
  return fetchPublicHtml('https://www.che300.com/')
}

// 拉取易车公开入口页。
async function fetchYicheHtml() {
  return fetchPublicHtml('https://www.yiche.com/')
}

// 拉取二手车之家公开入口页。
async function fetchChe168Html() {
  return fetchPublicHtml('https://www.che168.com/')
}

// 拉取汽车之家公开入口页。
async function fetchAutohomeHtml() {
  return fetchPublicHtml('https://www.autohome.com.cn/')
}

// 拉取懂车帝公开入口页。
async function fetchDongchediHtml() {
  return fetchPublicHtml('https://www.dongchedi.com/')
}

// 从 HTML 中读取显式 data-model 样本。
function extractDataModelSnapshots(html: string, sourceId: string) {
  const $ = cheerio.load(html)
  const capturedAt = new Date().toISOString()
  const snapshots: SourceSnapshot[] = []

  $('[data-model]').each((_, node) => {
    const element = $(node)
    const modelId = element.attr('data-model') ?? ''
    const listingCount = Number(element.attr('data-listings') ?? 0)
    const soldHintCount = Number(element.attr('data-sold') ?? 0)

    if (modelId) {
      snapshots.push({ modelId, sourceId, listingCount, soldHintCount, capturedAt })
    }
  })

  return snapshots
}

// 统计车型关键词在公开文本中的出现次数。
function countModelMentions(text: string, labels: string[]) {
  return labels.reduce((maxCount, label) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = text.match(new RegExp(escaped, 'gi'))
    return Math.max(maxCount, matches?.length ?? 0)
  }, 0)
}

// 从普通文本中识别车型关键词作为弱信号。
function extractKeywordSnapshots(html: string, sourceId: string) {
  const text = cheerio.load(html).text()
  const capturedAt = new Date().toISOString()

  return TRACKED_MODELS.map((model) => ({
    modelId: model.id,
    sourceId,
    listingCount: countModelMentions(text, model.labels),
    soldHintCount: 0,
    capturedAt,
  })).filter((snapshot) => snapshot.listingCount > 0)
}

// 归一化公开源页面中的车型信号。
export function normalizeSourceHtml(html: string, sourceId: string) {
  const explicitSnapshots = extractDataModelSnapshots(html, sourceId)

  if (explicitSnapshots.length > 0) {
    return explicitSnapshots
  }

  return extractKeywordSnapshots(html, sourceId)
}

// 构建来源状态验证结果。
export function validateSourceHtml(html: string, source: Pick<SourceAdapter, 'id' | 'name' | 'url'>) {
  const snapshots = normalizeSourceHtml(html, source.id)
  const hasHtml = html.trim().length > 200
  const health: SourceStatus['health'] = snapshots.length > 0 ? 'normal' : hasHtml ? 'partial' : 'offline'

  return {
    id: source.id,
    name: source.name,
    url: source.url,
    health,
    freshness: snapshots.length > 0 ? '刚刚' : '需复检',
    lastSync: new Date().toISOString(),
    sampleCount: snapshots.reduce((total, item) => total + item.listingCount, 0),
    note: snapshots.length > 0 ? '公开页面可解析车型信号' : '未发现可用车型信号，已降级',
  }
}

// 归一化协会来源页面。
function normalizeCadaHtml(html: string) {
  return normalizeSourceHtml(html, 'cada')
}

// 验证协会来源页面。
function validateCadaHtml(html: string) {
  return validateSourceHtml(html, {
    id: 'cada',
    name: '中国汽车流通协会',
    url: 'https://www.cada.cn/Data/list_86_1.html',
  })
}

// 归一化瓜子来源页面。
function normalizeGuaziHtml(html: string) {
  return normalizeSourceHtml(html, 'guazi')
}

// 验证瓜子来源页面。
function validateGuaziHtml(html: string) {
  return validateSourceHtml(html, {
    id: 'guazi',
    name: '瓜子二手车',
    url: 'https://www.guazi.com/',
  })
}

// 归一化车300来源页面。
function normalizeChe300Html(html: string) {
  return normalizeSourceHtml(html, 'che300')
}

// 验证车300来源页面。
function validateChe300Html(html: string) {
  return validateSourceHtml(html, {
    id: 'che300',
    name: '车300',
    url: 'https://www.che300.com/',
  })
}

// 归一化易车来源页面。
function normalizeYicheHtml(html: string) {
  return normalizeSourceHtml(html, 'yiche')
}

// 验证易车来源页面。
function validateYicheHtml(html: string) {
  return validateSourceHtml(html, {
    id: 'yiche',
    name: '易车',
    url: 'https://www.yiche.com/',
  })
}

// 归一化二手车之家来源页面。
function normalizeChe168Html(html: string) {
  return normalizeSourceHtml(html, 'che168')
}

// 验证二手车之家来源页面。
function validateChe168Html(html: string) {
  return validateSourceHtml(html, {
    id: 'che168',
    name: '二手车之家',
    url: 'https://www.che168.com/',
  })
}

// 归一化汽车之家来源页面。
function normalizeAutohomeHtml(html: string) {
  return normalizeSourceHtml(html, 'autohome')
}

// 验证汽车之家来源页面。
function validateAutohomeHtml(html: string) {
  return validateSourceHtml(html, {
    id: 'autohome',
    name: '汽车之家',
    url: 'https://www.autohome.com.cn/',
  })
}

// 归一化懂车帝来源页面。
function normalizeDongchediHtml(html: string) {
  return normalizeSourceHtml(html, 'dongchedi')
}

// 验证懂车帝来源页面。
function validateDongchediHtml(html: string) {
  return validateSourceHtml(html, {
    id: 'dongchedi',
    name: '懂车帝',
    url: 'https://www.dongchedi.com/',
  })
}

// 定义公开源抓取适配器集合。
export const sourceAdapters: SourceAdapter[] = [
  {
    id: 'cada',
    name: '中国汽车流通协会',
    url: 'https://www.cada.cn/Data/list_86_1.html',
    fetch: fetchCadaHtml,
    normalize: normalizeCadaHtml,
    validate: validateCadaHtml,
  },
  {
    id: 'guazi',
    name: '瓜子二手车',
    url: 'https://www.guazi.com/',
    fetch: fetchGuaziHtml,
    normalize: normalizeGuaziHtml,
    validate: validateGuaziHtml,
  },
  {
    id: 'che300',
    name: '车300',
    url: 'https://www.che300.com/',
    fetch: fetchChe300Html,
    normalize: normalizeChe300Html,
    validate: validateChe300Html,
  },
  {
    id: 'yiche',
    name: '易车',
    url: 'https://www.yiche.com/',
    fetch: fetchYicheHtml,
    normalize: normalizeYicheHtml,
    validate: validateYicheHtml,
  },
  {
    id: 'che168',
    name: '二手车之家',
    url: 'https://www.che168.com/',
    fetch: fetchChe168Html,
    normalize: normalizeChe168Html,
    validate: validateChe168Html,
  },
  {
    id: 'autohome',
    name: '汽车之家',
    url: 'https://www.autohome.com.cn/',
    fetch: fetchAutohomeHtml,
    normalize: normalizeAutohomeHtml,
    validate: validateAutohomeHtml,
  },
  {
    id: 'dongchedi',
    name: '懂车帝',
    url: 'https://www.dongchedi.com/',
    fetch: fetchDongchediHtml,
    normalize: normalizeDongchediHtml,
    validate: validateDongchediHtml,
  },
]
