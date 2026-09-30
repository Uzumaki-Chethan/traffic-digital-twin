import { MonitorPlay, Scale } from 'lucide-react'
import type { Target } from '@/data/settings'
import { GlassSelect, type GlassOption } from '@/ui/GlassSelect'

const OPTIONS: GlassOption<Target>[] = [
  { value: 'overview', label: 'Overview · demo', hint: 'One controller, Trinetra, watched live', icon: MonitorPlay },
  { value: 'performance', label: 'Performance · Trinetra vs VAC', hint: 'The same scenario twice, side by side, scored', icon: Scale },
]

/** "Choose for": which page the next card click picks a scenario for. */
export function TargetPicker({ value, onChange }: { value: Target; onChange: (t: Target) => void }) {
  return <GlassSelect label="Choose for" value={value} options={OPTIONS} onChange={onChange} />
}
