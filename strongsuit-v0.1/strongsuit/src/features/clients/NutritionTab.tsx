import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Apple, Info } from 'lucide-react'
import { Card, Field, Input, Select, Stat, EmptyState, Button, toast } from '@/design'
import { clientsRepo, metricsRepo } from '@/db/repo'
import type { Client, Units, Sex, ActivityLevel, NutritionGoal } from '@/db/types'
import { nutritionPlan, ageFromBirthDate, toKg, ACTIVITY_FACTORS, carbCycle, dietBreakAdvice, type RationaleLine } from '@/lib/nutrition'
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

  return (
    <div className="max-w-3xl space-y-6">
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
              className="font-mono tnum"
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
                className="font-mono tnum"
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
                      <p className="font-mono tnum text-lg font-semibold text-ink">{cycled.trainingDay.calories} kcal</p>
                      <p className="text-2xs text-muted">{cycled.trainingDay.carbsG}g carbs · {cycled.trainingDay.proteinG}g protein · {cycled.trainingDay.fatG}g fat</p>
                    </div>
                    <div className="rounded-ctl border border-line bg-surface2 p-3">
                      <p className="mb-1 text-2xs font-semibold uppercase tracking-wide text-faint">Rest days</p>
                      <p className="font-mono tnum text-lg font-semibold text-ink">{cycled.restDay.calories} kcal</p>
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
