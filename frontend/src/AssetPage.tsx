import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  Plus,
  Sparkles,
  ArrowUpRight,
  ArrowDownRight,
  FileText,
  RefreshCw,
  ExternalLink,
} from 'lucide-react'
import { api, money, dateLabel, navigate } from './api'
import type { Detail, News, Outlook, Claim, Overview } from './types'
import { AssetMark, Change, ErrorBox, Loading, Modal, PriceMeta } from './components'
import PriceChart from './Chart'

export function NewsCard({ item, onOpen }: { item: News; onOpen: (n: News) => void }) {
  return (
    <button className="news-card" onClick={() => onOpen(item)}>
      <div className="news-meta">
        <span className="topic">{item.topic}</span>
        <span>{dateLabel(item.published_at)}</span>
      </div>
      <h3>{item.title}</h3>
      <p>{item.summary}</p>
      <div className="news-source">
        <FileText size={13} />
        <span>{item.source}</span>
        <ArrowUpRight size={15} />
      </div>
    </button>
  )
}
export function NewsModal({ item, onClose }: { item: News; onClose: () => void }) {
  return (
    <Modal title={item.is_sample ? 'Sample evidence' : 'Source article'} onClose={onClose}>
      <span className="eyebrow">
        {item.source} · {dateLabel(item.published_at)}
      </span>
      <h2 className="article-title">{item.title}</h2>
      <p className="article-summary">{item.summary}</p>
      {item.is_sample ? (
        <div className="demo-note">
          This brief is fictional and exists to demonstrate the research workflow. It is not
          published journalism or a report of actual events.
        </div>
      ) : (
        <>
          <p className="small muted">This is a provider-supplied summary, not the full article.</p>
          <a className="button primary" href={item.url!} target="_blank" rel="noreferrer">
            Read original article
            <ExternalLink size={15} />
          </a>
        </>
      )}
    </Modal>
  )
}

export default function AssetPage({
  id,
  overview,
  onWatch,
  onHolding,
  watchBusy,
}: {
  id: string
  overview: Overview
  onWatch: (id: string) => void
  onHolding: (id: string) => void
  watchBusy: boolean
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [outlook, setOutlook] = useState<Outlook | null>(null)
  const [error, setError] = useState('')
  const [aiError, setAiError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [source, setSource] = useState<News | null>(null)
  const [revision, setRevision] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setDetail(null)
    setOutlook(null)
    setError('')
    setAiError('')
    setGenerating(false)
    api<Detail>(`/assets/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then(setDetail)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
    api<Outlook | null>(`/assets/${encodeURIComponent(id)}/outlook`, { signal: controller.signal })
      .then(setOutlook)
      .catch((e) => {
        if (!controller.signal.aborted) setAiError(e.message)
      })
    return () => controller.abort()
  }, [id, revision])
  async function generate() {
    setGenerating(true)
    setAiError('')
    try {
      setOutlook(
        await api<Outlook>(`/assets/${encodeURIComponent(id)}/outlook`, { method: 'POST' }),
      )
    } catch (e) {
      setAiError((e as Error).message)
    } finally {
      setGenerating(false)
    }
  }
  if (error) return <ErrorBox message={error} retry={() => setRevision((x) => x + 1)} />
  if (!detail) return <Loading label="Opening asset research…" />
  const { asset, quote } = detail
  const watched = overview.watchlist.includes(id)
  function claim(c: Claim) {
    return (
      <>
        {c.text}
        <span className="citations">
          {c.source_ids.map((s) => {
            const index = outlook!.sources.findIndex((x) => x.id === s)
            return (
              <button
                key={s}
                aria-label={`Read source ${index + 1}`}
                onClick={() => setSource(outlook!.sources[index])}
              >
                {index + 1}
              </button>
            )
          })}
        </span>
      </>
    )
  }
  return (
    <div className="asset-page fade-in">
      <button className="back-button" onClick={() => navigate('/research')}>
        <ArrowLeft size={15} />
        All assets
      </button>
      <div className="asset-heading">
        <div className="asset-title">
          <AssetMark asset={asset} />
          <div>
            <div className="title-line">
              <h1>{asset.name}</h1>
              <span className="badge neutral">{asset.symbol}</span>
            </div>
            <p>
              {asset.exchange} <span>·</span> {asset.sector} <span>·</span> USD
            </p>
          </div>
        </div>
        <div className="actions">
          <button
            className={`button ${watched ? 'subtle' : 'secondary'}`}
            disabled={watchBusy}
            onClick={() => onWatch(id)}
          >
            {watched ? <BookmarkCheck size={16} /> : <Bookmark size={16} />}{' '}
            {watched ? 'Watching' : 'Watch asset'}
          </button>
          <button className="button primary" onClick={() => onHolding(id)}>
            <Plus size={16} />
            {overview.portfolio.holdings.some((h) => h.asset_id === id)
              ? 'Edit holding'
              : 'Add holding'}
          </button>
        </div>
      </div>
      <div className="research-layout">
        <div className="research-main">
          <section className="panel price-panel">
            {quote ? (
              <>
                <PriceMeta quote={quote} />
                <div className="price-line">
                  <strong>{money(quote.price)}</strong>
                  <Change value={quote.change_percent} />
                </div>
                <span className="small muted">
                  As of {dateLabel(quote.as_of)} ·{' '}
                  {asset.kind === 'crypto' ? '24-hour change' : 'Change from prior close'}
                </span>
              </>
            ) : (
              <ErrorBox message={detail.errors.quote || 'Price unavailable'} />
            )}
            {detail.errors.history ? (
              <ErrorBox message={detail.errors.history} />
            ) : (
              <PriceChart points={detail.history} symbol={asset.symbol} />
            )}
          </section>
          <section className="panel outlook-panel" id="outlook">
            <div className="section-heading">
              <div className="section-title">
                <span className="icon-tile">
                  <Sparkles size={19} />
                </span>
                <div>
                  <h2>Market outlook</h2>
                  <p>
                    {overview.mode === 'demo'
                      ? 'Explore a sample evidence-based outlook'
                      : 'An evidence-based perspective on the current narrative'}
                  </p>
                </div>
              </div>
              <span className="badge mint">
                {overview.mode === 'demo' ? 'Sample analysis' : 'Gemini'}
              </span>
            </div>
            {aiError && <ErrorBox message={aiError} />}
            {!outlook ? (
              <div className="outlook-empty">
                <div className="orbit-mark">
                  <Sparkles size={28} />
                </div>
                <h3>Understand the story behind the price.</h3>
                <p>
                  Connect recent coverage with the strongest arguments on both sides. Every point
                  links back to its evidence.
                </p>
                <button
                  className="button primary"
                  disabled={generating || detail.news.length < 2}
                  onClick={generate}
                >
                  {generating ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{' '}
                  {generating
                    ? 'Building your outlook…'
                    : overview.mode === 'demo'
                      ? 'Generate sample outlook'
                      : 'Generate outlook'}
                </button>
                <span className="small muted">
                  {detail.news.length < 2
                    ? 'At least two recent articles are required.'
                    : `${detail.news.length} sources available · ${overview.mode === 'demo' ? 'Curated demo; no AI call' : 'Summarized from article titles and abstracts'}`}
                </span>
              </div>
            ) : (
              <>
                <div className="outlook-summary">
                  <span className="eyebrow">THE BIG PICTURE</span>
                  <p>{claim(outlook.summary)}</p>
                </div>
                <div className="narrative">
                  <h3>The current narrative</h3>
                  <p>{claim(outlook.narrative)}</p>
                </div>
                <div className="case-grid">
                  <div className="case bull">
                    <h3>
                      <ArrowUpRight size={19} />
                      The bull case
                    </h3>
                    {outlook.bull_case.map((c, i) => (
                      <p key={i}>{claim(c)}</p>
                    ))}
                  </div>
                  <div className="case bear">
                    <h3>
                      <ArrowDownRight size={19} />
                      The bear case
                    </h3>
                    {outlook.bear_case.map((c, i) => (
                      <p key={i}>{claim(c)}</p>
                    ))}
                  </div>
                </div>
                <div className="outlook-footer">
                  <span>
                    {outlook.is_sample ? 'Curated sample' : outlook.model} · Generated{' '}
                    {dateLabel(outlook.generated_at)}
                    {outlook.cached ? ' · Saved result' : ''}
                    {outlook.stale ? ' · Ready to refresh' : ''}
                  </span>
                  <button className="text-button" disabled={generating} onClick={generate}>
                    <RefreshCw size={13} className={generating ? 'spin' : ''} />
                    {generating
                      ? 'Working…'
                      : outlook.stale
                        ? 'Refresh outlook'
                        : 'Check for update'}
                  </button>
                </div>
                <p className="disclaimer">
                  {outlook.is_sample
                    ? 'Illustrative analysis of fictional briefs. No live model was called.'
                    : 'AI summaries may be incomplete. Review the linked sources and their publication dates.'}{' '}
                  Outlooks are reused for up to 3 hours.
                </p>
              </>
            )}
          </section>
        </div>
        <aside className="research-aside">
          <section className="panel asset-context">
            <span className="eyebrow">ASSET SNAPSHOT</span>
            <h3>{asset.symbol} at a glance</h3>
            <dl>
              <div>
                <dt>Asset type</dt>
                <dd>
                  {asset.kind === 'etf'
                    ? 'ETF'
                    : asset.kind === 'crypto'
                      ? 'Cryptocurrency'
                      : 'Stock'}
                </dd>
              </div>
              <div>
                <dt>Exchange</dt>
                <dd>{asset.exchange}</dd>
              </div>
              <div>
                <dt>Sector</dt>
                <dd>{asset.sector}</dd>
              </div>
              <div>
                <dt>Currency</dt>
                <dd>USD</dd>
              </div>
              <div>
                <dt>In your portfolio</dt>
                <dd>{overview.portfolio.holdings.some((h) => h.asset_id === id) ? 'Yes' : 'No'}</dd>
              </div>
            </dl>
          </section>
          <div className="section-heading news-heading">
            <h2>Recent coverage</h2>
            <span className="count">{detail.news.length}</span>
          </div>
          {detail.errors.news && <ErrorBox message={detail.errors.news} />}
          {!detail.news.length && !detail.errors.news && (
            <div className="empty-state small-empty">
              No relevant articles from the last seven days.
            </div>
          )}
          <div className="news-list">
            {detail.news.map((n) => (
              <NewsCard key={n.id} item={n} onOpen={setSource} />
            ))}
          </div>
          {overview.mode === 'demo' && (
            <p className="aside-note">
              All prices, news briefs, and analysis in this workspace are sample data.
            </p>
          )}
        </aside>
      </div>
      {source && <NewsModal item={source} onClose={() => setSource(null)} />}
    </div>
  )
}
