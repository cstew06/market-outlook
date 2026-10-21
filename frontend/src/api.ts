export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    signal: options.signal ?? AbortSignal.timeout(120000),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => null)
    if (Array.isArray(body?.detail))
      throw new Error(
        'Please check the entered values. Quantity must be positive and cost cannot be negative (up to 10 decimal places).',
      )
    throw new Error(
      typeof body?.detail === 'string'
        ? body.detail
        : 'The request could not be completed. Please try again.',
    )
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
export const money = (n: number | null | undefined, digits = 2) =>
  n == null
    ? '—'
    : new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      }).format(n)
export const percent = (n: number | null | undefined) =>
  n == null ? '—' : `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
export const signedMoney = (n: number | null) =>
  n == null ? '—' : `${n >= 0 ? '+' : '−'}${money(Math.abs(n))}`
export const dateLabel = (value: string) =>
  new Date(value.length === 10 ? `${value}T12:00:00Z` : value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
export const navigate = (path: string) => {
  window.location.hash = path
}
