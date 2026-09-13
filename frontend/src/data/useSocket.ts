import { useEffect } from 'react'
import { connectSocket } from './socket'
import { useSim } from './store'
import { pushLiveSample } from './liveHistory'

/** Mount exactly once (App.tsx). Every page reads from the store. */
export function useSocket() {
  const setLink = useSim((s) => s.setLink)
  const ingest = useSim((s) => s.ingest)
  useEffect(() => {
    setLink('connecting')
    return connectSocket({
      onOpen: () => setLink('open'),
      onMessage: (snapshot) => {
        ingest(snapshot)
        // Analytics reads the run that is happening now, so every tick
        // has to be remembered as it goes past — the snapshot itself
        // carries only the current instant. See data/liveHistory.ts.
        pushLiveSample(snapshot)
      },
      onClose: () => setLink('closed'),
    })
  }, [setLink, ingest])
}
