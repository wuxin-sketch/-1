import { describe, expect, it } from 'vitest'
import { buildOfficialUnavailableMarket, parseOfficialUsedCarMarketPayloads, resolveCadaBaseUrl, selectOfficialUsedCarMarketMonth } from '../server/official/cada'

// 验证 CADA 官方数据解析逻辑。
describe('official CADA used car market parser', () => {
  // 验证 CADA 官方数据源必须使用 HTTPS。
  it('requires HTTPS for the official CADA base URL', () => {
    expect(resolveCadaBaseUrl({} as NodeJS.ProcessEnv)).toBe('https://data.cada.cn')
    expect(() => resolveCadaBaseUrl({ CADA_BASE_URL: 'http://data.cada.cn' } as NodeJS.ProcessEnv)).toThrow('HTTPS')
  })

  // 验证最新月份和全国交易量按接口原单位解析。
  it('parses latest official month and keeps original units', () => {
    const market = parseOfficialUsedCarMarketPayloads(
      {
        monthTradingVolume: {
          code: 200,
          data: {
            xAxis: ['2026年3月', '4月', '5月'],
            series: [
              { name: '交易量', type: 'bar', data: ['179', '167', '160'] },
              { name: '环比', type: 'line', data: ['37.7', '-6.7', '-4.2'] },
            ],
          },
        },
        countryTradeStatusTop: {
          code: 200,
          data: {
            xAxis: ['总计', '广东', '山东'],
            series: [{ name: '交易量', type: 'bar', data: ['160.16', '21.73', '16.17'] }],
          },
        },
        subModelTopTen: {
          code: 200,
          data: {
            xAxis: ['轩逸', '宏光'],
            series: [{ name: '6月', type: 'bar', data: ['0.9', '1.2'] }],
          },
        },
        wholeCountryTransfer: {
          code: 200,
          data: {
            xAxis: ['4月', '5月'],
            series: [{ name: '2026年转籍', type: 'line', data: ['32.3', '31.5'] }],
          },
        },
        managerIndex: {
          code: 200,
          data: {
            xAxis: ['2026年4月', '5月'],
            lineValue: [45.1, 46.4],
          },
        },
      },
      undefined,
      '2026-06-30T10:00:00.000Z',
    )

    expect(market.dataMode).toBe('official')
    expect(market.dataFreshness).toBe('fresh')
    expect(market.latestAvailableMonth).toBe('2026年5月')
    expect(market.nationalVolumeWan).toBe(160)
    expect(market.momPercent).toBe(-4.2)
    expect(market.provinceTop[0]).toEqual({ province: '广东', volumeWan: 21.73 })
    expect(market.officialModelTopTen[0].model).toBe('宏光')
    expect(market.officialModelTopTen[0].scopeNote).toContain('不限SUV/价格区间')
    expect(market.officialModelTopTen[0].scopeNote).not.toContain('10-20万')
    expect(market.transferRateTrend.at(-1)?.ratePercent).toBe(31.5)
    expect(market.managerIndexTrend.at(-1)?.index).toBe(46.4)
  })

  // 验证官方接口失败时不会伪造销量。
  it('returns explicit unavailable state without fake official data', () => {
    const market = buildOfficialUnavailableMarket('官方数据暂不可用。', '2026-06-30T10:00:00.000Z')

    expect(market.dataMode).toBe('official')
    expect(market.dataFreshness).toBe('unavailable')
    expect(market.nationalVolumeWan).toBeNull()
    expect(market.officialModelTopTen).toHaveLength(0)
    expect(market.unavailableReason).toBe('官方数据暂不可用。')
  })

  // 验证选择未发布月份时不会伪造官方月度交易量。
  it('marks selected unpublished month without fake official volume', () => {
    const market = parseOfficialUsedCarMarketPayloads({
      monthTradingVolume: {
        code: 200,
        data: {
          xAxis: ['2026年4月', '5月'],
          series: [
            { name: '交易量', type: 'bar', data: ['167', '160'] },
            { name: '环比', type: 'line', data: ['-6.7', '-4.2'] },
          ],
        },
      },
    })

    const selected = selectOfficialUsedCarMarketMonth(market, '2026-06')

    expect(selected.latestAvailableMonth).toBe('2026年5月')
    expect(selected.selectedMonthLabel).toBe('2026年6月')
    expect(selected.selectedMonthStatus).toBe('pending')
    expect(selected.nationalVolumeWan).toBeNull()
    expect(selected.unavailableReason).toContain('尚未发布')
  })
})
