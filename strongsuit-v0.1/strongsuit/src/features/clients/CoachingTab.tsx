import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Target, ShieldCheck, ShieldAlert, Activity, FileSignature, HeartPulse, Info,
} from 'lucide-react'
import {
  Card, Field, Select, Button, Stat, Tag, Dialog, Input, toast,
} from '@/design'
import { clientsRepo, waiversRepo, logsRepo, trainerRepo } from '@/db/repo'
import type { Client, Units, TrainingGoal, WaiverKind } from '@/db/types'
import { goalPlan, ALL_GOALS, GOAL_LABELS } from '@/lib/goals'
import {
  screen, PARQ_QUESTIONS, CLEARED_COPY, FLAGGED_COPY, PARQ_SOURCE,
  assumptionOfRiskText, informedConsentText, ASSUMPTION_OF_RISK_TITLE, INFORMED_CONSENT_TITLE,
} from '@/lib/parq'
import { acwr, type DayLoad } from '@/lib/trainingLoad'
import { setTonnage } from '@/lib/core'
import { sha256Hex } from '@/lib/sync'
import { today } from '@/lib/core'

// ---------- Goal & programming ----------
function GoalCard({ client }: { client: Client }) {
  const goal = client.trainingGoal
  const plan = goal ? goalPlan(goal) : null
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <Target size={16} className="text-verde-600" /> Goal &amp; programming
        </div>
        <Field label="">
          <Select
            value={goal ?? ''}
            onChange={e => clientsRepo.update(client.id, { trainingGoal: (e.target.value || undefined) as TrainingGoal })}
            className="!h-8 w-48"
          >
            <option value="">Choose a goal…</option>
            {ALL_GOALS.map(g => <option key={g} value={g}>{GOAL_LABELS[g]}</option>)}
          </Select>
        </Field>
      </div>

      {!plan ? (
        <p className="text-xs text-muted">Pick a primary goal and Coachwright lays out evidence-based training and nutrition targets — each with its source.</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{plan.summary}</p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Stat label="Reps" value={`${plan.repRange[0]}–${plan.repRange[1]}`} />
            <Stat label="Intensity" value={`${plan.intensityPct[0]}–${plan.intensityPct[1]}`} unit="%1RM" />
            <Stat label="Rest" value={`${plan.restSeconds[0]}–${plan.restSeconds[1]}`} unit="s" />
            <Stat label="Sets/muscle/wk" value={`${plan.setsPerMusclePerWeek[0]}–${plan.setsPerMusclePerWeek[1]}`} />
            <Stat label="Effort" value={`${plan.rir[0]}–${plan.rir[1]}`} unit="RIR" />
            <Stat label="Days/week" value={`${plan.sessionsPerWeek[0]}–${plan.sessionsPerWeek[1]}`} />
            <Stat label="Protein" value={plan.proteinPerKg} unit="g/kg" />
            <Stat label="Calories" value={plan.calorieAdjustmentPct === 0 ? 'maintain' : `${plan.calorieAdjustmentPct > 0 ? '+' : ''}${plan.calorieAdjustmentPct}%`} tone={plan.calorieAdjustmentPct < 0 ? 'ember' : 'verde'} />
          </div>
          <p className="mt-3 text-xs text-muted"><span className="font-medium text-ink">Conditioning:</span> {plan.cardio}</p>
          <div className="mt-3 border-t border-line pt-3">
            <div className="mb-1 flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wide text-verde-600"><Info size={13} /> Why these targets</div>
            <ul className="space-y-1.5">
              {plan.rationale.map((r, i) => (
                <li key={i} className="text-xs text-muted">{r.text}<span className="mt-0.5 block text-2xs text-faint">Source: {r.source}</span></li>
              ))}
            </ul>
          </div>
        </>
      )}
    </Card>
  )
}

// ---------- Training load (ACWR) ----------
function LoadCard({ clientId }: { clientId: string }) {
  const loads = useLiveQuery(async (): Promise<DayLoad[]> => {
    const logs = await logsRepo.forClient(clientId)
    return logs.map(l => ({
      date: l.date,
      load: l.entries.reduce((sum, e) =>
        sum + e.sets.reduce((s, set) => s + (set.done ? setTonnage(set.actualLoad, set.actualReps) : 0), 0), 0),
    })).filter(d => d.load > 0)
  }, [clientId], [])

  const a = acwr(loads, today())
  const toneCls = { 'sweet-spot': 'text-verde-600', 'caution': 'text-ember-600', 'danger': 'text-signal-600', 'detraining': 'text-muted' }[a.zone]
  const barCls = { 'sweet-spot': 'bg-verde-600', 'caution': 'bg-ember-500', 'danger': 'bg-signal-600', 'detraining': 'bg-faint' }[a.zone]

  return (
    <Card>
      <div className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-ink">
        <Activity size={16} className="text-verde-600" /> Training load
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Acute (7d)" value={a.acute} />
        <Stat label="Chronic (28d avg)" value={a.chronic} />
        <Stat label="A:C ratio" value={a.ratio || '—'} tone={a.zone === 'danger' ? 'ember' : 'ink'} />
      </div>
      <div className="mt-3">
        {/* 0–2 scale; sweet spot 0.8–1.3 marked */}
        <div className="relative h-2 overflow-hidden rounded-full bg-surface2">
          <div className="absolute inset-y-0 bg-verde-100" style={{ left: `${(0.8 / 2) * 100}%`, width: `${((1.3 - 0.8) / 2) * 100}%` }} />
          <div className={`absolute inset-y-0 left-0 rounded-full ${barCls}`} style={{ width: `${Math.min(100, (a.ratio / 2) * 100)}%`, opacity: 0.5 }} />
        </div>
        <p className={`mt-2 text-xs ${toneCls}`}>{a.note}</p>
        <p className="mt-1 text-2xs text-faint">Acute:chronic workload ratio (Gabbett 2016, Br J Sports Med). Load = session tonnage.</p>
      </div>
    </Card>
  )
}

// ---------- Safety: PAR-Q + waivers ----------
function ScreeningDialog({ client, open, onClose }: { client: Client; open: boolean; onClose: () => void }) {
  const [answers, setAnswers] = useState<boolean[]>(() => PARQ_QUESTIONS.map(() => false))
  const [note, setNote] = useState('')

  async function save() {
    const result = screen(PARQ_QUESTIONS.map((q, i) => ({ q, yes: answers[i] })), note.trim() || undefined)
    await clientsRepo.update(client.id, { screening: result })
    toast(result.cleared ? 'Screening saved — cleared to train.' : 'Screening saved — clearance recommended.')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Health screening (PAR-Q+)" width={560}>
      <div className="space-y-2">
        <p className="text-xs text-muted">Answer with the client before their first session. Any “yes” recommends physician clearance first.</p>
        <div className="space-y-1.5">
          {PARQ_QUESTIONS.map((q, i) => (
            <label key={i} className="flex items-start gap-3 rounded-ctl border border-line px-3 py-2 text-sm">
              <input type="checkbox" checked={answers[i]} onChange={e => setAnswers(a => a.map((v, j) => j === i ? e.target.checked : v))} className="mt-0.5 accent-[var(--ember-500)]" />
              <span className="text-ink">{q}</span>
            </label>
          ))}
        </div>
        <Field label="Note (optional)"><Input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. cleared by Dr. Lee 2026-07-01" /></Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={save}>Save screening</Button>
        </div>
      </div>
    </Dialog>
  )
}

function WaiverDialog({ client, businessName, open, onClose }: { client: Client; businessName: string; open: boolean; onClose: () => void }) {
  const [kind, setKind] = useState<WaiverKind>('assumption-of-risk')
  const [signed, setSigned] = useState('')

  const doc = kind === 'informed-consent'
    ? { title: INFORMED_CONSENT_TITLE, text: informedConsentText(businessName) }
    : { title: ASSUMPTION_OF_RISK_TITLE, text: assumptionOfRiskText(businessName, `${client.firstName} ${client.lastName}`.trim()) }

  async function sign() {
    if (!signed.trim()) return
    const documentHash = await sha256Hex(doc.text)
    await waiversRepo.create({
      clientId: client.id, kind, documentTitle: doc.title, documentText: doc.text,
      documentHash, signedName: signed.trim(), signedDate: today(),
      deviceLabel: navigator.platform || 'this device',
    })
    toast('Waiver recorded.')
    setSigned('')
    onClose()
  }

  return (
    <Dialog open={open} onClose={onClose} title="Record a waiver" width={620}>
      <div className="space-y-3">
        <Field label="Document">
          <Select value={kind} onChange={e => setKind(e.target.value as WaiverKind)}>
            <option value="assumption-of-risk">Assumption of Risk &amp; Release of Liability</option>
            <option value="informed-consent">Informed Consent to Train</option>
          </Select>
        </Field>
        <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-card border border-line bg-surface2 p-3 text-xs leading-relaxed text-ink">
          {doc.text}
        </div>
        <p className="text-2xs text-faint">These are standard templates. Have a lawyer review and localize them for your jurisdiction before relying on them.</p>
        <Field label="Client signature (type full name to acknowledge)">
          <Input value={signed} onChange={e => setSigned(e.target.value)} placeholder={`${client.firstName} ${client.lastName}`.trim()} />
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={sign} disabled={!signed.trim()}>Record acknowledgement</Button>
        </div>
      </div>
    </Dialog>
  )
}

function SafetyCard({ client }: { client: Client }) {
  const [screenOpen, setScreenOpen] = useState(false)
  const [waiverOpen, setWaiverOpen] = useState(false)
  const trainer = useLiveQuery(() => trainerRepo.get())
  const waivers = useLiveQuery(() => waiversRepo.forClient(client.id), [client.id], [])
  const s = client.screening
  const hasRiskWaiver = waivers.some(w => w.kind === 'assumption-of-risk')
  const cleared = s?.cleared && hasRiskWaiver

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-ink">
          <HeartPulse size={16} className="text-verde-600" /> Readiness &amp; safety
        </div>
        {cleared
          ? <Tag tone="verde"><ShieldCheck size={11} /> cleared to train</Tag>
          : <Tag tone="ember"><ShieldAlert size={11} /> action needed</Tag>}
      </div>

      {/* Screening status */}
      <div className="rounded-ctl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Health screening (PAR-Q+)</span>
          <Button size="sm" variant="secondary" onClick={() => setScreenOpen(true)}>{s ? 'Re-screen' : 'Run screening'}</Button>
        </div>
        {s ? (
          <p className={`mt-2 text-xs ${s.cleared ? 'text-verde-600' : 'text-ember-600'}`}>
            {s.date}: {s.cleared ? CLEARED_COPY : FLAGGED_COPY}
            {s.flags.length > 0 && <span className="mt-1 block text-2xs text-faint">Flagged: {s.flags.length} item(s). {s.note ? `Note: ${s.note}` : ''}</span>}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted">Not screened yet. Screen before the first session — it's the key liability step.</p>
        )}
        <p className="mt-1 text-2xs text-faint">{PARQ_SOURCE}</p>
      </div>

      {/* Waivers */}
      <div className="mt-3 rounded-ctl border border-line p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-ink">Signed waivers</span>
          <Button size="sm" variant="secondary" onClick={() => setWaiverOpen(true)}><FileSignature size={13} /> Record waiver</Button>
        </div>
        {waivers.length === 0 ? (
          <p className="mt-2 text-xs text-muted">No waivers on file. Record an assumption-of-risk release before training.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {waivers.map(w => (
              <li key={w.id} className="flex items-center justify-between text-xs">
                <span className="text-ink">{w.documentTitle}</span>
                <span className="text-2xs text-faint">signed {w.signedName}, {w.signedDate} · <span className="font-mono">{w.documentHash.slice(0, 8)}</span></span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-3 text-2xs text-faint">
        Coachwright helps you document screening and consent; it is not legal advice. You remain responsible for following your certification's scope of practice and local law.
      </p>

      <ScreeningDialog client={client} open={screenOpen} onClose={() => setScreenOpen(false)} />
      <WaiverDialog client={client} businessName={trainer?.businessName || ''} open={waiverOpen} onClose={() => setWaiverOpen(false)} />
    </Card>
  )
}

export default function CoachingTab({ client }: { client: Client; units: Units }) {
  return (
    <div className="max-w-3xl space-y-6">
      <SafetyCard client={client} />
      <GoalCard client={client} />
      <LoadCard clientId={client.id} />
    </div>
  )
}
