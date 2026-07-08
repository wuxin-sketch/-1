import { useEffect, useState, type ChangeEvent } from 'react'
import { AlertTriangle, CheckCircle2, DatabaseZap, FileCheck2, Upload } from 'lucide-react'
import { commitImportPreview, previewImportData } from '../services/rankingsApi'
import type { ImportCommitResponse, ImportPreviewResponse, MonthOption } from '../types'

interface DataImportPanelProps {
  currentMonth: string
  monthOptions: MonthOption[]
  onImportCommitted: (result: ImportCommitResponse) => Promise<void> | void
}

// 读取上传文件的纯文本内容。
async function readFileText(file: File) {
  return file.text()
}

// 格式化导入预览中的价格区间。
function formatPreviewPrice(item: ImportPreviewResponse['previewItems'][number]) {
  return `${(item.priceMin / 10000).toFixed(1)}-${(item.priceMax / 10000).toFixed(1)}万`
}

// 判断预览结果是否可以确认入库。
function canCommitPreview(preview: ImportPreviewResponse | null) {
  return Boolean(preview?.previewId && preview.validRecordCount > 0 && preview.errors.length === 0)
}

// 渲染真实月度数据导入闭环面板。
export function DataImportPanel({ currentMonth, monthOptions, onImportCommitted }: DataImportPanelProps) {
  const [month, setMonth] = useState(currentMonth)
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [preview, setPreview] = useState<ImportPreviewResponse | null>(null)
  const [message, setMessage] = useState('')
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isCommitting, setIsCommitting] = useState(false)

  // 同步外部月份变化到导入表单。
  useEffect(() => {
    setMonth(currentMonth)
  }, [currentMonth])

  // 切换导入月份并清空旧预览。
  function handleMonthChange(value: string) {
    setMonth(value)
    setPreview(null)
    setMessage('')
  }

  // 读取用户选择的 CSV 或 JSON 文件。
  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    setPreview(null)
    setMessage('')

    if (!file) {
      setFileName('')
      setFileContent('')
      return
    }

    setFileName(file.name)
    setFileContent(await readFileText(file))
  }

  // 请求服务端生成导入预览。
  async function handlePreview() {
    if (!fileName || !fileContent) {
      setMessage('请先选择 CSV 或 JSON 文件。')
      return
    }

    setIsPreviewing(true)
    setMessage('')

    try {
      const result = await previewImportData({ month, fileName, content: fileContent })
      setPreview(result)
      setMessage(result.errors.length > 0 ? '预览未通过，请先处理错误。' : `预览完成：${result.validRecordCount} 条可入库记录。`)
    } finally {
      setIsPreviewing(false)
    }
  }

  // 确认导入预览并刷新父级数据。
  async function handleCommit() {
    if (!preview?.previewId) {
      setMessage('请先生成有效预览。')
      return
    }

    setIsCommitting(true)
    setMessage('')

    try {
      const result = await commitImportPreview(preview.previewId)
      setMessage(`导入成功：${result.run.successCount} 条记录已写入 ${result.month}。`)
      setPreview(null)
      await onImportCommitted(result)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '确认导入失败。')
    } finally {
      setIsCommitting(false)
    }
  }

  return (
    <section className="workspace-subview import-panel" aria-label="导入真实月度数据">
      <div className="section-title-row">
        <h2>导入真实月度数据</h2>
        <span>CSV / JSON</span>
      </div>

      <div className="import-form-grid">
        <label className="select-field">
          <span>导入月份</span>
          <select value={month} aria-label="导入月份" onChange={(event) => handleMonthChange(event.target.value)}>
            {monthOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} · {option.statusLabel}
              </option>
            ))}
          </select>
        </label>

        <label className="import-file-field">
          <span>导入文件</span>
          <input type="file" accept=".csv,.json,text/csv,application/json" onChange={handleFileChange} />
        </label>

        <div className="import-actions">
          <button className="outline-button" type="button" disabled={isPreviewing || !fileName} onClick={handlePreview}>
            <FileCheck2 size={15} />
            {isPreviewing ? '预览中' : '生成预览'}
          </button>
          <button className="outline-button primary" type="button" disabled={isCommitting || !canCommitPreview(preview)} onClick={handleCommit}>
            <DatabaseZap size={15} />
            {isCommitting ? '入库中' : '确认入库'}
          </button>
        </div>
      </div>

      {fileName ? (
        <div className="import-file-chip">
          <Upload size={14} />
          <span>{fileName}</span>
        </div>
      ) : null}

      {message ? (
        <p className={preview?.errors.length ? 'import-message error' : 'import-message'}>
          {preview?.errors.length ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
          {message}
        </p>
      ) : null}

      {preview ? (
        <div className="import-preview-block">
          <div className="import-summary-grid">
            <div>
              <span>原始记录</span>
              <strong>{preview.recordCount}</strong>
            </div>
            <div>
              <span>可入库</span>
              <strong>{preview.validRecordCount}</strong>
            </div>
            <div>
              <span>警告</span>
              <strong>{preview.warnings.length}</strong>
            </div>
            <div>
              <span>错误</span>
              <strong>{preview.errors.length}</strong>
            </div>
          </div>

          {preview.errors.length > 0 ? (
            <ul className="import-error-list">
              {preview.errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}

          {preview.warnings.length > 0 ? (
            <ul className="import-warning-list">
              {preview.warnings.slice(0, 5).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : null}

          {preview.previewItems.length > 0 ? (
            <div className="import-preview-table-wrap">
              <table className="import-preview-table">
                <thead>
                  <tr>
                    <th>车型</th>
                    <th>参考价</th>
                    <th>保值率</th>
                    <th>样本量</th>
                    <th>来源置信度</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.previewItems.map((item) => (
                    <tr key={item.id}>
                      <td>{`${item.brand} ${item.model}`}</td>
                      <td>{formatPreviewPrice(item)}</td>
                      <td>{item.retentionRate}%</td>
                      <td>{item.sampleSize}</td>
                      <td>{item.sourceConfidence}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
