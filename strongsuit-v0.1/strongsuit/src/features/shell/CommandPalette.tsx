import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Search, User, Settings, Plus, LayoutDashboard, Users, ClipboardList, Dumbbell,
  Clapperboard, CalendarDays, Wallet, BarChart3, UserCog, UserPlus, Trophy, RadioTower, Download,
} from 'lucide-react'
import { Dialog } from '@/design'
import { clientsRepo, trainerRepo } from '@/db/repo'
import { exportBackup, downloadText } from '@/db/backup'
import { nowIso } from '@/lib/core'
import { createFuzzyIndex } from '@/lib/fuzzy'
import { fullName } from '@/lib/core'
import type { ModuleKey } from '@/db/types'

const NAV_ACTIONS: { to: string; title: string; icon: React.ReactNode; module?: ModuleKey }[] = [
  { to: '/', title: 'Go to Today', icon: <LayoutDashboard size={18} className="text-muted" /> },
  { to: '/clients', title: 'Go to Clients', icon: <Users size={18} className="text-muted" /> },
  { to: '/programs', title: 'Go to Programs', icon: <ClipboardList size={18} className="text-muted" /> },
  { to: '/exercises', title: 'Go to Exercises', icon: <Dumbbell size={18} className="text-muted" /> },
  { to: '/film-room', title: 'Go to Film Room', icon: <Clapperboard size={18} className="text-muted" />, module: 'filmRoom' },
  { to: '/calendar', title: 'Go to Calendar', icon: <CalendarDays size={18} className="text-muted" />, module: 'calendar' },
  { to: '/business', title: 'Go to Business', icon: <Wallet size={18} className="text-muted" />, module: 'business' },
  { to: '/team', title: 'Go to Team', icon: <UserCog size={18} className="text-muted" />, module: 'team' },
  { to: '/leads', title: 'Go to Leads', icon: <UserPlus size={18} className="text-muted" />, module: 'leads' },
  { to: '/leaderboard', title: 'Go to Leaderboards', icon: <Trophy size={18} className="text-muted" />, module: 'leaderboard' },
  { to: '/sync', title: 'Go to Studio Link', icon: <RadioTower size={18} className="text-muted" />, module: 'sync' },
  { to: '/reports', title: 'Go to Reports', icon: <BarChart3 size={18} className="text-muted" />, module: 'reports' },
]

interface Action {
  id: string
  title: string
  subtitle?: string
  icon: React.ReactNode
  onSelect: () => void
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const navigate = useNavigate()
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for Cmd+K / Ctrl+K
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const clients = useLiveQuery(() => clientsRepo.all(), [], [])
  const trainer = useLiveQuery(() => trainerRepo.get())
  const hiddenModules = trainer?.hiddenModules ?? []

  const actions = useMemo<Action[]>(() => {
    const arr: Action[] = [
      {
        id: 'settings',
        title: 'Settings',
        subtitle: 'Brand kit, backups, preferences',
        icon: <Settings size={18} className="text-muted" />,
        onSelect: () => navigate('/settings')
      },
      {
        id: 'new-client',
        title: 'Add Client',
        subtitle: 'Create a new client profile',
        icon: <Plus size={18} className="text-verde-600" />,
        onSelect: () => navigate('/clients?new=true')
      },
      {
        id: 'new-program',
        title: 'Create Program',
        icon: <Plus size={18} className="text-verde-600" />,
        onSelect: () => navigate('/programs') // User can click new program there
      },
      {
        id: 'backup-now',
        title: 'Back up now',
        subtitle: 'Download a plain backup file',
        icon: <Download size={18} className="text-verde-600" />,
        onSelect: () => {
          exportBackup().then(({ filename, text }) => {
            downloadText(filename, text)
            trainerRepo.patch({ lastBackupAt: nowIso() })
          })
        },
      },
    ]

    for (const nav of NAV_ACTIONS) {
      if (nav.module && hiddenModules.includes(nav.module)) continue
      arr.push({ id: `nav-${nav.to}`, title: nav.title, icon: nav.icon, onSelect: () => navigate(nav.to) })
    }

    for (const c of clients) {
      arr.push({
        id: `client-${c.id}`,
        title: fullName(c),
        subtitle: 'Client',
        icon: <User size={18} className="text-muted" />,
        onSelect: () => navigate(`/clients/${c.id}`)
      })
    }

    return arr
  }, [clients, navigate, hiddenModules])

  const searchIndex = useMemo(() => createFuzzyIndex(actions, a => [a.title, a.subtitle || '']), [actions])

  const results = useMemo(() => {
    if (!query.trim()) return actions.slice(0, 8)
    const hits = searchIndex(query)
    hits.sort((a, b) => b.score - a.score)
    return hits.filter(h => h.score > 0).map(h => h.item).slice(0, 8)
  }, [query, actions, searchIndex])

  // Reset selection when query changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  // Handle keyboard navigation within the dialog
  function handleInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(i => Math.min(i + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const action = results[selectedIndex]
      if (action) {
        setOpen(false)
        action.onSelect()
      }
    }
  }

  function handleClose() {
    setOpen(false)
    setQuery('')
  }

  if (!open) return null

  return (
    <Dialog open={open} onClose={handleClose} title="">
      <div className="-mt-4 -mx-4 -mb-4">
        <div className="flex items-center px-4 py-3 border-b border-line">
          <Search size={20} className="text-muted mr-3" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none outline-none text-ink placeholder-faint text-lg"
            placeholder="Search clients, actions..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            autoFocus
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 bg-surface border border-line rounded px-2 py-1 text-xs text-faint font-mono">
            ESC
          </kbd>
        </div>
        
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {results.length === 0 ? (
            <div className="py-8 text-center text-faint">No results found.</div>
          ) : (
            results.map((action, i) => {
              const isSelected = i === selectedIndex
              return (
                <button
                  key={action.id}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded text-left transition-colors ${isSelected ? 'bg-verde-100/60' : 'hover:bg-surface2'}`}
                  onMouseEnter={() => setSelectedIndex(i)}
                  onClick={() => {
                    handleClose()
                    action.onSelect()
                  }}
                >
                  <div className="flex-shrink-0">{action.icon}</div>
                  <div>
                    <div className="font-medium text-ink">{action.title}</div>
                    {action.subtitle && <div className="text-xs text-muted mt-0.5">{action.subtitle}</div>}
                  </div>
                </button>
              )
            })
          )}
        </div>
      </div>
    </Dialog>
  )
}
