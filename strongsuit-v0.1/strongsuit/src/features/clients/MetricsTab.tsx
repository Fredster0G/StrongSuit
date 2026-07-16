import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { metricsRepo } from '@/db/repo'
import { Card, SectionHeader, Button, Field, Input, Select, toast } from '@/design'
import { today } from '@/lib/core'
import type { MetricType } from '@/db/types'

export default function MetricsTab({ clientId, units }: { clientId: string; units: 'kg' | 'lb' }) {
  const metrics = useLiveQuery(() => metricsRepo.forClient(clientId), [clientId])
  const [form, setForm] = useState({ date: today(), type: 'bodyweight' as MetricType, value: '', key: '' })

  const bwMetrics = metrics?.filter(m => m.type === 'bodyweight') || []
  
  async function save() {
    const val = parseFloat(form.value)
    if (isNaN(val)) return
    
    let key = form.type === 'custom' ? form.key : form.type
    if (form.type === 'measurement') key = form.key || 'measurement'

    await metricsRepo.create({
      clientId,
      date: form.date,
      type: form.type,
      key,
      value: val,
      unit: form.type === 'bodyweight' ? units : (form.type === 'bodyfat' ? '%' : '')
    })
    setForm(f => ({ ...f, value: '', key: '' }))
    toast('Metric saved.')
  }

  // Find min/max for bodyweight chart to scale properly
  const bwValues = bwMetrics.map(m => m.value)
  const minBw = bwValues.length > 0 ? Math.min(...bwValues) * 0.98 : 0
  const maxBw = bwValues.length > 0 ? Math.max(...bwValues) * 1.02 : 100
  const range = maxBw - minBw || 1

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-1 space-y-4">
          <Card>
            <h3 className="font-semibold mb-3">Log Measurement</h3>
            <div className="space-y-3">
              <Field label="Date"><Input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} /></Field>
              <Field label="Type">
                <Select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as MetricType}))}>
                  <option value="bodyweight">Bodyweight</option>
                  <option value="bodyfat">Body fat %</option>
                  <option value="measurement">Circumference</option>
                  <option value="custom">Custom</option>
                </Select>
              </Field>
              {(form.type === 'measurement' || form.type === 'custom') && (
                <Field label="Name (e.g. Waist)"><Input value={form.key} onChange={e => setForm(f => ({...f, key: e.target.value}))} /></Field>
              )}
              <Field label={`Value ${form.type === 'bodyweight' ? `(${units})` : ''}`}>
                <Input type="number" step="0.1" inputMode="decimal" value={form.value} onChange={e => setForm(f => ({...f, value: e.target.value}))} />
              </Field>
              <Button variant="primary" className="w-full" onClick={save} disabled={!form.value}>Save</Button>
            </div>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <SectionHeader title="Bodyweight Trend" />
            {bwMetrics.length < 2 ? (
              <div className="py-8 text-center text-sm text-faint">Log at least two bodyweight measurements to see the trend.</div>
            ) : (
              <div className="h-48 w-full relative mt-4">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-brand-500"
                    vectorEffect="non-scaling-stroke"
                    points={bwMetrics.map((m, i) => {
                      const x = (i / (bwMetrics.length - 1)) * 100
                      const y = 100 - (((m.value - minBw) / range) * 100)
                      return `${x},${y}`
                    }).join(' ')}
                  />
                  {bwMetrics.map((m, i) => {
                    const x = (i / (bwMetrics.length - 1)) * 100
                    const y = 100 - (((m.value - minBw) / range) * 100)
                    return (
                      <circle key={m.id} cx={x} cy={y} r="3" fill="currentColor" className="text-brand-500" vectorEffect="non-scaling-stroke">
                        <title>{m.date}: {m.value} {units}</title>
                      </circle>
                    )
                  })}
                </svg>
              </div>
            )}
          </Card>

          {metrics && metrics.length > 0 && (
            <Card>
              <SectionHeader title="History" />
              <div className="divide-y divide-line -mx-4 -mb-4">
                {metrics.slice().reverse().map(m => (
                  <div key={m.id} className="flex justify-between items-center px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono tnum text-faint text-xs w-24">{m.date}</span>
                      <span className="capitalize font-medium">{m.key === 'bodyweight' ? 'Bodyweight' : m.key === 'bodyfat' ? 'Body fat' : m.key}</span>
                    </div>
                    <div className="font-mono tnum font-semibold">
                      {m.value} {m.unit}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}
