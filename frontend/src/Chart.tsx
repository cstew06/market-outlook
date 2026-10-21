import { useEffect, useRef, useState } from 'react'
import { AreaSeries, ColorType, createChart, type Time } from 'lightweight-charts'
import type { Point } from './types'
import { money } from './api'

export function Sparkline({ points, positive = true }: { points: Point[]; positive?: boolean }) {
  if (points.length < 2) return <span className="muted">—</span>
  const values = points.slice(-24).map((p) => p.value)
  const min = Math.min(...values),
    span = Math.max(...values) - min || 1
  const line = values
    .map((v, i) => `${(i / (values.length - 1)) * 100},${32 - ((v - min) / span) * 28}`)
    .join(' ')
  return (
    <svg className="sparkline" viewBox="0 0 100 36" aria-hidden="true">
      <polyline
        fill="none"
        stroke={positive ? '#24866b' : '#c86c65'}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={line}
      />
    </svg>
  )
}

export default function PriceChart({ points, symbol }: { points: Point[]; symbol: string }) {
  const container = useRef<HTMLDivElement>(null)
  const [period, setPeriod] = useState('3M')
  const [hover, setHover] = useState<{ value: number; time: string } | null>(null)
  const count = ({ '1W': 7, '1M': 30, '3M': 90, '1Y': 365 } as Record<string, number>)[period]
  const cutoff = points.length
    ? new Date(`${points.at(-1)!.time}T12:00:00Z`).getTime() - count * 86400000
    : 0
  const visible = points.filter((p) => new Date(`${p.time}T12:00:00Z`).getTime() >= cutoff)
  const first = visible[0]?.value,
    last = visible.at(-1)?.value
  const change = first && last ? (last / first - 1) * 100 : 0
  const up = change >= 0
  useEffect(() => {
    if (!container.current || !visible.length) return
    setHover(null)
    const chart = createChart(container.current, {
      autoSize: true,
      height: 285,
      layout: {
        background: { type: ColorType.Solid, color: '#ffffff' },
        textColor: '#8b9496',
        fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { visible: false }, horzLines: { color: '#f0f2f1' } },
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      timeScale: { borderVisible: false, rightOffset: 0, fixLeftEdge: true, fixRightEdge: true },
      crosshair: {
        horzLine: { labelBackgroundColor: '#17634f' },
        vertLine: { labelBackgroundColor: '#17634f' },
      },
      handleScroll: false,
      handleScale: false,
    })
    const series = chart.addSeries(AreaSeries, {
      lineColor: up ? '#24866b' : '#c86c65',
      topColor: up ? 'rgba(36,134,107,.19)' : 'rgba(200,108,101,.15)',
      bottomColor: 'rgba(255,255,255,0)',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    })
    series.setData(visible.map((p) => ({ time: p.time as Time, value: p.value })))
    chart.timeScale().fitContent()
    chart.subscribeCrosshairMove((param) => {
      const value = param.seriesData.get(series)
      if (param.time && value && 'value' in value)
        setHover({ value: value.value, time: String(param.time) })
      else setHover(null)
    })
    return () => chart.remove()
    // Only rebuild when the selected asset/data or range changes.
  }, [points, period])
  return (
    <div className="chart-wrap">
      <div className="chart-toolbar">
        <div>
          <span className={up ? 'positive' : 'negative'}>
            {change >= 0 ? '+' : ''}
            {change.toFixed(2)}%
          </span>
          <span className="muted small"> over selected period</span>
        </div>
        <div className="segmented" aria-label="Chart period">
          {['1W', '1M', '3M', '1Y'].map((p) => (
            <button
              key={p}
              aria-pressed={period === p}
              className={period === p ? 'selected' : ''}
              onClick={() => setPeriod(p)}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-hover">
        {hover ? `${hover.time} · ${money(hover.value)}` : 'Hover over the chart to explore prices'}
      </div>
      {visible.length ? (
        <div
          ref={container}
          className="price-chart"
          role="img"
          aria-label={`${symbol} price chart, ${period}, ${change.toFixed(2)} percent change`}
        />
      ) : (
        <div className="empty-chart">Historical prices are not available.</div>
      )}
      <div className="chart-credit">
        Charts by{' '}
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          TradingView Lightweight Charts™
        </a>
        {' · Copyright © 2025 TradingView, Inc.'}
      </div>
    </div>
  )
}
