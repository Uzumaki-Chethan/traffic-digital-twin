import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { CATALOGUE, EMPTY_FACTS } from '../catalogue'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = path.join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

describe('explanation catalogue', () => {
  const src = walk(path.resolve(__dirname, '../..'))
  const ids = new Set<string>()
  for (const f of src) {
    const t = readFileSync(f, 'utf8')
    for (const m of t.matchAll(/(?:data-explain|explain)=["']([a-z0-9:/_-]+)["']/g)) ids.add(m[1])
  }

  it('every explain id used in the source has an entry', () => {
    expect([...ids].filter((id) => !CATALOGUE[id])).toEqual([])
    expect(ids.size).toBeGreaterThan(30)
  })

  it('covers every page and every metric block', () => {
    for (const r of ['/', '/analytics', '/performance', '/decisions', '/settings']) expect(CATALOGUE[`page:${r}`]).toBeDefined()
    for (const k of ['avg_waiting_time_seconds', 'avg_travel_time_seconds', 'max_travel_time_seconds', 'avg_queue_length_vehicles', 'max_queue_length_vehicles', 'avg_speed_mps', 'throughput_vehicles']) {
      expect(CATALOGUE[`pf-metric-${k}`]).toBeDefined()
    }
  })

  it('speaks plainly: no raw phase ids, no confidence, every entry has 1–5 steps', () => {
    for (const [id, e] of Object.entries(CATALOGUE)) {
      const text = [e.title, ...e.steps].join(' ')
      expect(text, id).not.toMatch(/\b(NS|EW)_|confidence/i)
      expect(e.steps.length, id).toBeGreaterThanOrEqual(1)
      expect(e.steps.length, id).toBeLessThanOrEqual(5)
    }
  })

  it('live lines are silent when nothing runs', () => {
    for (const e of Object.values(CATALOGUE)) expect(e.live?.(EMPTY_FACTS) ?? null).toBeNull()
  })
})
