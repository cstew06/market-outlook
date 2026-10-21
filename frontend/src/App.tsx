import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BookmarkCheck,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Compass,
  ExternalLink,
  LayoutDashboard,
  Menu,
  Plus,
  Search,
  Settings2,
  Sparkles,
  Wallet,
  X,
  Pencil,
  Trash2,
  RefreshCw,
  Layers3,
  Database,
} from 'lucide-react'
import { api, dateLabel, money, navigate, signedMoney } from './api'
import type { Asset, Configuration, Detail, Holding, News, Overview } from './types'
import { ArrowLink, AssetMark, Change, ErrorBox, Loading, Modal } from './components'
import AssetPage, { NewsCard, NewsModal } from './AssetPage'
import { Sparkline } from './Chart'
import './styles.css'

const navItems = [
  { path: '/overview', label: 'Overview', icon: LayoutDashboard },
  { path: '/portfolio', label: 'Portfolio', icon: Wallet },
  { path: '/watchlist', label: 'Watchlist', icon: Bookmark },
  { path: '/research', label: 'Asset research', icon: Compass },
]

function HoldingModal({
  assets,
  holdings,
  existing,
  initialId,
  onClose,
  onSave,
}: {
  assets: Asset[]
  holdings: Holding[]
  existing?: Holding
  initialId?: string
  onClose: () => void
  onSave: () => void
}) {
  const [assetId, setAssetId] = useState(
    existing?.asset_id ||
      initialId ||
      assets.find((a) => !holdings.some((h) => h.asset_id === a.id))?.id ||
      assets[0].id,
  )
  const [quantity, setQuantity] = useState(existing?.quantity || '')
  const [cost, setCost] = useState(existing?.average_cost || '')
  const [error, setError] = useState(''),
    [saving, setSaving] = useState(false)
  const editing = holdings.some((h) => h.asset_id === assetId)
  function selectAsset(id: string) {
    setAssetId(id)
    const saved = holdings.find((h) => h.asset_id === id)
    setQuantity(saved?.quantity || '')
    setCost(saved?.average_cost || '')
  }
  useEffect(() => {
    if (!existing) selectAsset(assetId)
  }, [])
  async function submit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api(`/holdings/${assetId}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity, average_cost: cost }),
      })
      onSave()
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }
  return (
    <Modal
      title={editing ? 'Edit holding' : 'Add a holding'}
      onClose={() => {
        if (!saving) onClose()
      }}
    >
      <p className="modal-description">
        Track an asset you own. Enter your total quantity and average purchase price per unit.
      </p>
      <form onSubmit={submit}>
        <label>
          Asset
          <select
            aria-label="Asset"
            value={assetId}
            onChange={(e) => selectAsset(e.target.value)}
            disabled={!!existing || saving}
          >
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.symbol} · {a.name}
              </option>
            ))}
          </select>
        </label>
        <div className="form-grid">
          <label>
            Quantity
            <input
              required
              autoFocus
              type="number"
              min="0.0000000001"
              max="1000000000"
              step="any"
              placeholder="e.g. 10"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              disabled={saving}
            />
          </label>
          <label>
            Average cost (USD)
            <input
              required
              type="number"
              min="0"
              max="1000000000"
              step="any"
              placeholder="e.g. 125.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              disabled={saving}
            />
          </label>
        </div>
        <div className="cost-preview">
          <span>Total cost basis</span>
          <strong>{quantity && cost ? money(Number(quantity) * Number(cost)) : '—'}</strong>
        </div>
        {error && <ErrorBox message={error} />}
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add holding'}
          </button>
        </div>
      </form>
    </Modal>
  )
}

export default function App() {
  const [route, setRoute] = useState(window.location.hash.slice(1) || '/overview')
  const [overview, setOverview] = useState<Overview | null>(null)
  const [config, setConfig] = useState<Configuration | null>(null)
  const [error, setError] = useState(''),
    [refreshing, setRefreshing] = useState(false)
  const [revision, setRevision] = useState(0)
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false),
    [mobileOpen, setMobileOpen] = useState(false)
  const [holdingModal, setHoldingModal] = useState<{ id?: string; existing?: Holding } | null>(null)
  const [deleting, setDeleting] = useState<Holding | null>(null),
    [deleteBusy, setDeleteBusy] = useState(false)
  const [watchBusy, setWatchBusy] = useState(false)
  const [toast, setToast] = useState('')
  const [filter, setFilter] = useState('all'),
    [assetQuery, setAssetQuery] = useState('')
  const [news, setNews] = useState<News[]>([]),
    [newsError, setNewsError] = useState(''),
    [newsItem, setNewsItem] = useState<News | null>(null)
  const [tableSort, setTableSort] = useState<'symbol' | 'value' | 'gain'>('value')
  useEffect(() => {
    const onHash = () => {
      setRoute(window.location.hash.slice(1) || '/overview')
      setMobileOpen(false)
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [])
  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(''), 4500)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => {
    const controller = new AbortController()
    setRefreshing(true)
    setError('')
    Promise.all([
      api<Overview>('/overview', { signal: controller.signal }),
      api<Configuration>('/config', { signal: controller.signal }),
    ])
      .then(([data, c]) => {
        setOverview(data)
        setConfig(c)
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setRefreshing(false)
      })
    return () => controller.abort()
  }, [revision])
  useEffect(() => {
    const controller = new AbortController()
    api<Detail>('/assets/NVDA', { signal: controller.signal })
      .then((d) => {
        setNews(d.news)
        setNewsError(d.errors.news || '')
      })
      .catch((e) => {
        if (!controller.signal.aborted) setNewsError(e.message)
      })
    return () => controller.abort()
  }, [])
  const refresh = () => setRevision((r) => r + 1)
  async function toggleWatch(id: string) {
    if (!overview || watchBusy) return
    setWatchBusy(true)
    const remove = overview.watchlist.includes(id)
    try {
      await api(`/watchlist/${id}`, { method: remove ? 'DELETE' : 'PUT' })
      setOverview({
        ...overview,
        watchlist: remove
          ? overview.watchlist.filter((x) => x !== id)
          : [...overview.watchlist, id],
      })
      setToast(remove ? 'Removed from watchlist' : 'Added to watchlist')
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    } finally {
      setWatchBusy(false)
    }
  }
  async function deleteHolding() {
    if (!deleting) return
    setDeleteBusy(true)
    try {
      await api(`/holdings/${deleting.asset_id}`, { method: 'DELETE' })
      setDeleting(null)
      setToast('Holding removed')
      refresh()
    } catch (e) {
      setToast((e as Error).message)
    } finally {
      setDeleteBusy(false)
    }
  }
  function openHolding(id?: string) {
    const existing = overview?.portfolio.holdings.find((h) => h.asset_id === id)
    setHoldingModal({ id, existing: existing || undefined })
  }
  const isAsset = route.startsWith('/asset/')
  const assetId = isAsset ? route.slice(7).toUpperCase() : ''
  const title = isAsset
    ? 'Asset research'
    : navItems.find((n) => n.path === route)?.label || 'Overview'
  const demoMode = overview?.mode === 'demo'
  const assetMap = Object.fromEntries((overview?.assets || []).map((a) => [a.id, a]))
  const portfolio = overview?.portfolio
  const quoteErrors = overview ? Object.keys(overview.quote_errors) : []
  function holdingsTable(limit?: number) {
    if (!overview || !portfolio) return null
    const sorted = [...portfolio.holdings].sort((a, b) =>
      tableSort === 'symbol'
        ? a.asset_id.localeCompare(b.asset_id)
        : tableSort === 'gain'
          ? (b.gain ?? -Infinity) - (a.gain ?? -Infinity)
          : (b.value ?? -Infinity) - (a.value ?? -Infinity),
    )
    return !sorted.length ? (
      <div className="empty-state">
        <Wallet size={32} />
        <h3>A portfolio starts with one holding.</h3>
        <p>Add an asset to track its value and unrealized return.</p>
        <button className="button primary" onClick={() => openHolding()}>
          <Plus size={16} />
          Add your first holding
        </button>
      </div>
    ) : (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>
                <button onClick={() => setTableSort('symbol')}>Asset</button>
              </th>
              <th>Price</th>
              <th>Quantity</th>
              <th>
                <button onClick={() => setTableSort('value')}>
                  Value {tableSort === 'value' ? '↓' : ''}
                </button>
              </th>
              <th>
                <button onClick={() => setTableSort('gain')}>Return</button>
              </th>
              {!limit && (
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.slice(0, limit).map((h) => {
              const asset = assetMap[h.asset_id],
                quote = overview.quotes[h.asset_id]
              return (
                <tr key={h.asset_id}>
                  <td>
                    <button className="asset-cell" onClick={() => navigate(`/asset/${asset.id}`)}>
                      <AssetMark asset={asset} small />
                      <span>
                        <strong>{asset.symbol}</strong>
                        <small>{asset.name}</small>
                      </span>
                    </button>
                  </td>
                  <td>
                    {money(quote?.price)}
                    <small>
                      <Change value={quote?.change_percent} compact />
                    </small>
                  </td>
                  <td>
                    {Number(h.quantity).toLocaleString('en-US', { maximumFractionDigits: 10 })}
                    <small>{money(Number(h.average_cost))} avg.</small>
                  </td>
                  <td className="table-value">{money(h.value)}</td>
                  <td>
                    <span className={h.gain != null && h.gain < 0 ? 'negative' : 'positive'}>
                      {signedMoney(h.gain)}
                    </span>
                    <small>
                      <Change value={h.gain_percent} compact />
                    </small>
                  </td>
                  {!limit && (
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          aria-label={`Edit ${h.asset_id} holding`}
                          onClick={() => openHolding(h.asset_id)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          className="icon-button danger-hover"
                          aria-label={`Remove ${h.asset_id} holding`}
                          onClick={() => setDeleting(h)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
  }
  function assetCards(assets: Asset[], watch = false) {
    return (
      <div className="asset-grid">
        {assets.map((asset) => {
          const quote = overview?.quotes[asset.id],
            watched = overview?.watchlist.includes(asset.id)
          return (
            <article className="asset-card" key={asset.id}>
              <div className="asset-card-top">
                <button className="asset-cell" onClick={() => navigate(`/asset/${asset.id}`)}>
                  <AssetMark asset={asset} />
                  <span>
                    <strong>{asset.symbol}</strong>
                    <small>{asset.name}</small>
                  </span>
                </button>
                <button
                  className={`icon-button ${watched ? 'saved' : ''}`}
                  disabled={watchBusy}
                  aria-label={`${watched ? 'Remove' : 'Add'} ${asset.symbol} ${watched ? 'from' : 'to'} watchlist`}
                  onClick={() => toggleWatch(asset.id)}
                >
                  {watched ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                </button>
              </div>
              <button className="asset-card-price" onClick={() => navigate(`/asset/${asset.id}`)}>
                <div>
                  <strong>{money(quote?.price)}</strong>
                  <Change value={quote?.change_percent} />
                </div>
                {quote ? (
                  <Sparkline points={quote.history} positive={(quote.change_percent ?? 0) >= 0} />
                ) : (
                  <span className="small muted">
                    Open research
                    <ArrowRight size={15} />
                  </span>
                )}
              </button>
              <div className="asset-card-footer">
                <span>
                  {asset.kind === 'etf' ? 'ETF' : asset.kind === 'crypto' ? 'Crypto' : 'Stock'} ·{' '}
                  {asset.exchange}
                </span>
                <button className="text-button" onClick={() => navigate(`/asset/${asset.id}`)}>
                  Research
                  <ArrowUpRight size={13} />
                </button>
              </div>
              {watch && overview?.quote_errors[asset.id] && (
                <p className="small negative">{overview.quote_errors[asset.id]}</p>
              )}
            </article>
          )
        })}
      </div>
    )
  }
  return (
    <div className="app-shell">
      {mobileOpen && (
        <button
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <aside className={`sidebar ${mobileOpen ? 'mobile-open' : ''}`}>
        <button className="brand" onClick={() => navigate('/overview')}>
          <span className="brand-mark">
            <i />
            <i />
            <i />
          </span>
          <span>
            market<span className="brand-light">outlook</span>
            <small>Clarity in every market.</small>
          </span>
        </button>
        <div className="workspace-name">
          <span className="workspace-avatar">M</span>
          <div>
            <strong>Personal workspace</strong>
            <small>{demoMode ? 'Demo portfolio' : 'Your portfolio'}</small>
          </div>
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {navItems.map((n) => {
            const Icon = n.icon
            return (
              <button
                key={n.path}
                className={`nav-item ${route === n.path || (n.path === '/research' && isAsset) ? 'active' : ''}`}
                onClick={() => navigate(n.path)}
              >
                <Icon size={18} />
                {n.label}
                {n.path === '/watchlist' && overview && (
                  <span className="nav-count">{overview.watchlist.length}</span>
                )}
              </button>
            )
          })}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-message">
            <Sparkles size={19} />
            <strong>See the whole story.</strong>
            <p>Price is one part of the picture. Explore the evidence behind it.</p>
            <button onClick={() => navigate('/research')}>
              Explore research
              <ArrowRight size={14} />
            </button>
          </div>
          <button className="nav-item" onClick={() => setSettingsOpen(true)}>
            <Settings2 size={18} />
            Data & settings
          </button>
          <a
            className="nav-item"
            href="https://github.com/cstew06/market-outlook"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={17} />
            View on GitHub
          </a>
          <div className="connection-status">
            <span className={overview ? 'status-dot' : 'status-dot offline'} />
            {overview ? 'Workspace connected' : 'Connecting to workspace'}
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-title">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={21} />
            </button>
            <span>{title}</span>
          </div>
          <div className="topbar-actions">
            <button
              aria-label="Search assets"
              className="global-search"
              onClick={() => {
                setSearchOpen(true)
                setQuery('')
              }}
            >
              <Search size={16} />
              <span>Search assets</span>
              <kbd>⌘ K</kbd>
            </button>
            <span className={`mode-pill ${demoMode ? 'demo' : 'live'}`}>
              <span />
              {demoMode ? 'Demo mode' : config ? 'Live mode' : 'Connecting'}
            </span>
            <span className="avatar">MO</span>
          </div>
        </header>
        <main className="main-content">
          {error && <ErrorBox message={error} retry={refresh} />}
          {!overview && !error && <Loading />}
          {overview && (
            <>
              {demoMode && (
                <div className="demo-banner">
                  <span>
                    <Layers3 size={14} />
                    <strong>A workspace to explore.</strong> Prices, holdings, news, and analysis
                    start with sample data.
                  </span>
                  <button onClick={() => setSettingsOpen(true)}>
                    About demo mode
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
              {quoteErrors.length > 0 && (
                <div className="data-notice">
                  <CircleHelp size={16} />
                  <span>
                    {quoteErrors.length} price{quoteErrors.length > 1 ? 's are' : ' is'}{' '}
                    unavailable. Portfolio totals are hidden when incomplete. Open an asset for
                    details.
                  </span>
                  <button onClick={refresh} disabled={refreshing}>
                    Retry
                  </button>
                </div>
              )}
              {isAsset ? (
                <AssetPage
                  key={assetId}
                  id={assetId}
                  overview={overview}
                  onWatch={toggleWatch}
                  onHolding={openHolding}
                  watchBusy={watchBusy}
                />
              ) : route === '/portfolio' ? (
                <div className="fade-in">
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">YOUR INVESTMENTS</span>
                      <h1>Portfolio</h1>
                      <p>A clear view of what you own.</p>
                    </div>
                    <button className="button primary" onClick={() => openHolding()}>
                      <Plus size={16} />
                      Add holding
                    </button>
                  </div>
                  <div className="portfolio-metrics">
                    <div className="panel metric-large">
                      <span>Total portfolio value</span>
                      <strong>{money(portfolio!.total_value)}</strong>
                      <small>{portfolio!.holdings.length} holdings · USD</small>
                    </div>
                    <div className="panel metric-large">
                      <span>Unrealized return</span>
                      <strong
                        className={(portfolio!.total_gain ?? 0) >= 0 ? 'positive' : 'negative'}
                      >
                        {signedMoney(portfolio!.total_gain)}
                      </strong>
                      <Change value={portfolio!.total_gain_percent} />
                    </div>
                    <div className="panel metric-large">
                      <span>Total cost basis</span>
                      <strong>{money(portfolio!.cost_basis)}</strong>
                      <small>Quantity × average purchase price</small>
                    </div>
                  </div>
                  <section className="panel">
                    <div className="section-heading">
                      <h2>
                        Your holdings <span className="count">{portfolio!.holdings.length}</span>
                      </h2>
                      <button className="text-button" disabled={refreshing} onClick={refresh}>
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                        Refresh prices
                      </button>
                    </div>
                    {holdingsTable()}
                  </section>
                  <p className="footnote">
                    Returns are unrealized and exclude fees, dividends, and transactions. Stock
                    daily changes compare closing prices; crypto changes cover 24 hours.
                  </p>
                </div>
              ) : route === '/watchlist' ? (
                <div className="fade-in">
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">ON YOUR RADAR</span>
                      <h1>Watchlist</h1>
                      <p>Keep the assets that matter within reach.</p>
                    </div>
                    <button
                      className="button primary"
                      onClick={() => {
                        setSearchOpen(true)
                        setQuery('')
                      }}
                    >
                      <Plus size={16} />
                      Find an asset
                    </button>
                  </div>
                  {overview.watchlist.length ? (
                    assetCards(
                      overview.watchlist.map((id) => assetMap[id]),
                      true,
                    )
                  ) : (
                    <div className="panel empty-state">
                      <Bookmark size={32} />
                      <h3>Make this space yours.</h3>
                      <p>Save assets from research to follow their prices and stories.</p>
                      <button className="button primary" onClick={() => navigate('/research')}>
                        Explore assets
                        <ArrowRight size={15} />
                      </button>
                    </div>
                  )}
                </div>
              ) : route === '/research' ? (
                <div className="fade-in">
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">GO BEYOND THE PRICE</span>
                      <h1>Asset research</h1>
                      <p>Explore the data. Understand the narrative.</p>
                    </div>
                    <span className="badge neutral">{overview.assets.length} supported assets</span>
                  </div>
                  <div className="research-filter">
                    <div className="segmented">
                      {[
                        ['all', 'All assets'],
                        ['stock', 'Stocks'],
                        ['crypto', 'Crypto'],
                        ['etf', 'ETFs'],
                      ].map(([key, label]) => (
                        <button
                          key={key}
                          className={filter === key ? 'selected' : ''}
                          aria-pressed={filter === key}
                          onClick={() => setFilter(key)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <label className="inline-search">
                      <Search size={16} />
                      <input
                        aria-label="Filter assets"
                        placeholder="Filter by name or symbol"
                        value={assetQuery}
                        onChange={(e) => setAssetQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  {(() => {
                    const matches = overview.assets.filter(
                      (a) =>
                        (filter === 'all' || a.kind === filter) &&
                        `${a.name} ${a.symbol}`.toLowerCase().includes(assetQuery.toLowerCase()),
                    )
                    return matches.length ? (
                      assetCards(matches)
                    ) : (
                      <div className="panel empty-state">
                        <Search size={30} />
                        <h3>No matching assets.</h3>
                        <p>Try another symbol or switch the asset filter.</p>
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="fade-in">
                  <div className="page-heading">
                    <div>
                      <span className="eyebrow">THE BIG PICTURE</span>
                      <h1>Your market, in perspective.</h1>
                      <p>Stay close to your portfolio. Get closer to the story.</p>
                    </div>
                    <span className="snapshot-date">
                      <span className="status-dot" />
                      {demoMode
                        ? `Sample snapshot · ${dateLabel(config?.sample_as_of || '2026-10-16')}`
                        : 'Latest available provider data'}
                    </span>
                  </div>
                  <div className="market-strip">
                    {['SPY', 'QQQ', 'BTC', 'ETH'].map((id) => {
                      const q = overview.quotes[id],
                        a = assetMap[id]
                      return (
                        <button
                          className="market-tile"
                          key={id}
                          onClick={() => navigate(`/asset/${id}`)}
                        >
                          <div className="market-tile-label">
                            <AssetMark asset={a} small />
                            <span>
                              {id === 'SPY'
                                ? 'S&P 500 ETF'
                                : id === 'QQQ'
                                  ? 'Nasdaq 100 ETF'
                                  : a.name}
                            </span>
                            <ChevronRight size={14} />
                          </div>
                          <div className="market-tile-price">
                            <strong>{money(q?.price)}</strong>
                            <Change value={q?.change_percent} compact />
                          </div>
                        </button>
                      )
                    })}
                  </div>
                  <div className="overview-grid">
                    <section className="panel portfolio-panel">
                      <div className="section-heading">
                        <h2>Portfolio overview</h2>
                        <ArrowLink onClick={() => navigate('/portfolio')}>View portfolio</ArrowLink>
                      </div>
                      <div className="portfolio-summary">
                        <div>
                          <span className="small muted">Total value</span>
                          <div className="big-value">{money(portfolio!.total_value)}</div>
                          <div className="portfolio-return">
                            <span
                              className={
                                (portfolio!.total_gain ?? 0) >= 0 ? 'positive' : 'negative'
                              }
                            >
                              {signedMoney(portfolio!.total_gain)}
                            </span>
                            <Change value={portfolio!.total_gain_percent} compact />
                            <span className="muted small">unrealized return</span>
                          </div>
                        </div>
                        <button className="button secondary" onClick={() => openHolding()}>
                          <Plus size={15} />
                          Add holding
                        </button>
                      </div>
                      {holdingsTable(4)}
                    </section>
                    <section className="outlook-spotlight">
                      <div className="spotlight-top">
                        <span className="spotlight-icon">
                          <Sparkles size={21} />
                        </span>
                        <span>THE RESEARCH EDGE</span>
                      </div>
                      <h2>
                        Every price
                        <br />
                        has a story.
                      </h2>
                      <p>
                        Understand what’s driving an asset, with a clear narrative and evidence on
                        both sides.
                      </p>
                      <div className="spotlight-asset">
                        <AssetMark asset={assetMap.NVDA} small />
                        <div>
                          <strong>NVIDIA</strong>
                          <span>AI infrastructure · Earnings · Competition</span>
                        </div>
                      </div>
                      <button
                        className="button spotlight-button"
                        onClick={() => navigate('/asset/NVDA')}
                      >
                        Explore NVIDIA’s outlook
                        <ArrowUpRight size={17} />
                      </button>
                      <span className="spotlight-note">
                        {demoMode
                          ? 'Sample evidence. A real research workflow.'
                          : 'Grounded in recent source coverage.'}
                      </span>
                    </section>
                  </div>
                  <section className="watch-section">
                    <div className="section-heading">
                      <h2>
                        Your watchlist <span className="count">{overview.watchlist.length}</span>
                      </h2>
                      <ArrowLink onClick={() => navigate('/watchlist')}>View watchlist</ArrowLink>
                    </div>
                    {overview.watchlist.length ? (
                      <div className="watch-row">
                        {overview.watchlist.slice(0, 4).map((id) => {
                          const a = assetMap[id],
                            q = overview.quotes[id]
                          return (
                            <button
                              key={id}
                              className="watch-tile"
                              onClick={() => navigate(`/asset/${id}`)}
                            >
                              <div className="asset-cell">
                                <AssetMark asset={a} small />
                                <span>
                                  <strong>{a.symbol}</strong>
                                  <small>{a.name}</small>
                                </span>
                              </div>
                              <div className="watch-price">
                                <strong>{money(q?.price)}</strong>
                                <Change value={q?.change_percent} compact />
                              </div>
                              <Sparkline
                                points={q?.history || []}
                                positive={(q?.change_percent ?? 0) >= 0}
                              />
                            </button>
                          )
                        })}
                      </div>
                    ) : (
                      <div className="panel small-empty">
                        Your watchlist is empty.{' '}
                        <button className="text-button" onClick={() => navigate('/research')}>
                          Explore assets
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </section>
                  <section className="coverage-section">
                    <div className="section-heading">
                      <div>
                        <h2>In focus: NVIDIA</h2>
                        <p className="section-subtitle">
                          {demoMode
                            ? 'Sample coverage to explore the research experience'
                            : 'Recent coverage from the last seven days'}
                        </p>
                      </div>
                      <ArrowLink onClick={() => navigate('/asset/NVDA')}>Open research</ArrowLink>
                    </div>
                    {newsError ? (
                      <ErrorBox message={newsError} />
                    ) : (
                      <div className="coverage-grid">
                        {news.slice(0, 3).map((n) => (
                          <NewsCard key={n.id} item={n} onOpen={setNewsItem} />
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}
            </>
          )}
          <footer className="page-footer">
            <span>
              Market Outlook <span>·</span> A clearer view of your investments.
            </span>
            <span>
              {demoMode
                ? 'Sample workspace · Not live market data'
                : 'Research context, not investment recommendations'}
            </span>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <CheckCircle2 size={17} />
          {toast}
          <button aria-label="Dismiss notification" onClick={() => setToast('')}>
            <X size={15} />
          </button>
        </div>
      )}
      {searchOpen && (
        <Modal title="Find your next perspective" onClose={() => setSearchOpen(false)} wide>
          <div className="search-input">
            <Search size={20} />
            <input
              autoFocus
              aria-label="Search supported assets"
              placeholder="Search by name or symbol…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd>ESC</kbd>
          </div>
          <span className="search-caption">
            {overview?.assets.length || 16} supported stocks, ETFs & cryptocurrencies
          </span>
          <div className="search-results">
            {overview?.assets
              .filter((a) => `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()))
              .map((a) => (
                <div className="search-result" key={a.id}>
                  <button
                    onClick={() => {
                      navigate(`/asset/${a.id}`)
                      setSearchOpen(false)
                    }}
                  >
                    <AssetMark asset={a} small />
                    <span>
                      <strong>{a.symbol}</strong>
                      <small>{a.name}</small>
                    </span>
                    <span className="result-kind">{a.kind.toUpperCase()}</span>
                    <ArrowUpRight size={17} />
                  </button>
                  <button
                    className="icon-button"
                    disabled={watchBusy}
                    aria-label={`${overview.watchlist.includes(a.id) ? 'Remove' : 'Add'} ${a.symbol} ${overview.watchlist.includes(a.id) ? 'from' : 'to'} watchlist`}
                    onClick={() => toggleWatch(a.id)}
                  >
                    {overview.watchlist.includes(a.id) ? (
                      <BookmarkCheck size={17} />
                    ) : (
                      <Bookmark size={17} />
                    )}
                  </button>
                </div>
              ))}
            {overview &&
              !overview.assets.some((a) =>
                `${a.symbol} ${a.name}`.toLowerCase().includes(query.toLowerCase()),
              ) && (
                <div className="empty-state">
                  <p>No matching assets in the V1 catalog.</p>
                </div>
              )}
          </div>
        </Modal>
      )}
      {holdingModal && overview && (
        <HoldingModal
          assets={overview.assets}
          holdings={overview.portfolio.holdings}
          initialId={holdingModal.id}
          existing={holdingModal.existing}
          onClose={() => setHoldingModal(null)}
          onSave={() => {
            setHoldingModal(null)
            setToast('Holding saved')
            refresh()
          }}
        />
      )}
      {deleting && (
        <Modal
          title={`Remove ${deleting.asset_id}?`}
          onClose={() => {
            if (!deleteBusy) setDeleting(null)
          }}
        >
          <p className="modal-description">
            This removes the holding from your portfolio. It does not place a trade. You can add it
            again later.
          </p>
          <div className="modal-actions">
            <button
              className="button secondary"
              disabled={deleteBusy}
              onClick={() => setDeleting(null)}
            >
              Keep holding
            </button>
            <button className="button danger" disabled={deleteBusy} onClick={deleteHolding}>
              {deleteBusy ? 'Removing…' : 'Remove holding'}
            </button>
          </div>
        </Modal>
      )}
      {settingsOpen && (
        <Modal title="Data & workspace" onClose={() => setSettingsOpen(false)}>
          <div className="settings-mode">
            <Database size={24} />
            <div>
              <strong>{demoMode ? 'Demo workspace' : 'Live workspace'}</strong>
              <p>
                {demoMode
                  ? 'Explore every feature with sample data.'
                  : 'Using your configured market-data providers.'}
              </p>
            </div>
          </div>
          <p className="modal-description">
            {demoMode
              ? 'Prices and briefs are fictional, dated October 16, 2026. Sample analysis is curated, not generated by Gemini. Your edits are saved to PostgreSQL and stay separate from a live portfolio.'
              : 'Stock prices are end-of-day. Crypto prices are the latest available provider observations. Missing or rate-limited data is shown as unavailable.'}
          </p>
          <h3 className="settings-heading">Optional live connections</h3>
          <div className="provider-list">
            {config?.providers.map((p) => (
              <div key={p.name}>
                <span>{p.name}</span>
                <span className={p.configured ? 'positive' : 'muted'}>
                  {p.configured ? (
                    <>
                      <Check size={14} />
                      Key configured
                    </>
                  ) : (
                    'Not configured'
                  )}
                </span>
              </div>
            ))}
          </div>
          <p className="small muted settings-help">
            Live mode is configured on the backend using your own API keys. Restart the API after
            changing its configuration. Keys are never stored in this browser.
          </p>
          <div className="demo-note">
            This V1 is a single-user workspace for local use. Public hosting with live data requires
            provider display rights and an access-control decision.
          </div>
          <div className="modal-actions">
            <button className="button primary" onClick={() => setSettingsOpen(false)}>
              Got it
            </button>
          </div>
        </Modal>
      )}
      {newsItem && <NewsModal item={newsItem} onClose={() => setNewsItem(null)} />}
    </div>
  )
}
