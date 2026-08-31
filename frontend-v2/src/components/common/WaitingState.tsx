import { Radar } from 'lucide-react'

export function WaitingState({ detail }: { detail?: string }) {
  return (
    <div className="flex h-full min-h-[50vh] flex-col items-center justify-center gap-3 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-panel-raised)]">
        <Radar size={24} className="text-[var(--color-text-faint)] animate-pulse" />
      </div>
      <div className="text-sm font-medium text-[var(--color-text-dim)]">Waiting for simulation</div>
      <div className="max-w-sm text-xs text-[var(--color-text-faint)]">
        {detail ??
          'No snapshot has been published yet. Start the backend with python app.py (from backend/) to begin streaming live state.'}
      </div>
    </div>
  )
}
