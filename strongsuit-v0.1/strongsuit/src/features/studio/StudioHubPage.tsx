import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Users, MapPin, Wallet, Trophy, BarChart3, Lock } from 'lucide-react'
import { Card, SectionHeader, Stat } from '@/design'
import { staffRepo, locationsRepo, clientsRepo, paymentsRepo, trainerRepo } from '@/db/repo'
import { editionCapabilities, EDITION_NAMES } from '@/lib/edition'
import { totalCommissionsForMonth } from '@/lib/business'
import { format } from 'date-fns'

function HubLink({ to, icon: Icon, label, value }: { to: string; icon: typeof Wallet; label: string; value: string }) {
  return (
    <Link to={to}>
      <Card className="flex items-center justify-between transition-colors hover:border-verde-600/40">
        <div className="flex items-center gap-2.5">
          <Icon size={16} className="text-verde-600" strokeWidth={1.5} />
          <span className="text-sm font-medium text-ink">{label}</span>
        </div>
        <span className="text-xs text-faint">{value}</span>
      </Card>
    </Link>
  )
}

export default function StudioHubPage() {
  const trainer = useLiveQuery(() => trainerRepo.get())
  const staff = useLiveQuery(() => staffRepo.all(), [], [])
  const locations = useLiveQuery(() => locationsRepo.all(), [], [])
  const clients = useLiveQuery(() => clientsRepo.active(), [], [])
  const payments = useLiveQuery(() => paymentsRepo.all(), [], [])
  const cap = editionCapabilities(trainer?.edition)
  const thisMonth = format(new Date(), 'yyyy-MM')

  if (trainer === undefined) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionHeader title="Studio Hub" />
        <Card className="animate-pulse text-sm text-faint">Loading…</Card>
      </div>
    )
  }

  if (!cap.multiSeat) {
    return (
      <div className="mx-auto max-w-4xl">
        <SectionHeader title="Studio Hub" />
        <Card className="flex flex-col items-center gap-3 py-10 text-center">
          <Lock size={28} className="text-faint" strokeWidth={1.5} />
          <p className="max-w-md text-sm text-muted">{cap.upgradeReason}</p>
          <p className="text-2xs text-faint">Currently on {EDITION_NAMES[cap.edition]}.</p>
        </Card>
      </div>
    )
  }

  const totalCommission = totalCommissionsForMonth(staff, clients, payments, thisMonth)
  const activeStaffCount = staff.filter(s => s.active).length

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <SectionHeader title="Studio Hub" />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card><Stat label="Roster" value={clients.length} /></Card>
        <Card><Stat label="Active staff" value={activeStaffCount} /></Card>
        <Card><Stat label="Locations" value={locations.length} /></Card>
        <Card><Stat label="Commissions this month" value={`$${totalCommission.toFixed(2)}`} tone={totalCommission > 0 ? 'ember' : 'ink'} /></Card>
      </div>

      <div>
        <p className="mb-3 text-sm font-semibold text-muted">Studio</p>
        <div className="space-y-2">
          <HubLink to="/team" icon={Users} label="Team & locations" value={`${staff.length} staff · ${locations.length} location${locations.length === 1 ? '' : 's'}`} />
          <HubLink to="/business" icon={Wallet} label="Business" value="Profit planner, ledger, invoices" />
          <HubLink to="/leaderboard" icon={Trophy} label="Leaderboards" value="Cross-client rankings" />
          <HubLink to="/reports" icon={BarChart3} label="Reports" value="Cross-client analytics" />
        </div>
      </div>

      {locations.length > 0 && (
        <div>
          <p className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted"><MapPin size={14} /> Locations</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {locations.map(l => {
              const count = clients.filter(c => c.locationId === l.id).length
              return (
                <Link key={l.id} to={`/locations/${l.id}`}>
                  <Card className="flex items-center justify-between transition-colors hover:border-verde-600/40">
                    <span className="text-sm text-ink">{l.name}</span>
                    <span className="text-2xs text-faint">{count} client{count === 1 ? '' : 's'}</span>
                  </Card>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
