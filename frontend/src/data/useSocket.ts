import { useEffect } from 'react'
import { connectSocket } from './socket'
import { useSim } from './store'

/** Mount exactly once (App.tsx). Every page reads from the store. */
export function useSocket() {
  const setLink = useSim((s) => s.setLink)
  const ingest = useSim((s) => s.ingest)
  useEffect(() => {
    setLink('connecting')
    return connectSocket({
      onOpen: () => setLink('open'),
      onMessage: ingest,
      onClose: () => setLink('closed'),
    })
  }, [setLink, ingest])
}
