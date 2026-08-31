import { useEffect } from 'react'
import { connectDashboardSocket } from '@/services/socket'
import { useSimStore } from '@/store/useSimStore'

/**
 * Owns the single WebSocket connection for the whole app. Mount this
 * exactly once (in App.tsx) - every page reads from useSimStore instead
 * of opening its own socket.
 */
export function useDashboardSocket() {
  const setStatus = useSimStore((s) => s.setStatus)
  const ingest = useSimStore((s) => s.ingest)

  useEffect(() => {
    setStatus('connecting')
    const teardown = connectDashboardSocket({
      onOpen: () => setStatus('open'),
      onMessage: (snapshot) => ingest(snapshot),
      onClose: () => setStatus('closed'),
      onError: () => setStatus('error'),
    })
    return teardown
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
