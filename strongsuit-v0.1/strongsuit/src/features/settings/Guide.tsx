import type { ReactNode } from 'react'
import {
  BookOpen, ChevronDown, Rocket, Users, ClipboardList, PenLine,
  Clapperboard, Apple, Gauge, Wallet, Smartphone, ShieldCheck, Keyboard, Lock,
} from 'lucide-react'
import { Card, Kbd } from '@/design'
import { APP_NAME } from '@/lib/brand'

function Section({ icon, title, children, defaultOpen }: {
  icon: ReactNode; title: string; children: ReactNode; defaultOpen?: boolean
}) {
  return (
    <details open={defaultOpen} className="group border-b border-line last:border-0">
      <summary className="flex cursor-pointer list-none items-center gap-2.5 py-3 text-sm font-semibold text-ink [&::-webkit-details-marker]:hidden">
        <span className="text-verde-600">{icon}</span>
        {title}
        <ChevronDown size={16} className="ml-auto text-faint transition-transform group-open:rotate-180" />
      </summary>
      <div className="space-y-2 pb-4 pl-[26px] text-sm leading-relaxed text-muted">{children}</div>
    </details>
  )
}

/** Numbered step list with tabular-numeral markers. */
function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="space-y-1.5">
      {items.map((it, i) => (
        <li key={i} className="flex gap-2.5">
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-verde-100 font-mono text-2xs font-semibold text-verde-700">{i + 1}</span>
          <span>{it}</span>
        </li>
      ))}
    </ol>
  )
}

const B = ({ children }: { children: ReactNode }) => <span className="font-medium text-ink">{children}</span>

export default function Guide() {
  return (
    <Card>
      <div className="mb-2 flex items-center gap-2">
        <BookOpen size={16} className="text-verde-600" />
        <p className="font-display text-base font-semibold">Guide &amp; tutorial</p>
      </div>
      <p className="mb-2 text-xs text-muted">
        Everything {APP_NAME} does, start to finish. Open any section. Nothing here talks to the internet — this manual ships inside the app.
      </p>

      <div>
        <Section icon={<Rocket size={16} />} title="The big idea (read this first)" defaultOpen>
          <p>
            {APP_NAME} is a coaching workstation you <B>own</B>. There is no account, no login, no cloud, and no subscription. Every client, program, and session lives in this browser on this device — which is why your data is private and your cost is zero after you buy it.
          </p>
          <p>
            The one trade-off: because nothing syncs to a server, <B>you are responsible for backups</B>. That is one click (see “Back up &amp; move machines”). Do it weekly and you are safe.
          </p>
        </Section>

        <Section icon={<Users size={16} />} title="Set up your brand & add clients">
          <Steps items={[
            <>In <B>Settings → Brand kit</B>, set your business name, your name, units, and theme. Your brand shows on Companion files and printed docs.</>,
            <>Open <B>Clients → New client</B>. Name and start date are all you need to begin; goals and injuries can come later.</>,
            <>Injuries you enter show as an <B>amber ribbon</B> on the client and inside the program builder, so you never miss a limitation.</>,
            <>Archive clients you’re not training (their history is kept). Permanent delete lives in <B>Settings → Danger zone</B>, behind a typed confirmation.</>,
          ]} />
        </Section>

        <Section icon={<ClipboardList size={16} />} title="Build a program">
          <Steps items={[
            <>Go to <B>Programs → New</B>. A program is weeks → days → blocks → exercises.</>,
            <>Press <Kbd>/</Kbd> to focus the exercise search. Type gym slang — “rdl”, “ohp”, “bss” — and aliases resolve it instantly.</>,
            <>Edit sets, reps, and load like a spreadsheet; arrow keys move between cells. Drag rows to reorder, or drag one onto another to make a superset.</>,
            <><B>Duplicate week</B> is the fastest way to progress — it can auto-add load or reps. Undo/redo (<Kbd>⌘Z</Kbd>) covers everything.</>,
            <>Save any program as a <B>template</B>, then start new clients from it. <B>Assign to client</B> makes it active and drives their logger and Companion file.</>,
          ]} />
        </Section>

        <Section icon={<PenLine size={16} />} title="Log sessions & read progress">
          <p>
            From a client or the dashboard, <B>Log session</B> opens the prescribed day pre-filled with targets. Tap in actuals, check off sets, add RPE. Big touch targets — it works on the gym floor on a phone.
          </p>
          <p>
            Tap any exercise to open its <B>history drawer</B>: last five performances, an e1RM trend, a <B>Suggested next</B> load with the reasoning behind it, and a percent-based warm-up ramp.
          </p>
        </Section>

        <Section icon={<Clapperboard size={16} />} title="Film Room — full walkthrough">
          <p className="text-ink">Compare movement side-by-side or overlaid, frame by frame, with on-device tracking. Videos never leave your computer.</p>
          <Steps items={[
            <><B>Load videos.</B> “Client video” is the one that gets tracked; “Reference video” is your model rep (a coach demo, or the client’s own PR). Either works alone.</>,
            <><B>Controls for each video.</B> In side-by-side, every clip has its own transport bar — play/pause, one-frame steps, and a scrubber. Control them independently to line up the same moment in each.</>,
            <><B>Lock sync.</B> Scrub both to the same point (e.g. the start of the descent), then <B>Lock sync here</B>. Now one bar drives both, holding the offset. Unlock to separate them again.</>,
            <><B>Overlay & blend.</B> Switch to <B>Overlay</B> to stack the clips; the blend slider fades between them to see exactly where paths diverge.</>,
            <><B>Flip.</B> <B>Flip client</B> / <B>Flip ref</B> mirror a clip horizontally so a left-facing and right-facing lifter line up.</>,
            <><B>Frame rate.</B> Set it to how the clip was shot (24/30/60/120) so one-frame steps and tempo are accurate. Slow playback to 0.25× for detail.</>,
            <><B>Measure.</B> <B>Line</B> draws a bar path or back angle (two clicks). <B>Angle</B> measures a joint (three clicks — the middle click is the joint).</>,
          ]} />
          <p className="mt-2">
            <B>Track movement</B> turns on the AI: a live skeleton, joint angles, and a readout of reps, tempo (down/up seconds), depth as a % of range, and left/right symmetry %. Play through a few reps and it calibrates itself and picks the working joint automatically. The first time you turn it on it loads the tracking model from inside the app (a moment on slow machines) — after that it’s instant, and always offline.
          </p>
        </Section>

        <Section icon={<Apple size={16} />} title="Nutrition targets">
          <p>
            On a client’s <B>Nutrition</B> tab, fill in sex, height, birth date, activity, and goal, and log one bodyweight. {APP_NAME} computes calories and macros (protein, carbs, fat), plus fiber and water.
          </p>
          <p>
            Every number is followed by a <B>“Why these numbers”</B> section that cites the research behind it (Mifflin-St Jeor for metabolism, Morton et al. for protein, and so on). It’s built on published sports-nutrition consensus — not medical advice; send clients with medical conditions to a dietitian or physician.
          </p>
        </Section>

        <Section icon={<Gauge size={16} />} title="Readiness score">
          <p>
            Log a client’s check-in (sleep, energy, mood, adherence) and the <B>Check-ins</B> tab shows a 0–100 <B>readiness</B> score with a green/amber/red band and a coaching cue — train hard, cap intensity, or back off. It names what drove the score and the model behind it.
          </p>
        </Section>

        <Section icon={<Wallet size={16} />} title="Business — profit, expenses & the gym’s cut">
          <Steps items={[
            <>Record client payments on their <B>Billing</B> tab. They aggregate on the <B>Business</B> page.</>,
            <><B>Profit planner:</B> set the profit you need this month. {APP_NAME} subtracts expenses and shows the gap, a month-end projection, and roughly how many more sessions it takes to hit your goal.</>,
            <><B>Expenses:</B> add rent, insurance, software, and the like. Monthly ones carry forward automatically.</>,
            <><B>The gym’s cut:</B> on a client’s Billing tab, set what the facility takes — a <B>percent</B> of their income or a <B>flat monthly fee</B>. It’s subtracted from your real profit on the Business page, so the number you see is what you actually keep.</>,
          ]} />
        </Section>

        <Section icon={<Smartphone size={16} />} title="Companion files (send programs to clients)">
          <p>
            From a client with an active program, <B>Export Companion</B> builds a single HTML file — your brand, their workout — that they open in any browser with no app and no account. They tick off sets and answer check-ins; a <B>Send to coach</B> button hands back a small data file you import from Settings. It merges in as logged sessions and check-ins, de-duplicated automatically.
          </p>
        </Section>

        <Section icon={<ShieldCheck size={16} />} title="Back up & move machines">
          <Steps items={[
            <><B>Back up now</B> (below) saves one file with everything in it. Add a passphrase to encrypt it — but there’s no recovery, so store the passphrase safely.</>,
            <>The shield in the sidebar tracks days since your last backup and turns amber at seven. Keep it green.</>,
            <>Moving to a new computer? Install {APP_NAME} there, then <B>Restore → Replace everything</B> from your backup. To combine two devices’ data, use <B>Merge</B> — the newest version of each record wins.</>,
          ]} />
        </Section>

        <Section icon={<Keyboard size={16} />} title="Keyboard shortcuts">
          <ul className="space-y-1.5">
            <li><Kbd>⌘K</Kbd> / <Kbd>Ctrl K</Kbd> — command palette: jump anywhere, do anything</li>
            <li><Kbd>/</Kbd> — focus exercise search in the program builder</li>
            <li><Kbd>⌘Z</Kbd> / <Kbd>⇧⌘Z</Kbd> — undo / redo in the builder</li>
            <li><Kbd>Space</Kbd> — play/pause in the Film Room</li>
            <li><Kbd>←</Kbd> <Kbd>→</Kbd> — step one frame (hold <Kbd>⇧</Kbd> for five) in the Film Room</li>
          </ul>
        </Section>

        <Section icon={<Lock size={16} />} title="Privacy & how it works">
          <p>
            There is no server to breach because there is no server. The app is static files; your data sits in this browser’s storage. The movement-tracking AI is an open-source model bundled inside the app — it runs on your device with <B>no API keys and no network calls</B>. The only time anything leaves is when <B>you</B> choose to: downloading a backup, exporting a Companion file, or opening an exercise video link you added.
          </p>
        </Section>
      </div>
    </Card>
  )
}
