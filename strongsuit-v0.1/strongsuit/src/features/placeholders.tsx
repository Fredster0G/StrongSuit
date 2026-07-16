import { Dumbbell, CalendarDays, Wallet, BarChart3 } from 'lucide-react'
import { SectionHeader, EmptyState, Card, Button, Stat, Tag, PRTag, Kbd, Input, Field, Tabs, Avatar } from '@/design'
import { useState } from 'react'

// Every placeholder is a *designed* empty state (spec §0.5), not a blank div.
// Each names the phase that replaces it so any AI continuing the build knows the wiring point.


export function ExercisesPage() {
  return (
    <div>
      <SectionHeader title="Exercises" />
      <EmptyState
        icon={<Dumbbell size={28} strokeWidth={1.25} />}
        title="Your exercise library"
        body="Ships seeded with 350+ movements, each with cues and your own video links. Build order: Phase 3."
      />
    </div>
  )
}

export function CalendarPage() {
  return (
    <div>
      <SectionHeader title="Calendar" />
      <EmptyState
        icon={<CalendarDays size={28} strokeWidth={1.25} />}
        title="Schedule"
        body="Week and day views with drag-to-reschedule. Build order: Phase 8."
      />
    </div>
  )
}

export function BusinessPage() {
  return (
    <div>
      <SectionHeader title="Business" />
      <EmptyState
        icon={<Wallet size={28} strokeWidth={1.25} />}
        title="Your ledger"
        body="Payments, session packs, and monthly income — a ledger you own, not a processor. Build order: Phase 8."
      />
    </div>
  )
}

export function ReportsPage() {
  return (
    <div>
      <SectionHeader title="Reports" />
      <EmptyState
        icon={<BarChart3 size={28} strokeWidth={1.25} />}
        title="Cross-client analytics"
        body="Adherence, volume, and PR feeds across your whole roster. Build order: Phase 6 per client, Phase 8+ here."
      />
    </div>
  )
}

/** Internal design QA route (spec Phase 0 gate). Not linked in nav. */
export function KitchenSink() {
  const [tab, setTab] = useState('a')
  return (
    <div className="space-y-6">
      <SectionHeader title="Kitchen sink" action={<Button size="sm" onClick={() => document.documentElement.classList.toggle('dark')}>Toggle dark</Button>} />
      <Card className="space-x-2">
        <Button variant="primary">Save program</Button>
        <Button>Export companion</Button>
        <Button variant="ghost">Cancel</Button>
        <Button variant="destructive">Delete forever</Button>
      </Card>
      <Card className="flex items-center gap-4">
        <Stat label="e1RM" value="315.5" unit="lb" />
        <Stat label="Tonnage" value="12,480" unit="lb" tone="verde" />
        <Stat label="Overdue" value="3" tone="ember" />
        <PRTag>PR ▲ 5 lb</PRTag>
        <Tag tone="verde">active</Tag>
        <Tag tone="ember">7d stale</Tag>
        <Kbd>⌘K</Kbd>
        <Avatar person={{ firstName: 'Jordan', lastName: 'Fields' }} />
      </Card>
      <Card>
        <Tabs tabs={[{ id: 'a', label: 'Overview' }, { id: 'b', label: 'Logs' }]} active={tab} onChange={setTab} />
        <div className="pt-3">
          <Field label="Load" hint="mono numerals"><Input className="font-mono tnum max-w-[120px]" defaultValue="225" /></Field>
        </div>
      </Card>
    </div>
  )
}
