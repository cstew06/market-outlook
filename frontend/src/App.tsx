import { useState } from 'react'

type ConnectionStatus = 'idle' | 'checking' | 'connected' | 'error'

const messages: Record<ConnectionStatus, string> = {
  idle: 'Ready to check the backend connection.',
  checking: 'Checking connection…',
  connected: 'Backend connected.',
  error: 'Connection check failed. Make sure FastAPI is running on port 8000, then try again.',
}

export default function App() {
  const [status, setStatus] = useState<ConnectionStatus>('idle')

  async function checkConnection() {
    setStatus('checking')

    try {
      const response = await fetch('/health', {
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      })

      if (!response.ok) {
        throw new Error(`Health check returned HTTP ${response.status}`)
      }

      // TypeScript cannot guarantee what a server sends; check the actual data.
      const data: unknown = await response.json()
      if (
        typeof data !== 'object' ||
        data === null ||
        !('status' in data) ||
        data.status !== 'ok'
      ) {
        throw new Error('Unexpected health response')
      }

      setStatus('connected')
    } catch {
      setStatus('error')
    }
  }

  return (
    <main>
      <h1>Market Outlook</h1>
      <p>First milestone: connect the frontend to the backend.</p>
      <button onClick={checkConnection} disabled={status === 'checking'}>
        {status === 'checking' ? 'Checking…' : 'Check connection'}
      </button>
      <p role="status">{messages[status]}</p>
    </main>
  )
}
