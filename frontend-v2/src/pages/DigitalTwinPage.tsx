import { Car, Gauge, Hourglass, OctagonPause } from 'lucide-react'
import { useSimStore } from '@/store/useSimStore'
import { isLive, isWaiting } from '@/types/snapshot'
import { Panel } from '@/components/common/Panel'
import { StatCard } from '@/components/common/StatCard'
import { WaitingState } from '@/components/common/WaitingState'
import { IntersectionDiagram } from '@/components/traffic/IntersectionDiagram'
import { PhaseRing } from '@/components/traffic/PhaseRing'
import { PhaseTimeline } from '@/components/traffic/PhaseTimeline'
import { LaneDensityGrid } from '@/components/traffic/LaneDensityGrid'
import { DecisionPanel } from '@/components/traffic/DecisionPanel'
import { PredictionPanel } from '@/components/traffic/PredictionPanel'
import { ModelInfoPanel } from '@/components/traffic/ModelInfoPanel'
import { EmergencyBanner } from '@/components/traffic/EmergencyBanner'
import { fmt1, fmt0 } from '@/utils/format'

export function DigitalTwinPage() {
  const latest = useSimStore((s) => s.latest)

  if (latest === null || isWaiting(latest)) {
    return <WaitingState />
  }
  if (!isLive(latest)) return null

  const { metrics, lanes, signal, decision, emergency_lanes, prediction, phase_history } = latest

  return (
    <div className="space-y-6">
      <EmergencyBanner lanes={emergency_lanes} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Vehicles" value={fmt0(metrics.vehicles)} icon={Car} accent="var(--color-neutral)" />
        <StatCard label="Avg Speed" value={fmt1(metrics.avg_speed)} unit="m/s" icon={Gauge} accent="var(--color-flow)" />
        <StatCard label="Avg Wait" value={fmt1(metrics.avg_wait)} unit="s" icon={Hourglass} accent="var(--color-transition)" />
        <StatCard label="Stopped" value={fmt0(metrics.stopped)} icon={OctagonPause} accent="var(--color-warn)" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel title="Live Intersection" eyebrow="Junction C · Digital Twin" className="xl:col-span-2">
          <div className="aspect-square max-h-[440px] w-full">
            <IntersectionDiagram lanes={lanes} />
          </div>
        </Panel>

        <div className="space-y-4">
          <Panel title="Current Phase">
            <PhaseRing
              phase={signal?.phase}
              mode={decision.mode}
              elapsedSeconds={decision.duration}
              isYellow={signal?.is_yellow ?? false}
            />
          </Panel>
          <Panel title="Decision Engine">
            <DecisionPanel decision={decision} />
          </Panel>
        </div>
      </div>

      <Panel title="Lane Density" eyebrow="Live vehicle count per lane">
        <LaneDensityGrid lanes={lanes} />
      </Panel>

      <Panel title="Phase Timeline" eyebrow="Last ~60 seconds">
        <PhaseTimeline history={phase_history} />
      </Panel>

      <Panel title="Prediction vs Actual" eyebrow="Random Forest · 15s horizon">
        <PredictionPanel prediction={prediction} />
      </Panel>

      <ModelInfoPanel />
    </div>
  )
}
