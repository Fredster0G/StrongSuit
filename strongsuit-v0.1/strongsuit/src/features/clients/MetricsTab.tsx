import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Camera, Trash2 } from 'lucide-react'
import { metricsRepo, progressPhotosRepo } from '@/db/repo'
import { Card, SectionHeader, Button, Field, Input, Select, Dialog, Textarea, toast, toastError } from '@/design'
import { today } from '@/lib/core'
import { resizeImageToDataUrl } from '@/lib/media'
import { presetsForGoal, type MetricPresetItem } from '@/lib/metricPresets'
import type { MetricType, TrainingGoal } from '@/db/types'
import { useTranslation } from '@/lib/i18n'

function ProgressPhotosCard({ clientId }: { clientId: string }) {
  const photos = useLiveQuery(() => progressPhotosRepo.forClient(clientId), [clientId], [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [viewing, setViewing] = useState<(typeof photos)[number] | null>(null)
  const [noteDraft, setNoteDraft] = useState('')
  const [comparing, setComparing] = useState(false)
  const { t } = useTranslation()

  async function onFile(file: File) {
    try {
      const dataUrl = await resizeImageToDataUrl(file)
      await progressPhotosRepo.create({ clientId, date: today(), dataUrl })
      toast(t('clients.toast.photoAdded'))
    } catch (e) {
      toastError(e instanceof Error ? e.message : t('clients.toast.photoError'))
    }
  }

  async function saveNote() {
    if (!viewing) return
    await progressPhotosRepo.update(viewing.id, { note: noteDraft.trim() || undefined })
    toast(t('clients.toast.noteSaved'))
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink"><Camera size={16} className="text-verde-600" /> {t('clients.metrics.photosTitle')}</div>
        <div className="flex items-center gap-2">
          {photos.length >= 2 && <Button size="sm" variant="secondary" onClick={() => setComparing(true)}>{t('clients.metrics.compareFirstLatest')}</Button>}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
          <Button size="sm" onClick={() => fileRef.current?.click()}>{t('clients.metrics.addPhoto')}</Button>
        </div>
      </div>
      {photos.length === 0 ? (
        <p className="text-xs text-muted">{t('clients.metrics.photosEmptyBody')}</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {photos.slice().reverse().map(p => (
            <button key={p.id} onClick={() => { setViewing(p); setNoteDraft(p.note ?? '') }} className="group relative overflow-hidden rounded-ctl border border-line">
              <img src={p.dataUrl} alt={p.date} className="aspect-square w-full object-cover" />
              <span className="absolute inset-x-0 bottom-0 bg-iron-950/70 px-1 py-0.5 text-center font-mono text-2xs text-white">{p.date}</span>
            </button>
          ))}
        </div>
      )}

      <Dialog
        open={!!viewing}
        onClose={() => setViewing(null)}
        title={viewing?.date ?? t('clients.metrics.photoDialogTitle')}
        width={420}
      >
        {viewing && (
          <div className="space-y-3">
            <img src={viewing.dataUrl} alt={viewing.date} className="max-h-[60vh] w-full rounded-card object-contain" />
            <Field label={t('clients.metrics.noteLabel')} hint={t('clients.metrics.noteHint')}>
              <Textarea value={noteDraft} onChange={e => setNoteDraft(e.target.value)} onBlur={saveNote} placeholder={t('clients.metrics.notePlaceholder')} />
            </Field>
            <div className="flex justify-end">
              <Button size="sm" variant="ghost" className="text-ember-600" onClick={async () => { await progressPhotosRepo.remove(viewing.id); setViewing(null); toast(t('clients.toast.photoDeleted')) }}>
                <Trash2 size={14} /> {t('clients.metrics.deleteBtn')}
              </Button>
            </div>
          </div>
        )}
      </Dialog>

      <Dialog open={comparing} onClose={() => setComparing(false)} title={t('clients.metrics.compareDialogTitle')} width={560}>
        {photos.length >= 2 && (
          <div className="grid grid-cols-2 gap-3">
            {[photos[0], photos.at(-1)!].map((p, i) => (
              <div key={p.id}>
                <img src={p.dataUrl} alt={p.date} className="aspect-[3/4] w-full rounded-card border border-line object-cover" />
                <p className="mt-1 text-center font-mono tabular-nums text-2xs text-faint">{i === 0 ? t('clients.metrics.first') : t('clients.metrics.latest')}{p.date}</p>
              </div>
            ))}
          </div>
        )}
      </Dialog>
    </Card>
  )
}

export default function MetricsTab({ clientId, units, trainingGoal }: { clientId: string; units: 'kg' | 'lb'; trainingGoal?: TrainingGoal }) {
  const metrics = useLiveQuery(() => metricsRepo.forClient(clientId), [clientId])
  const [form, setForm] = useState({ date: today(), type: 'bodyweight' as MetricType, value: '', key: '', unit: '' })
  const { t } = useTranslation()

  const bwMetrics = metrics?.filter(m => m.type === 'bodyweight') || []
  const presets = presetsForGoal(trainingGoal)

  function applyPreset(item: MetricPresetItem) {
    setForm(f => ({ ...f, type: item.type, key: item.key, unit: item.unit }))
  }

  async function save() {
    const val = parseFloat(form.value)
    if (isNaN(val)) return

    let key = form.type === 'custom' || form.key ? form.key : form.type
    if (form.type === 'measurement' && !key) key = 'measurement'
    const unit = form.unit || (form.type === 'bodyweight' ? units : (form.type === 'bodyfat' ? '%' : ''))

    await metricsRepo.create({ clientId, date: form.date, type: form.type, key, value: val, unit })
    setForm(f => ({ ...f, value: '', key: '', unit: '' }))
    toast(t('clients.toast.metricSaved'))
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
            <h3 className="font-semibold mb-3">{t('clients.metrics.logMeasurement')}</h3>
            {presets.length > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 text-2xs font-medium uppercase tracking-wide text-faint">{t('clients.metrics.suggestedForGoal')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {presets.flatMap(p => p.items).map(item => (
                    <button
                      key={item.key} onClick={() => applyPreset(item)}
                      title={`${item.why} (${item.source})`}
                      className={`rounded-full border px-2.5 py-1 text-2xs font-medium transition-colors ${form.key === item.key ? 'border-transparent bg-verde-600 text-white' : 'border-line text-muted hover:bg-surface2'}`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-3">
              <Field label={t('clients.checkins.dateLabel').replace(' *', '')}><Input type="date" value={form.date} onChange={e => setForm(f => ({...f, date: e.target.value}))} /></Field>
              <Field label={t('clients.metrics.typeLabel')}>
                <Select value={form.type} onChange={e => setForm(f => ({...f, type: e.target.value as MetricType, key: '', unit: ''}))}>
                  <option value="bodyweight">{t('clients.metrics.typeBodyweight')}</option>
                  <option value="bodyfat">{t('clients.metrics.typeBodyfat')}</option>
                  <option value="measurement">{t('clients.metrics.typeMeasurement')}</option>
                  <option value="performance">{t('clients.metrics.typePerformance')}</option>
                  <option value="recovery">{t('clients.metrics.typeRecovery')}</option>
                  <option value="strength-test">{t('clients.metrics.typeStrength')}</option>
                  <option value="custom">{t('clients.metrics.typeCustom')}</option>
                </Select>
              </Field>
              {form.type !== 'bodyweight' && form.type !== 'bodyfat' && (
                <Field label={t('clients.metrics.nameLabel')}><Input value={form.key} onChange={e => setForm(f => ({...f, key: e.target.value}))} /></Field>
              )}
              <Field label={t('clients.metrics.valueLabel', { unit: form.unit ? `(${form.unit})` : form.type === 'bodyweight' ? `(${units})` : '' })}>
                <Input type="number" step="0.1" inputMode="decimal" value={form.value} onChange={e => setForm(f => ({...f, value: e.target.value}))} />
              </Field>
              <Button variant="primary" className="w-full" onClick={save} disabled={!form.value}>{t('clients.metrics.saveBtn')}</Button>
            </div>
          </Card>
        </div>

        <div className="md:col-span-2 space-y-6">
          <Card>
            <SectionHeader title={t('clients.metrics.trendTitle')} />
            {bwMetrics.length < 2 ? (
              <div className="py-8 text-center text-sm text-faint">{t('clients.metrics.trendEmpty')}</div>
            ) : (
              <div className="h-48 w-full relative mt-4">
                <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full overflow-visible">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="text-verde-600"
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
                      <circle key={m.id} cx={x} cy={y} r="3" fill="currentColor" className="text-verde-600" vectorEffect="non-scaling-stroke">
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
              <SectionHeader title={t('clients.metrics.historyTitle')} />
              <div className="divide-y divide-line -mx-4 -mb-4">
                {metrics.slice().reverse().map(m => (
                  <div key={m.id} className="flex justify-between items-center px-4 py-3 text-sm">
                    <div className="flex items-center gap-3">
                      <span className="font-mono tabular-nums text-faint text-xs w-24">{m.date}</span>
                      <span className="capitalize font-medium">{m.key === 'bodyweight' ? t('clients.metrics.typeBodyweight') : m.key === 'bodyfat' ? t('clients.metrics.typeBodyfat') : m.key}</span>
                    </div>
                    <div className="font-mono tabular-nums font-semibold">
                      {m.value} {m.unit}
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}

          <ProgressPhotosCard clientId={clientId} />
        </div>
      </div>
    </div>
  )
}
