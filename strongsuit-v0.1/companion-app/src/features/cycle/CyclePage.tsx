import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ShieldCheck, Trash2, Check } from 'lucide-react'
import { Button, Card, PageHeader } from '@/design'
import { cycleRepo, profileRepo } from '@/db/repo'
import { today } from '@/lib/core'
import {
  symptomBurden, symptomGuidance, summariseCycles, cycleFlags, personalPattern,
  humanSymptom, CYCLE_FRAMING,
  type CycleEntry, type CycleSymptom, type FlowLevel,
} from '@/lib/cycle'
import type { CycleDay } from '@/db/types'

/**
 * Cycle & symptom tracking — optional, local-only, symptom-driven.
 *
 * TONE MATTERS HERE and is a deliberate design decision: matter-of-fact and
 * medical-grade, never pink, never cute, never euphemistic. This is a health
 * log, and treating it as anything softer is patronising.
 *
 * The feature deliberately does NOT prescribe by cycle phase — see the header
 * of `lib/cycle.ts` for the evidence, and `CYCLE_FRAMING` for the disclosure
 * shown to the user. If you're here to add "train heavy in your follicular
 * phase", read that first.
 */

const SYMPTOMS: CycleSymptom[] = [
  'cramps', 'fatigue', 'sleepDisruption', 'gi', 'headache', 'mood', 'breastTenderness',
]
const FLOWS: FlowLevel[] = ['spotting', 'light', 'medium', 'heavy']

function toEntry(d: CycleDay): CycleEntry {
  return {
    date: d.date,
    bleeding: d.bleeding,
    flow: d.flow,
    symptoms: d.symptoms as CycleEntry['symptoms'],
  }
}

export function CyclePage() {
  const [consented, setConsented] = useState<boolean | null>(null)
  const [days, setDays] = useState<CycleDay[]>([])
  const [todayRow, setTodayRow] = useState<CycleDay>()
  const [saved, setSaved] = useState(false)
  const [confirmErase, setConfirmErase] = useState(false)

  const refresh = useCallback(async () => {
    const all = await cycleRepo.all()
    setDays(all)
    setTodayRow(await cycleRepo.forDate(today()))
  }, [])

  useEffect(() => {
    profileRepo.getOrCreate().then(p => setConsented(!!p.cycleTrackingEnabled))
    void refresh()
  }, [refresh])

  async function enable() {
    await profileRepo.patch({ cycleTrackingEnabled: true })
    setConsented(true)
  }

  async function disableAndErase() {
    // Turning it off ERASES it. A toggle that leaves health data sitting in
    // the database is not really off.
    await cycleRepo.wipe()
    await profileRepo.patch({ cycleTrackingEnabled: false })
    setConfirmErase(false)
    setConsented(false)
    await refresh()
  }

  async function save(patch: Partial<CycleDay>) {
    await cycleRepo.put({
      date: today(),
      bleeding: todayRow?.bleeding ?? false,
      flow: todayRow?.flow,
      symptoms: todayRow?.symptoms,
      ...patch,
    })
    await refresh()
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  if (consented === null) return null

  // ---- consent gate ----
  if (!consented) {
    return (
      <div className="space-y-4">
        <PageHeader
          eyebrow="Optional"
          title="Cycle & symptoms"
          action={<Link to="/" className="text-muted hover:text-ink" aria-label="Back"><ArrowLeft size={20} /></Link>}
        />
        <Card className="space-y-3">
          <div className="flex items-start gap-2.5">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-verde-600" />
            <div className="space-y-2 text-xs text-muted">
              <p className="text-sm font-medium text-ink">This stays on your phone</p>
              <p>
                Cycle and symptom data is health data, so it's treated differently from everything else here:
                it is stored only on this device, it is <strong className="text-ink">never</strong> included in
                anything sent to a coach, and turning this off deletes it.
              </p>
              <p>
                If you have a coach, what they can see is a general readiness signal — never your symptoms.
              </p>
            </div>
          </div>
          <div className="rounded-ctl border border-line bg-surface2 p-3">
            <p className="text-2xs leading-relaxed text-muted">{CYCLE_FRAMING}</p>
          </div>
          <Button variant="primary" onClick={enable} className="min-h-[44px] w-full">
            Turn on cycle tracking
          </Button>
          <p className="text-center text-2xs text-faint">You can turn this off and erase it at any time.</p>
        </Card>
      </div>
    )
  }

  // ---- logging ----
  const entries = days.map(toEntry)
  const todayEntry = todayRow ? toEntry(todayRow) : undefined
  // 'self' voice throughout: the reader here is the person, not their coach.
  // Same claims, same hedging — see `Voice` in lib/cycle.ts.
  const burden = symptomBurden(todayEntry)
  const guidance = symptomGuidance(todayEntry, 'self')
  const summary = summariseCycles(entries, today())
  const flags = cycleFlags(entries, summary, 'self')
  const pattern = personalPattern(entries, 'self')

  const sev = (s: CycleSymptom) => todayRow?.symptoms?.[s] ?? 0

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Today"
        title="Cycle & symptoms"
        action={<Link to="/" className="text-muted hover:text-ink" aria-label="Back"><ArrowLeft size={20} /></Link>}
      />

      <Card className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Bleeding today</p>
          {saved && <span className="flex items-center gap-1 text-2xs text-verde-600"><Check size={12} /> Saved</span>}
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => save({ bleeding: !todayRow?.bleeding, flow: todayRow?.bleeding ? undefined : todayRow?.flow })}
            variant={todayRow?.bleeding ? 'primary' : 'secondary'}
            className="min-h-[44px] flex-1 text-xs"
          >
            {todayRow?.bleeding ? 'Yes' : 'No'}
          </Button>
        </div>
        {todayRow?.bleeding && (
          <div className="flex flex-wrap gap-1.5">
            {FLOWS.map(f => (
              <button
                key={f}
                onClick={() => save({ bleeding: true, flow: f })}
                className={`min-h-[36px] rounded-ctl border px-3 text-xs capitalize ${
                  todayRow?.flow === f ? 'border-verde-600 bg-verde-600/10 text-ink' : 'border-line text-muted'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-2.5">
        <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Symptoms today</p>
        {SYMPTOMS.map(s => (
          <div key={s} className="flex items-center justify-between gap-2">
            <span className="text-sm text-ink">{humanSymptom(s)}</span>
            <div className="flex gap-1">
              {[0, 1, 2, 3].map(level => (
                <button
                  key={level}
                  aria-label={`${humanSymptom(s)} severity ${level}`}
                  onClick={() => save({ symptoms: { ...(todayRow?.symptoms ?? {}), [s]: level as 0 | 1 | 2 | 3 } })}
                  className={`h-9 w-9 rounded-ctl border text-xs ${
                    sev(s) === level ? 'border-verde-600 bg-verde-600/10 text-ink' : 'border-line text-faint'
                  }`}
                >
                  {level === 0 ? '–' : level}
                </button>
              ))}
            </div>
          </div>
        ))}
        <p className="text-2xs text-faint">– none · 1 mild · 2 moderate · 3 severe</p>
      </Card>

      {guidance && (
        <Card>
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Today</p>
          <p className="mt-1 text-sm text-ink">{guidance}</p>
          <p className="mt-1 text-2xs text-faint">Based on how you feel today — not on where you are in your cycle.</p>
        </Card>
      )}

      {(flags.messages.length > 0) && (
        <Card className="border-ember-500/40 space-y-2">
          {flags.messages.map((m, i) => (
            <p key={i} className="text-xs text-ink">{m}</p>
          ))}
          <p className="text-2xs text-faint">{flags.source}</p>
        </Card>
      )}

      {pattern.observation && (
        <Card>
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">Your pattern</p>
          <p className="mt-1 text-xs text-ink">{pattern.observation}</p>
          <p className="mt-1 text-2xs text-faint">{pattern.source}</p>
        </Card>
      )}

      {summary.starts.length > 0 && (
        <Card>
          <p className="text-2xs font-semibold uppercase tracking-wide text-faint">History</p>
          <p className="mt-1 text-xs text-muted">
            {summary.starts.length} cycle{summary.starts.length === 1 ? '' : 's'} logged
            {summary.averageLength ? ` · about ${summary.averageLength} days apart` : ''}
            {summary.currentDay ? ` · day ${summary.currentDay}` : ''}
          </p>
          <p className="mt-1 text-2xs text-faint">
            Today's symptom load: {burden.band}
          </p>
        </Card>
      )}

      <Card className="space-y-2">
        <p className="text-2xs leading-relaxed text-muted">{CYCLE_FRAMING}</p>
        {/* Two taps, because this is unrecoverable — there is no undo and no
            copy of it anywhere else by design. The confirm state states the
            count so "erase" isn't an abstraction. */}
        {confirmErase ? (
          <>
            <p className="text-center text-xs text-ink">
              Erase {days.length} logged {days.length === 1 ? 'day' : 'days'}? This can't be undone.
            </p>
            <div className="flex gap-2">
              <Button onClick={() => setConfirmErase(false)} className="min-h-[44px] flex-1 text-xs">Keep it</Button>
              <Button onClick={disableAndErase} className="min-h-[44px] flex-1 gap-2 text-xs text-signal-600">
                <Trash2 size={14} /> Erase
              </Button>
            </div>
          </>
        ) : (
          <Button onClick={() => setConfirmErase(true)} className="min-h-[44px] w-full gap-2 text-xs text-signal-600">
            <Trash2 size={14} /> Turn off and erase this data
          </Button>
        )}
        <p className="text-center text-2xs text-faint">
          Erases cycle and symptom entries only. Your workouts and measurements are untouched.
        </p>
      </Card>
    </div>
  )
}

export default CyclePage
