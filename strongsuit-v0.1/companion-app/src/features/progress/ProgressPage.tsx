import { useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button, Card, EmptyState, Input, Label, PageHeader, Sparkline } from '@/design'
import { metricsRepo } from '@/db/repo'
import { fmtLoad, today } from '@/lib/core'
import type { MetricType, PersonalMetric, Units } from '@/db/types'

const METRIC_LABELS: Record<MetricType, string> = {
  bodyweight: 'Bodyweight',
  waist: 'Waist',
  chest: 'Chest',
  hips: 'Hips',
  bodyfat: 'Body fat %',
}

export function ProgressPage({ units }: { units: Units }) {
  const [metrics, setMetrics] = useState<PersonalMetric[]>([])
  const [type, setType] = useState<MetricType>('bodyweight')
  const [value, setValue] = useState('')
  const [date, setDate] = useState(today())

  const refresh = () => { metricsRepo.all().then(setMetrics) }
  useEffect(() => { refresh() }, [])

  async function add() {
    const v = Number(value)
    if (!v) return
    await metricsRepo.create({ type, value: v, date })
    setValue('')
    refresh()
  }

  const selected = metrics.filter(m => m.type === type)

  return (
    <div className="space-y-4">
      <PageHeader eyebrow="Trends" title="Progress" />

      <Card>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">Log a measurement</p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Type</Label>
            <select value={type} onChange={e => setType(e.target.value as MetricType)} className="w-full rounded-ctl border border-line bg-surface px-3 py-2 text-sm text-ink">
              {Object.entries(METRIC_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </div>
          <div>
            <Label>Value ({type === 'bodyfat' ? '%' : units})</Label>
            <Input type="number" value={value} onChange={e => setValue(e.target.value)} placeholder="0" />
          </div>
        </div>
        <div className="mt-2">
          <Label>Date</Label>
          <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
        </div>
        <Button variant="primary" onClick={add} disabled={!value} className="mt-3 w-full"><Plus size={14} /> Log it</Button>
      </Card>

      {selected.length >= 2 && (
        <Card>
          <div className="mb-1 flex items-baseline justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">{METRIC_LABELS[type]} trend</p>
            <p className="font-mono tnum text-sm font-semibold text-ink">
              {type === 'bodyfat' ? `${selected[0].value}%` : fmtLoad(selected[0].value, units)}
            </p>
          </div>
          <Sparkline points={selected.map(m => ({ date: m.date, value: m.value }))} />
        </Card>
      )}

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">History</p>
        {metrics.length === 0 ? (
          <EmptyState title="Nothing tracked yet" body="Bodyweight and body measurements you log will show up here." />
        ) : (
          <div className="space-y-2">
            {selected.map(m => (
              <Card key={m.id} className="flex items-center justify-between py-2.5">
                <span className="text-sm text-ink">{METRIC_LABELS[m.type]}</span>
                <span className="font-mono tnum text-sm text-muted">
                  {m.type === 'bodyfat' ? `${m.value}%` : fmtLoad(m.value, units)} · {m.date}
                </span>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
