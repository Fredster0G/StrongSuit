import { NavLink, Outlet } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  LayoutDashboard, Users, ClipboardList, Dumbbell, Clapperboard,
  CalendarDays, Wallet, BarChart3, Settings, ShieldCheck, ShieldAlert, Loader2
} from 'lucide-react'
import { trainerRepo } from '@/db/repo'
import { daysSince } from '@/lib/core'
import { Toaster } from '@/design'
import CommandPalette from '@/features/shell/CommandPalette'
import OnboardingWizard from '@/features/onboarding/OnboardingWizard'

const NAV = [
  { to: '/', label: 'Today', icon: LayoutDashboard, end: true },
  { to: '/clients', label: 'Clients', icon: Users },
  { to: '/programs', label: 'Programs', icon: ClipboardList },
  { to: '/exercises', label: 'Exercises', icon: Dumbbell },
  { to: '/film-room', label: 'Film Room', icon: Clapperboard },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/business', label: 'Business', icon: Wallet },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
]

function BackupHealth() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const days = daysSince(trainer?.lastBackupAt)
  const stale = days === null || days >= 7
  return (
    <NavLink
      to="/settings"
      className="flex items-center gap-2 rounded-ctl px-3 py-2 text-xs text-muted hover:bg-surface"
      title={days === null ? 'No backup yet' : `Last backup ${days}d ago`}
    >
      {stale
        ? <ShieldAlert size={15} className="text-ember-600" />
        : <ShieldCheck size={15} className="text-verde-600" />}
      <span className="font-mono tnum">
        {days === null ? 'No backup yet' : days === 0 ? 'Backed up today' : `Backup ${days}d ago`}
      </span>
    </NavLink>
  )
}

export default function Shell() {
  const trainer = useLiveQuery(() => trainerRepo.getOrCreate(), [], null)

  if (trainer === null) {
    return <div className="h-screen flex items-center justify-center bg-bg"><Loader2 className="animate-spin text-faint" /></div>
  }

  if (!trainer.onboardingComplete) {
    return <OnboardingWizard trainer={trainer} />
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-52 shrink-0 flex-col border-r border-line bg-surface">
        <div className="px-4 pb-4 pt-5">
          <p className="font-display text-base font-bold tracking-tight text-ink">Strongsuit</p>
          <p className="text-2xs text-faint">Coaching workstation</p>
        </div>
        <nav className="flex-1 space-y-0.5 px-2">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }: { isActive: boolean }) =>
                // Signature element #4: 3px verde spine on the active item
                `relative flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-verde-100/60 text-ink before:absolute before:inset-y-1.5 before:left-0 before:w-[3px] before:rounded-full before:bg-verde-600'
                    : 'text-muted hover:bg-surface2 hover:text-ink'
                }`
              }
            >
              <Icon size={16} strokeWidth={1.5} />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-line p-2">
          <BackupHealth />
          <NavLink
            to="/settings"
            className={({ isActive }: { isActive: boolean }) =>
              `flex items-center gap-2.5 rounded-ctl px-3 py-2 text-sm font-medium ${
                isActive ? 'bg-verde-100/60 text-ink' : 'text-muted hover:bg-surface2 hover:text-ink'
              }`
            }
          >
            <Settings size={16} strokeWidth={1.5} />
            Settings
          </NavLink>
        </div>
      </aside>
      <main className="panel-scroll min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <Outlet />
        </div>
      </main>
      <Toaster />
      <CommandPalette />
    </div>
  )
}
