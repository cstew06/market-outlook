import { useEffect, useRef, type ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, ArrowRight, X, AlertCircle, Loader2 } from 'lucide-react'
import type { Asset, Quote } from './types'
import { percent } from './api'

export function AssetMark({ asset, small = false }: { asset: Asset; small?: boolean }) {
  return (
    <span
      className={`asset-mark ${small ? 'small-mark' : ''}`}
      style={{ backgroundColor: `${asset.color}14`, color: asset.color }}
    >
      {asset.symbol === 'BTC'
        ? '₿'
        : asset.symbol === 'ETH'
          ? 'Ξ'
          : asset.symbol.slice(0, asset.symbol.length > 3 ? 1 : 2)}
    </span>
  )
}
export function Change({
  value,
  compact = false,
}: {
  value: number | null | undefined
  compact?: boolean
}) {
  return (
    <span
      className={`change ${value != null && value < 0 ? 'negative' : value != null ? 'positive' : 'muted'}`}
    >
      {!compact &&
        value != null &&
        (value < 0 ? <ArrowDownRight size={14} /> : <ArrowUpRight size={14} />)}
      {percent(value)}
    </span>
  )
}
export function ArrowLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button className="text-button" onClick={onClick}>
      {children}
      <ArrowRight size={14} />
    </button>
  )
}
export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      <div>
        {message}
        {retry && <button onClick={retry}>Try again</button>}
      </div>
    </div>
  )
}
export function Loading({ label = 'Loading your workspace…' }: { label?: string }) {
  return (
    <div className="loading" role="status">
      <Loader2 className="spin" size={22} />
      {label}
    </div>
  )
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current!
    dialog.showModal()
    return () => dialog.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide-modal' : ''}`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target === ref.current) {
          const r = ref.current.getBoundingClientRect()
          if (
            event.clientX < r.left ||
            event.clientX > r.right ||
            event.clientY < r.top ||
            event.clientY > r.bottom
          )
            onClose()
        }
      }}
      aria-label={title}
    >
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  )
}
export function PriceMeta({ quote }: { quote: Quote }) {
  return (
    <span className="small muted">
      {quote.price_label} ·{' '}
      {quote.provider === 'CoinGecko' ? (
        <a href="https://www.coingecko.com/en/api" target="_blank" rel="noreferrer">
          Data provided by CoinGecko
        </a>
      ) : (
        quote.provider
      )}
    </span>
  )
}
