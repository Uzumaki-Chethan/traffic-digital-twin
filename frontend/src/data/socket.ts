import type { Snapshot } from './types'

interface Handlers {
  onOpen: () => void
  onMessage: (s: Snapshot) => void
  onClose: () => void
}

/**
 * The one WebSocket connection for the whole app. Reconnects with a
 * capped exponential backoff; the store keeps the last live snapshot
 * through a drop so the page dims rather than blanks.
 */
export function connectSocket(h: Handlers): () => void {
  let ws: WebSocket | null = null
  let timer: number | null = null
  let attempt = 0
  let stopped = false

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`

  function open() {
    if (stopped) return
    const sock = new WebSocket(url)
    ws = sock
    sock.addEventListener('open', () => {
      attempt = 0
      h.onOpen()
    })
    sock.addEventListener('message', (ev) => {
      try {
        h.onMessage(JSON.parse(ev.data) as Snapshot)
      } catch {
        // malformed frame — ignore, the next tick replaces it
      }
    })
    sock.addEventListener('close', () => {
      h.onClose()
      if (stopped) return
      const delay = Math.min(8000, 500 * 2 ** attempt++)
      timer = window.setTimeout(open, delay)
    })
    sock.addEventListener('error', () => sock.close())
  }

  open()
  return () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    ws?.close()
  }
}
