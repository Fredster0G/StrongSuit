import { useLiveQuery } from 'dexie-react-hooks'
import { Card, SectionHeader, Stat, PRTag } from '@/design'
import { exercisesRepo, logsRepo } from '@/db/repo'
import type { Client, Program } from '@/db/types'
import { detectPRs, calculateWeeklyTonnage, calculateWeeklySessions } from '@/lib/analytics'
import { useTranslation } from '@/lib/i18n'

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
  const { t } = useTranslation()
  
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
          <p className="mb-2 text-2xs font-medium uppercase tracking-wide text-faint">{t('clients.overview.goals')}</p>
          <p className="text-sm text-ink whitespace-pre-wrap">{client.goals || t('clients.overview.noGoals')}</p>
        </Card>
        <Card>
          <div className="grid grid-cols-2 gap-4">
            <Stat label={t('clients.overview.lastSession')} value={lastSessionDays === null ? '—' : lastSessionDays === 0 ? t('clients.overview.lastSessionToday') : lastSessionDays} unit={lastSessionDays ? t('clients.overview.lastSessionDaysAgo') : undefined} tone={lastSessionDays !== null && lastSessionDays > 7 ? 'ember' : 'ink'} />
            <Stat label={t('clients.overview.status')} value={client.status} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <SectionHeader title={t('clients.overview.tonnageTitle')} />
          {tonnage.length === 0 ? (
            <p className="text-sm text-faint py-4">{t('clients.overview.noSessions')}</p>
          ) : (
            <div className="h-32 flex items-end gap-1 mt-4">
              {tonnage.slice(-12).map(week => (
                <div key={week.week} className="flex-1 flex flex-col justify-end group relative">
                  <div
                    className="w-full bg-verde-600 rounded-t-sm transition-all hover:bg-verde-700"
                    style={{ height: `${(week.tonnage / maxTonnage) * 100}%`, minHeight: '4px' }}
                  />
                  <div className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#171A1E] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                    {t('clients.overview.weekOf', { date: week.week.slice(5), value: week.tonnage.toLocaleString() })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card>
          <SectionHeader title={t('clients.overview.adherenceTitle')} />
          {adherence.length === 0 ? (
            <p className="text-sm text-faint py-4">{t('clients.overview.noSessions')}</p>
          ) : (
            <div className="h-32 flex items-end gap-1 mt-4">
              {adherence.slice(-12).map(a => {
                const percent = Math.min(100, Math.round((a.count / prescribedSessions) * 100))
                return (
                  <div key={a.week} className="flex-1 flex flex-col justify-end group relative">
                    <div 
                      className={`w-full rounded-t-sm transition-all ${percent >= 100 ? 'bg-verde-600' : percent >= 66 ? 'bg-verde-600/50' : 'bg-ember-500'}`}
                      style={{ height: `${(a.count / maxAdherence) * 100}%`, minHeight: '4px' }}
                    />
                    <div className="absolute bottom-full start-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-[#171A1E] text-white text-xs rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-10">
                      {t('clients.overview.adherenceLabel', { count: a.count, percent })}
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
          <SectionHeader title={t('clients.overview.recentPrsTitle')} />
          <div className="divide-y divide-line -mx-4 -mb-4 mt-2">
            {recentPRs.map(pr => (
              <div key={pr.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">{exMap[pr.exerciseId] || t('clients.overview.unknownExercise')}</p>
                  <p className="text-xs text-faint font-mono tabular-nums mt-0.5">{pr.date}</p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-end">
                    <p className="text-sm font-medium">
                      {pr.type === 'load' ? t('clients.overview.loadPr', { value: pr.value }) : pr.type === 'rep' ? t('clients.overview.repPr', { value: pr.value, load: pr.load }) : t('clients.overview.est1rmPr', { value: pr.value })}
                    </p>
                    <p className="text-xs text-muted font-mono tabular-nums">
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
