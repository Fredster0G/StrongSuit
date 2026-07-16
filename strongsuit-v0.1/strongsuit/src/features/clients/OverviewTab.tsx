import { useLiveQuery } from 'dexie-react-hooks'
import { Card, SectionHeader, Stat, PRTag } from '@/design'
import { exercisesRepo, logsRepo } from '@/db/repo'
import type { Client, Program } from '@/db/types'
import { detectPRs, calculateWeeklyTonnage, calculateWeeklySessions } from '@/lib/analytics'

export default function OverviewTab({ 
  client, 
  lastSessionDays, 
  activeProgram, 
  weekStartsOn 
}: { 
  client: Client; 
  lastSessionDays: number | null; 
  activeProgram: Program | null;
  weekStartsOn: 0 | 1;
}) {
  const logs = useLiveQuery(() => logsRepo.forClient(client.id), [client.id]) || []
  const exercises = useLiveQuery(() => exercisesRepo.all(), []) || []
  
  const prs = detectPRs(logs)
  const recentPRs = prs.slice(0, 5) // Just show last 5 PRs
  
  const tonnage = calculateWeeklyTonnage(logs, weekStartsOn)
  const adherence = calculateWeeklySessions(logs, weekStartsOn)
  
  const exMap = Object.fromEntries(exercises.map(e => [e.id, e.name]))
  
  // Calculate max tonnage for chart scaling
  const maxTonnage = Math.max(1, ...tonnage.map(t => t.tonnage))
  // Calculate max sessions for adherence scaling
  const prescribedSessions = activeProgram ? Math.max(1, activeProgram.weeks[0]?.days?.length || 1) : 3
  const maxAdherence = Math.max(prescribedSessions, ...adherence.map(a => a.count))

  return (
    <div className="max-w-4xl space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">Goals</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{client.goals || 'No goals recorded yet.'}</p>
        </Card>
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Last session" value={lastSessionDays === null ? '—' : lastSessionDays === 0 ? 'Today' : lastSessionDays} unit={lastSessionDays ? 'days ago' : undefined} tone={lastSessionDays !== null && lastSessionDays > 7 ? 'ember' : 'ink'} />
            <Stat label="Status" value={client.status} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader title="Volume Load (Tonnage)" />
          {tonnage.length === 0 ? (
            <p className="text-sm text-faint py-4">No sessions logged yet.</p>
          ) : (
            <div className="h-32 flex items-end gap-1 mt-4">
              {tonnage.slice(-12).map(t => (
                <div key={t.week} className="flex-1 flex flex-col justify-end group relative">
                  <div 
                    className="w-full bg-brand-500 rounded-t-sm transition-all hover:bg-brand-400"
                    style={{ height: `${(t.tonnage / maxTonnage) * 100}%`, minHeight: '4px' }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-iron-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                    Week of {t.week.slice(5)}: {t.tonnage.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title="Adherence (Sessions / Week)" />
          {adherence.length === 0 ? (
            <p className="text-sm text-faint py-4">No sessions logged yet.</p>
          ) : (
            <div className="h-32 flex items-end gap-1 mt-4">
              {adherence.slice(-12).map(a => {
                const percent = Math.min(100, Math.round((a.count / prescribedSessions) * 100))
                return (
                  <div key={a.week} className="flex-1 flex flex-col justify-end group relative">
                    <div 
                      className={`w-full rounded-t-sm transition-all ${percent >= 100 ? 'bg-verde-500' : percent >= 66 ? 'bg-brand-500' : 'bg-ember-500'}`}
                      style={{ height: `${(a.count / maxAdherence) * 100}%`, minHeight: '4px' }}
                    />
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-iron-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {a.count} sessions ({percent}%)
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      </div>

      {recentPRs.length > 0 && (
        <Card>
          <SectionHeader title="Recent PRs" />
          <div className="divide-y divide-line -mx-4 -mb-4 mt-2">
            {recentPRs.map(pr => (
              <div key={pr.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{exMap[pr.exerciseId] || 'Unknown Exercise'}</p>
                  <p className="text-xs text-faint font-mono tnum mt-0.5">{pr.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {pr.type === 'load' ? `${pr.value} load PR` : pr.type === 'rep' ? `${pr.value} rep PR @ ${pr.load}` : `${pr.value} est. 1RM`}
                    </p>
                    <p className="text-xs text-muted font-mono tnum">
                      {pr.load} × {pr.reps}
                    </p>
                  </div>
                  <PRTag>PR</PRTag>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
