import type { Snapshot } from '@/types/snapshot'

/**
 * Resolve the dashboard's WebSocket URL. In dev, Vite's proxy (see
 * vite.config.ts) forwards /ws to the FastAPI server, so a same-origin
 * relative URL works in both dev and a production static build served
 * behind any reverse proxy that also forwards /ws.
 */
function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws`
}

export interface SocketHandlers {
  onOpen?: () => void
  onMessage: (snapshot: Snapshot) => void
  onClose?: () => void
  onError?: () => void
}

const BASE_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 8000

/**
 * Connects to the dashboard WebSocket and reconnects automatically with
 * exponential backoff if the connection drops - e.g. the simulation
 * process was restarted for a new scenario. Returns a teardown function.
 */
export function connectDashboardSocket(handlers: SocketHandlers): () => void {
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let attempt = 0
  let torn_down = false

  function scheduleReconnect() {
    if (torn_down) return
    const delay = Math.min(
      BASE_RECONNECT_DELAY_MS * 2 ** attempt,
      MAX_RECONNECT_DELAY_MS,
    )
    attempt += 1
    reconnectTimer = setTimeout(connect, delay)
  }

  function connect() {
    if (torn_down) return
    socket = new WebSocket(wsUrl())

    socket.onopen = () => {
      attempt = 0
      handlers.onOpen?.()
    }
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as Snapshot
        handlers.onMessage(data)
      } catch {
        // Malformed frame - ignore this tick rather than tearing down
        // the whole connection over one bad payload.
      }
    }
    socket.onclose = () => {
      handlers.onClose?.()
      scheduleReconnect()
    }
    socket.onerror = () => {
      handlers.onError?.()
      socket?.close()
    }
  }

  connect()

  return () => {
    torn_down = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
  }
}
