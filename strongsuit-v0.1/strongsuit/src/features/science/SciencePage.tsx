import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { FlaskConical, Gauge } from 'lucide-react'
import { clientsRepo, checkInsRepo } from '@/db/repo'
import type { CheckIn } from '@/db/types'
import { fullName } from '@/lib/core'
import { readinessV2, MIN_BASELINE_DAYS } from '@/lib/readiness'
import { Card, SectionHeader, EmptyState, Tag, Combobox, type ComboboxOption } from '@/design'
import { readinessTrend, flagReadinessToday } from './readinessTrend'

const BAND_TONE = { go: 'verde', moderate: 'ember', easy: 'red', learning: 'neutral' } as const
const BAND_BAR = { go: 'bg-verde-600', moderate: 'bg-ember-500', easy: 'bg-signal-600', learning: 'bg-line' } as const

function TrendChart({ checkIns }: { checkIns: CheckIn[] }) {
  const trend = readinessTrend(checkIns)

  if (trend.length === 0) {
    return <p className="py-6 text-center text-xs text-faint">No check-ins logged yet.</p>
  }

  return (
    <div>
      {/* The shaded band and its line reuse the confidence tokens from the
          Phase 1 design import (index.css) — unused until now. The engine
          anchors 0 SD (a normal day) at score 70 (lib/readiness.ts), so the
          band marks roughly ±0.75 SD of that anchor and the line marks the
          anchor itself, both derived from the engine's own documented scale
          rather than invented. */}
      <div className="relative h-32">
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ bottom: '55%', height: '30%', background: 'var(--confidence-band-fill)' }}
        />
        <div
          className="pointer-events-none absolute inset-x-0"
          style={{ bottom: '70%', borderTop: '1px solid var(--confidence-band-line)' }}
        />
        <div className="relative flex h-full items-end gap-1">
          {trend.map(p => (
            <div key={p.date} className="group relative flex-1">
              <div
                className={`w-full rounded-t-sm transition-all ${BAND_BAR[p.band]}`}
                style={{ height: p.score == null ? '4px' : `${p.score}%`, minHeight: '4px' }}
              />
              <div className="pointer-events-none absolute bottom-full start-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-[#171A1E] px-2 py-1 text-xs text-white opacity-0 group-hover:opacity-100">
                {p.date}: {p.score == null ? 'learning' : `${p.score}`}
              </div>
            </div>
          ))}
        </div>
      </div>
      <p className="mt-2 text-2xs text-faint">
        Shaded band = this client's normal range (0 SD ± 0.75, anchored at 70 per the readiness model). Grey bars mean not enough history yet.
      </p>
    </div>
  )
}

function DomainBreakdown({ checkIns }: { checkIns: CheckIn[] }) {
  const r = readinessV2({ checkIns })

  if (r.score === null) {
    return (
      <p className="text-xs text-muted">
        {r.recommendation} Needs {MIN_BASELINE_DAYS} check-ins before readiness means anything — {r.historyDays} so far.
      </p>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <Tag tone={BAND_TONE[r.band]}>{r.band}</Tag>
        <span className="font-mono tabular-nums text-xl font-semibold text-ink">{r.score}</span>
      </div>
      <p className="mt-2 text-xs text-ink">{r.recommendation}</p>
      <div className="mt-3 space-y-1">
        {r.domains.map(d => (
          <div key={d.domain} className="flex items-center justify-between text-2xs">
            <span className="capitalize text-muted">{d.domain}</span>
            <span className={`font-mono tabular-nums ${d.z <= -1 ? 'text-ember-600' : 'text-faint'}`}>
              {d.z > 0 ? '+' : ''}{d.z} SD
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-2xs text-faint">Compared to their own {r.historyDays}-day normal · {r.source}</p>
    </div>
  )
}

export default function SciencePage() {
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const allCheckIns = useLiveQuery(() => checkInsRepo.all(), [], [])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const checkInsByClient = useMemo(() => {
    const m = new Map<string, CheckIn[]>()
    for (const c of allCheckIns) {
      const arr = m.get(c.clientId) ?? []
      arr.push(c)
      m.set(c.clientId, arr)
    }
    return m
  }, [allCheckIns])

  const flags = useMemo(() => flagReadinessToday(clients, checkInsByClient), [clients, checkInsByClient])
  const clientMap = new Map(clients.map(c => [c.id, c]))
  const effectiveId = selectedId && clientMap.has(selectedId) ? selectedId : (clients[0]?.id ?? null)
  const selected = effectiveId ? clientMap.get(effectiveId) : undefined
  const selectedCheckIns = effectiveId ? (checkInsByClient.get(effectiveId) ?? []) : []

  const switcherOptions: ComboboxOption[] = clients
    .slice()
    .sort((a, b) => a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName))
    .map(c => ({ value: c.id, label: fullName(c) }))

  return (
    <div className="space-y-6">
      <SectionHeader title="Science" />

      {clients.length === 0 ? (
        <EmptyState
          icon={<FlaskConical size={28} strokeWidth={1.25} />}
          title="Nothing to read yet"
          body="Once clients are logging check-ins, their readiness — scored against their own normal — shows up here."
        />
      ) : (
        <>
          <div>
            <p className="mb-2 text-sm font-semibold text-muted">Needs attention today</p>
            {flags.length === 0 ? (
              <Card className="text-sm text-muted">Everyone's reading at or above their own normal today.</Card>
            ) : (
              <div className="space-y-2">
                {flags.map(f => {
                  const c = clientMap.get(f.clientId)
                  if (!c) return null
                  return (
                    <Link key={f.clientId} to={`/clients/${c.id}`} className="block">
                      <Card className="flex items-center justify-between transition-colors hover:border-verde-600/40">
                        <span className="text-sm font-medium">{fullName(c)}</span>
                        <Tag tone={BAND_TONE[f.band]}>{f.recommendation}</Tag>
                      </Card>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-muted">Readiness trend</p>
              {switcherOptions.length > 1 && selected && (
                <div className="w-48">
                  <Combobox
                    options={switcherOptions}
                    value={{ value: selected.id, label: fullName(selected) }}
                    onChange={o => setSelectedId(o.value)}
                    placeholder="Switch client…"
                  />
                </div>
              )}
            </div>
            {selected && (
              <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
                <Card>
                  <TrendChart checkIns={selectedCheckIns} />
                </Card>
                <Card>
                  <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-faint">
                    <Gauge size={14} /> Today
                  </div>
                  <DomainBreakdown checkIns={selectedCheckIns} />
                </Card>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
