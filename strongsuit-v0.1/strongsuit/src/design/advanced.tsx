import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type DragEvent } from 'react'
import { Check, ChevronDown, Minus, Plus, UploadCloud } from 'lucide-react'

// ============ Toggle ============
export function Toggle({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  /** Accessible name — the mockups always pair Toggle with adjacent visible
   *  text, but a screen reader needs the switch itself labelled too. */
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-[34px] shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        checked ? 'bg-verde-600' : 'bg-line'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-raise transition-transform ${
          checked ? 'translate-x-[16px]' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

// ============ Checkbox ============
export function Checkbox({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[3px] border-[1.5px] transition-colors disabled:opacity-50 disabled:pointer-events-none ${
        checked ? 'border-verde-600 bg-verde-600' : 'border-line bg-surface hover:border-faint'
      }`}
    >
      {checked && <Check size={11} strokeWidth={3} className="text-white" />}
    </button>
  )
}

// ============ SegmentedControl ============
export interface SegmentedOption { value: string; label: string; disabled?: boolean; title?: string }

/** A compact pill-group for FILTERING or SWITCHING a small fixed set of views
 *  (Roster's status filter, Business's overview/ledger/invoices) — distinct
 *  from `Tabs`, which is page-level underline navigation. */
export function SegmentedControl({ options, value, onChange }: {
  options: SegmentedOption[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div role="radiogroup" className="inline-flex items-center gap-0.5 rounded-ctl border border-line bg-surface2 p-0.5">
      {options.map(o => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={`rounded-[4px] px-3 py-1 text-xs font-medium transition-colors disabled:opacity-40 disabled:pointer-events-none ${
            o.value === value ? 'bg-surface text-ink shadow-raise' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// ============ Progress ============
export function Progress({ value, max = 100, className = '' }: {
  value: number
  max?: number
  className?: string
}) {
  // Clamped rather than trusting the caller — a value outside [0,max] would
  // otherwise draw a fill that overflows or vanishes rather than reading as
  // "very high" or "very low", which is the honest failure mode here.
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0
  return (
    <div
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      className={`h-1.5 w-full overflow-hidden rounded-full bg-line ${className}`}
    >
      <div className="h-full rounded-full bg-verde-600 transition-[width]" style={{ width: `${pct}%` }} />
    </div>
  )
}

// ============ NumericStepper ============

/**
 * Clamp `v` to [min, max] and round it to `step`'s own decimal precision.
 *
 * Exported and pure so it's unit-testable without rendering anything — this
 * project has never had a component-test harness (`vite.config.ts` runs
 * vitest in a `node` environment against `*.test.ts` only, no jsdom/RTL), and
 * introducing one for two primitives would be a bigger decision than Phase 1
 * calls for. The rounding matters on its own: without it, repeated 0.1 steps
 * accumulate floating-point noise (0.1 + 0.1 + 0.1 !== 0.3) into the
 * displayed value.
 */
export function clampToStep(v: number, opts: { min?: number; max?: number; step?: number } = {}): number {
  let out = v
  if (opts.min != null) out = Math.max(opts.min, out)
  if (opts.max != null) out = Math.min(opts.max, out)
  const decimals = (String(opts.step ?? 1).split('.')[1] ?? '').length
  return Number(out.toFixed(decimals))
}

export function NumericStepper({ value, onChange, min, max, step = 1, className = '' }: {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  className?: string
}) {
  function clamp(v: number): number {
    return clampToStep(v, { min, max, step })
  }

  function bump(delta: number) {
    onChange(clamp(value + delta))
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowUp') { e.preventDefault(); bump(step) }
    else if (e.key === 'ArrowDown') { e.preventDefault(); bump(-step) }
  }

  function onInputChange(raw: string) {
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n)) return // let the field hold an in-progress edit rather than snapping back
    onChange(clamp(n))
  }

  return (
    <div className={`flex h-9 items-stretch overflow-hidden rounded-ctl border border-line bg-surface ${className}`}>
      <button
        type="button"
        aria-label="Decrease"
        onClick={() => bump(-step)}
        disabled={min != null && value <= min}
        className="flex w-8 shrink-0 items-center justify-center bg-surface2 text-muted transition-colors hover:bg-iron-200 hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
      >
        <Minus size={13} />
      </button>
      <input
        type="text"
        inputMode="decimal"
        role="spinbutton"
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={value}
        onChange={e => onInputChange(e.target.value)}
        onKeyDown={onKeyDown}
        className="w-full min-w-0 flex-1 border-x border-line bg-transparent text-center font-mono tabular-nums text-sm text-ink outline-none"
      />
      <button
        type="button"
        aria-label="Increase"
        onClick={() => bump(step)}
        disabled={max != null && value >= max}
        className="flex w-8 shrink-0 items-center justify-center bg-surface2 text-muted transition-colors hover:bg-iron-200 hover:text-ink disabled:opacity-30 disabled:pointer-events-none"
      >
        <Plus size={13} />
      </button>
    </div>
  )
}

// ============ Combobox ============
export interface ComboboxOption { value: string; label: string }

/**
 * Case-insensitive substring filter — exported and pure for the same reason
 * as `clampToStep` above.
 *
 * Deliberately NOT wired to `lib/fuzzy.ts`'s `createFuzzyIndex`, which is
 * built for the specific case of a 350+-row exercise library with aliases
 * (see `ExerciseSearch.tsx`). Coupling a generic primitive to that index
 * would be solving a problem this component doesn't have; a caller with a
 * large fuzzy-searchable list can pre-filter `options` itself before handing
 * them to `Combobox`.
 */
export function filterOptions(options: ComboboxOption[], query: string): ComboboxOption[] {
  const q = query.trim().toLowerCase()
  if (!q) return options
  return options.filter(o => o.label.toLowerCase().includes(q))
}

/** Single-select typeahead over a small-to-medium option list (client
 *  switchers, field pickers). */
export function Combobox({ options, value, onChange, placeholder }: {
  options: ComboboxOption[]
  value: ComboboxOption | null
  onChange: (option: ComboboxOption) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => filterOptions(options, query), [options, query])

  useEffect(() => { setActiveIndex(0) }, [filtered.length, open])

  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [open])

  function select(o: ComboboxOption) {
    onChange(o)
    setOpen(false)
    setQuery('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setOpen(true)
      setActiveIndex(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[activeIndex]) select(filtered[activeIndex])
    } else if (e.key === 'Escape') {
      setOpen(false)
      setQuery('')
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          value={open ? query : (value?.label ?? '')}
          placeholder={placeholder}
          onFocus={() => { setOpen(true); setQuery('') }}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onKeyDown={onKeyDown}
          className="h-9 w-full rounded-ctl border border-line bg-surface px-2.5 pe-8 text-sm text-ink placeholder:text-faint focus:border-verde-600 focus:outline-none"
        />
        <ChevronDown size={14} className="pointer-events-none absolute end-2.5 top-1/2 -translate-y-1/2 text-faint" />
      </div>
      {open && (
        <div className="panel-scroll absolute z-10 mt-1 w-full space-y-0.5 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-modal" style={{ maxHeight: 220 }}>
          {filtered.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-faint">No matches.</p>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.value}
                type="button"
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => select(o)}
                className={`block w-full truncate rounded px-2.5 py-1.5 text-start text-sm transition-colors ${
                  i === activeIndex ? 'bg-verde-100 text-verde-700' : 'text-ink hover:bg-surface2'
                }`}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ============ FileDropzone ============
/** Drag-and-drop or click-to-browse file picker (First Run's logo/roster
 *  upload). `accept` matches the native input attribute; `onFile` fires once
 *  per selection, whether it arrived by drop or by the file dialog. */
export function FileDropzone({ onFile, accept, hint, className = '' }: {
  onFile: (file: File) => void
  accept?: string
  hint?: string
  className?: string
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed px-4 py-8 text-center transition-colors ${
        dragOver ? 'border-verde-600 bg-verde-100/40' : 'border-line hover:border-verde-600/40'
      } ${className}`}
    >
      <UploadCloud size={24} className={dragOver ? 'text-verde-600' : 'text-faint'} />
      <p className="text-sm font-medium text-ink">Drop a file here, or click to browse</p>
      {hint && <p className="text-2xs text-faint">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }}
      />
    </div>
  )
}
