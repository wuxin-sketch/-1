import { importDataFile } from './importer.ts'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 读取命令行参数值。
function readArg(name: string) {
  const prefix = `--${name}=`
  const inline = process.argv.find((item) => item.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length)
  }

  const index = process.argv.indexOf(`--${name}`)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// 运行月度数据导入命令。
async function runImportCli() {
  const month = readArg('month')
  const file = readArg('file')

  if (!month || !file) {
    throw new Error('Usage: npm run import:data -- --month=2026-06 --file=data/imports/2026-06.csv')
  }

  const result = await importDataFile({ month, file })
  console.log(JSON.stringify({ cacheFile: result.cacheFile, run: result.run }, null, 2))
}

// 在直接执行脚本时启动导入命令。
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runImportCli().catch((error: unknown) => {
    console.error(error)
    process.exitCode = 1
  })
}
