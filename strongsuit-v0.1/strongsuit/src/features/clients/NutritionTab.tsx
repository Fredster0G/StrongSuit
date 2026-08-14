import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Apple, Info, ShieldAlert, AlertTriangle } from 'lucide-react'
import { Card, Field, Input, Select, Stat, EmptyState, Button, toast } from '@/design'
import { clientsRepo, metricsRepo } from '@/db/repo'
import type { Client, Units, Sex, ActivityLevel, NutritionGoal } from '@/db/types'
import { nutritionPlan, ageFromBirthDate, toKg, ACTIVITY_FACTORS, carbCycle, dietBreakAdvice, type RationaleLine } from '@/lib/nutrition'
import { assessEnergyAvailability, screenPrescription } from '@/lib/energyAvailability'
import { chooseBmr, proteinDistribution, carbTarget, type SessionLoad } from '@/lib/nutritionAdvanced'
import { goalPlan, GOAL_LABELS } from '@/lib/goals'
import { today } from '@/lib/core'

function weeksBetween(start: string, end: string): number {
  const ms = new Date(end + 'T00:00:00').getTime() - new Date(start + 'T00:00:00').getTime()
  return Math.max(0, Math.floor(ms / (7 * 86_400_000)))
}

function Why({ line }: { line: RationaleLine }) {
  return (
    <p className="mt-1 text-xs text-muted">
      {line.text}
      <span className="mt-0.5 block text-2xs text-faint">Source: {line.source}</span>
    </p>
  )
}

export default function NutritionTab({ client, units }: { client: Client; units: Units }) {
  const [bwDraft, setBwDraft] = useState('')

  // latest logged bodyweight drives the math — nutrition stays tied to real data
  const latestBw = useLiveQuery(async () => {
    const rows = await metricsRepo.table.where('[clientId+key]').equals([client.id, 'bodyweight']).sortBy('date')
    return rows.at(-1) ?? null
  }, [client.id])

  // Energy availability is per kg of FAT-FREE mass, so it needs a real body-fat
  // reading. Sourced from logged metrics rather than estimated — see the
  // refusal-to-guess rule in lib/energyAvailability.ts.
  const latestBf = useLiveQuery(async () => {
    const rows = await metricsRepo.table.where('[clientId+key]').equals([client.id, 'bodyfat']).sortBy('date')
    return rows.at(-1) ?? null
  }, [client.id])

  const patch = (p: Partial<Client>) => clientsRepo.update(client.id, p)

  async function saveBodyweight() {
    const v = Number(bwDraft)
    if (!v || v <= 0) return
    await metricsRepo.create({ clientId: client.id, date: today(), type: 'bodyweight', key: 'bodyweight', value: v, unit: units })
    setBwDraft('')
    toast('Bodyweight logged.')
  }

  const age = client.birthDate ? ageFromBirthDate(client.birthDate) : null
  // Nutrition goal falls back to the one implied by the training goal, so a
  // coach who set "Fat loss" on the Coaching tab gets a cut here automatically.
  const effectiveGoal = client.nutritionGoal ?? (client.trainingGoal ? goalPlan(client.trainingGoal).nutritionGoal : undefined)
  const goalFromTraining = !client.nutritionGoal && !!client.trainingGoal
  const ready = latestBw && client.heightCm && client.sex && age !== null && client.activityLevel && effectiveGoal
  const plan = ready
    ? nutritionPlan({
        weightKg: toKg(latestBw!.value, latestBw!.unit === 'kg' ? 'kg' : 'lb'),
        heightCm: client.heightCm!,
        age: age!,
        sex: client.sex!,
        activity: client.activityLevel!,
        goal: effectiveGoal!,
      })
    : null

  // How much energy training itself costs. Approximated from the activity
  // factor rather than logged sessions — stated as an approximation in the UI,
  // because using TDEE here is the classic way to get EA wrong.
  const exerciseKcal = plan ? Math.round(plan.tdee - plan.bmr * 1.2) : 0
  const ea = plan && latestBw
    ? assessEnergyAvailability({
        intakeKcal: plan.calories,
        exerciseKcal: Math.max(0, exerciseKcal),
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
        sex: client.sex,
      })
    : null
  // Better BMR when body composition is actually known — Mifflin can't see it
  // and systematically under-predicts for lean, muscular clients.
  const bmrChoice = plan && latestBw
    ? chooseBmr({
        mifflinBmr: plan.bmr,
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
      })
    : null

  // Protein as a distribution, not just a daily total — the per-meal dose is
  // what actually drives the response.
  const weightKgNow = latestBw ? toKg(latestBw.value, latestBw.unit === 'kg' ? 'kg' : 'lb') : null
  const protein = weightKgNow && age !== null
    ? proteinDistribution({ weightKg: weightKgNow, age, cutting: effectiveGoal === 'cut' })
    : null

  const [carbDay, setCarbDay] = useState<SessionLoad>('moderate')
  const carbs = weightKgNow ? carbTarget(weightKgNow, carbDay) : null

  const prescriptionWarning = plan && latestBw
    ? screenPrescription({
        targetKcal: plan.calories,
        exerciseKcal: Math.max(0, exerciseKcal),
        weight: latestBw.value,
        units: latestBw.unit === 'kg' ? 'kg' : 'lb',
        bodyFatPct: latestBf?.value,
        sex: client.sex,
      })
    : null

  return (
    <div className="max-w-3xl space-y-6">
      {/* Safety first, literally: if the prescribed target drives energy
          availability below threshold, that outranks every macro on this page. */}
      {prescriptionWarning && (
        <Card className={prescriptionWarning.severity === 'stop' ? 'border-signal-600/50' : 'border-ember-500/50'}>
          <div className="flex items-start gap-2.5">
            {prescriptionWarning.severity === 'stop'
              ? <ShieldAlert size={18} className="mt-0.5 shrink-0 text-signal-600" />
              : <AlertTriangle size={18} className="mt-0.5 shrink-0 text-ember-600" />}
            <div>
              <p className="text-sm font-semibold text-ink">
                {prescriptionWarning.severity === 'stop' ? 'This target is below the safe threshold' : 'This target is close to the threshold'}
              </p>
              <p className="mt-1 text-xs text-muted">{prescriptionWarning.message}</p>
              <p className="mt-1.5 text-2xs text-faint">{prescriptionWarning.source}</p>
            </div>
          </div>
        </Card>
      )}

      {ea && (
        <Card>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <ShieldAlert size={14} /> Energy availability
            </div>
            {ea.ea != null && (
              <span className={`font-mono tabular-nums text-lg font-semibold ${
                ea.band === 'low' ? 'text-signal-600' : ea.band === 'reduced' ? 'text-ember-600' : 'text-verde-600'
              }`}>
                {ea.ea}<span className="text-2xs font-normal text-faint"> kcal/kg FFM</span>
              </span>
            )}
          </div>
          <p className="text-xs text-ink">{ea.summary}</p>
          <p className="mt-1.5 text-2xs text-faint">
            {ea.confidenceReason} Training cost is approximated from activity level — log sessions for a tighter figure.
          </p>
          <p className="mt-1 text-2xs text-faint">{ea.source}</p>
        </Card>
      )}

      {bmrChoice && bmrChoice.equation !== 'mifflin' && (
        <Card>
          <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Info size={14} /> Resting burn — refined
          </div>
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{bmrChoice.bmr}</span> kcal/day
            <span className="text-2xs text-faint"> (Mifflin estimated {plan?.bmr})</span>
          </p>
          <p className="mt-1 text-xs text-muted">{bmrChoice.rationale}</p>
          <p className="mt-1 text-2xs text-faint">{bmrChoice.source}</p>
        </Card>
      )}

      {protein && (
        <Card>
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
            <Info size={14} /> Protein distribution
          </div>
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{protein.dailyG} g</span>/day ·
            about <span className="font-mono tabular-nums">{protein.perMealG} g</span> across {protein.meals} meals
          </p>
          <p className="mt-1 text-2xs text-muted">
            Aim for at least <span className="font-mono tabular-nums">{protein.perMealFloorG} g</span> per feeding — the per-meal
            dose drives the response, not just the daily total.
          </p>
          {protein.notes.map((n, i) => (
            <p key={i} className="mt-1.5 text-2xs text-muted">{n}</p>
          ))}
          <p className="mt-1.5 text-2xs text-faint">{protein.source}</p>
        </Card>
      )}

      {carbs && (
        <Card>
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
              <Info size={14} /> Carbohydrate for the day
            </div>
            <Select value={carbDay} onChange={e => setCarbDay(e.target.value as SessionLoad)} className="!h-7 !w-44 text-xs">
              <option value="rest">Rest / technique</option>
              <option value="light">Light (&lt;1 h)</option>
              <option value="moderate">Moderate (~1 h)</option>
              <option value="high">High (1–3 h)</option>
              <option value="veryHigh">Very high (&gt;3 h)</option>
            </Select>
          </div>
          <p className="text-sm text-ink">
            <span className="font-mono tabular-nums">{carbs.gramsLow}–{carbs.gramsHigh} g</span>
            <span className="text-2xs text-faint"> ({carbs.gPerKg.low}–{carbs.gPerKg.high} g/kg) · {carbs.label}</span>
          </p>
          <p className="mt-1 text-2xs text-muted">
            Carbohydrate is matched to the day's actual training rather than held flat — a single daily number is too much
            on a rest day and far too little before a long session.
          </p>
          {carbs.intraSession && <p className="mt-1.5 text-2xs text-muted">{carbs.intraSession}</p>}
          <p className="mt-1.5 text-2xs text-faint">{carbs.source}</p>
        </Card>
      )}
      {/* Profile inputs — persist immediately, plan recomputes live */}
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-ink">Nutrition profile</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Sex" hint="for BMR math">
            <Select value={client.sex ?? ''} onChange={e => patch({ sex: (e.target.value || undefined) as Sex })}>
              <option value="">—</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>
          <Field label="Height (cm)">
            <Input
              type="number" min="100" max="230" defaultValue={client.heightCm ?? ''}
              onBlur={e => patch({ heightCm: Number(e.target.value) || undefined })}
              className="font-mono tabular-nums"
            />
          </Field>
          <Field label="Birth date">
            <Input
              type="date" defaultValue={client.birthDate ?? ''}
              onBlur={e => patch({ birthDate: e.target.value || undefined })}
            />
          </Field>
          <Field label="Activity level">
            <Select value={client.activityLevel ?? ''} onChange={e => patch({ activityLevel: (e.target.value || undefined) as ActivityLevel })}>
              <option value="">—</option>
              {Object.entries(ACTIVITY_FACTORS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Goal">
            <Select value={client.nutritionGoal ?? ''} onChange={e => patch({ nutritionGoal: (e.target.value || undefined) as NutritionGoal })}>
              <option value="">—</option>
              <option value="cut">Lose fat</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Build muscle</option>
            </Select>
          </Field>
          <Field label={`Bodyweight (${units})`} hint={latestBw ? `latest: ${latestBw.value} ${latestBw.unit} · ${latestBw.date}` : 'none logged'}>
            <div className="flex gap-2">
              <Input
                type="number" min="0" placeholder={latestBw ? String(latestBw.value) : '0'}
                value={bwDraft} onChange={e => setBwDraft(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveBodyweight()}
                className="font-mono tabular-nums"
              />
              <Button size="sm" className="h-9 shrink-0" onClick={saveBodyweight} disabled={!Number(bwDraft)}>Log</Button>
            </div>
          </Field>
        </div>
      </Card>

      {!plan ? (
        <EmptyState
          icon={<Apple size={28} strokeWidth={1.5} />}
          title="Complete the profile and the plan writes itself"
          body="Sex, height, birth date, activity, goal, and one logged bodyweight — that's everything the engine needs. Every target it produces comes with the research behind it."
        />
      ) : (
        <>
          {/* Targets */}
          <Card>
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Daily targets</h3>
              <span className="text-2xs text-faint">BMR {plan.bmr} · TDEE {plan.tdee} kcal</span>
            </div>
            {goalFromTraining && client.trainingGoal && (
              <p className="mb-2 text-2xs text-muted">Goal set from this client's training goal ({GOAL_LABELS[client.trainingGoal]}). Override it above.</p>
            )}
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat label="Calories" value={plan.calories} unit="kcal" tone="verde" />
              <Stat label="Protein" value={plan.proteinG} unit="g" />
              <Stat label="Carbs" value={plan.carbsG} unit="g" />
              <Stat label="Fat" value={plan.fatG} unit="g" />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-4 border-t border-line pt-3">
              <Stat label="Fiber" value={plan.fiberG} unit="g" />
              <Stat label="Water" value={plan.waterL} unit="L" />
            </div>
            <p className="mt-3 text-xs text-muted">{plan.weeklyRateNote}</p>
          </Card>

          {/* Training-day / rest-day carb cycling */}
          <Card>
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-ink">Training-day carb cycling</h3>
              <Field label="">
                <Select
                  value={client.trainingDaysPerWeek ?? 4}
                  onChange={e => patch({ trainingDaysPerWeek: Number(e.target.value) })}
                  className="!h-8 !w-40 text-xs"
                >
                  {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} training days/wk</option>)}
                </Select>
              </Field>
            </div>
            {(() => {
              const cycled = carbCycle(plan, client.trainingDaysPerWeek ?? 4)
              return (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-ctl border border-verde-600/30 bg-verde-100/40 p-3">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-verde-700">Training days</p>
                      <p className="font-mono tabular-nums text-lg font-semibold text-ink">{cycled.trainingDay.calories} kcal</p>
                      <p className="text-2xs text-muted">{cycled.trainingDay.carbsG}g carbs · {cycled.trainingDay.proteinG}g protein · {cycled.trainingDay.fatG}g fat</p>
                    </div>
                    <div className="rounded-ctl border border-line bg-surface2 p-3">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">Rest days</p>
                      <p className="font-mono tabular-nums text-lg font-semibold text-ink">{cycled.restDay.calories} kcal</p>
                      <p className="text-2xs text-muted">{cycled.restDay.carbsG}g carbs · {cycled.restDay.proteinG}g protein · {cycled.restDay.fatG}g fat</p>
                    </div>
                  </div>
                  <p className="mt-2 text-2xs text-faint">{cycled.rationale.text}<span className="mt-0.5 block">Source: {cycled.rationale.source}</span></p>
                </>
              )
            })()}
          </Card>

          {/* Diet-break awareness (cut goal only) */}
          {effectiveGoal === 'cut' && (
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">Diet duration</h3>
                <Field label="">
                  <Input
                    type="date" defaultValue={client.dietPhaseStartDate ?? ''}
                    onBlur={e => patch({ dietPhaseStartDate: e.target.value || undefined })}
                    className="!h-8 !w-36 text-xs" placeholder="Cut start date"
                  />
                </Field>
              </div>
              {!client.dietPhaseStartDate ? (
                <p className="text-xs text-muted">Set when this cut began to get a diet-break recommendation — long deficits benefit from a planned break back to maintenance.</p>
              ) : (() => {
                const weeks = weeksBetween(client.dietPhaseStartDate, today())
                const advice = dietBreakAdvice(weeks)
                return (
                  <div>
                    <p className={`text-sm ${advice.recommend ? 'text-ember-600' : 'text-ink'}`}>{advice.note}</p>
                    <p className="mt-1 text-2xs text-faint">Source: {advice.source}</p>
                  </div>
                )
              })()}
            </Card>
          )}

          {/* The why — every number defends itself */}
          <Card>
            <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-verde-600">
              <Info size={14} /> Why these numbers
            </div>
            <dl className="divide-y divide-line">
              {([
                ['Calories', plan.rationale.calories],
                ['Protein', plan.rationale.protein],
                ['Carbs', plan.rationale.carbs],
                ['Fat', plan.rationale.fat],
                ['Fiber', plan.rationale.fiber],
                ['Water', plan.rationale.water],
              ] as [string, RationaleLine][]).map(([label, line]) => (
                <div key={label} className="py-2.5 first:pt-0 last:pb-0">
                  <dt className="text-xs font-semibold text-ink">{label}</dt>
                  <dd><Why line={line} /></dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 border-t border-line pt-3 text-2xs text-faint">
              Computed from published sports-nutrition consensus — not medical advice. Clients with medical conditions, a history of disordered eating, or who are pregnant should work with a registered dietitian or physician.
            </p>
          </Card>
        </>
      )}
    </div>
  )
}
