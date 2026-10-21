export type Asset = {
  id: string
  symbol: string
  name: string
  kind: 'stock' | 'crypto' | 'etf'
  exchange: string
  sector: string
  color: string
  currency: string
}
export type Point = { time: string; value: number }
export type Quote = Asset & {
  price: number
  change: number | null
  change_percent: number | null
  as_of: string
  price_label: string
  provider: string
  history: Point[]
}
export type Holding = {
  asset_id: string
  quantity: string
  average_cost: string
  cost_basis: number
  value: number | null
  gain: number | null
  gain_percent: number | null
}
export type Portfolio = {
  holdings: Holding[]
  total_value: number | null
  cost_basis: number
  total_gain: number | null
  total_gain_percent: number | null
  day_change: number | null
  complete: boolean
}
export type Overview = {
  mode: 'demo' | 'live'
  assets: Asset[]
  watchlist: string[]
  quotes: Record<string, Quote>
  quote_errors: Record<string, string>
  portfolio: Portfolio
}
export type News = {
  id: string
  asset_id: string
  title: string
  summary: string
  source: string
  url: string | null
  topic: string
  published_at: string
  is_sample: boolean
}
export type Detail = {
  asset: Asset
  quote: Quote | null
  history: Point[]
  news: News[]
  errors: Record<string, string>
}
export type Claim = { text: string; source_ids: string[] }
export type Outlook = {
  summary: Claim
  narrative: Claim
  bull_case: Claim[]
  bear_case: Claim[]
  sources: News[]
  generated_at: string
  sample_as_of: string | null
  is_sample: boolean
  model: string
  cached: boolean
  stale: boolean
}
export type Configuration = {
  mode: 'demo' | 'live'
  news_provider: 'massive' | 'alpha_vantage'
  sample_as_of: string | null
  providers: { name: string; configured: boolean }[]
  outlook_ttl_hours: number
  gemini_model: string
}
