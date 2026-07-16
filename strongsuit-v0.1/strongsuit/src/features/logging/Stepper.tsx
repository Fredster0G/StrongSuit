import { useState, useEffect } from 'react'
import { Minus, Plus } from 'lucide-react'

interface StepperProps {
  value: number | undefined
  onChange: (val: number | undefined) => void
  step?: number
  min?: number
  max?: number
  placeholder?: string
  className?: string
}

export function Stepper({ 
  value, 
  onChange, 
  step = 1, 
  min = 0, 
  max,
  placeholder = '-',
  className = '',
}: StepperProps) {
  // We keep a local string state to allow user to temporarily type empty or invalid numbers
  const [local, setLocal] = useState(value == null ? '' : String(value))

  useEffect(() => {
    setLocal(value == null ? '' : String(value))
  }, [value])

  const handleBlur = () => {
    if (local === '') {
      onChange(undefined)
      return
    }
    const num = parseFloat(local)
    if (isNaN(num)) {
      setLocal(value == null ? '' : String(value)) // revert
    } else {
      // Clamp to min/max if provided
      let clamped = num
      if (min !== undefined && clamped < min) clamped = min
      if (max !== undefined && clamped > max) clamped = max
      onChange(clamped)
      setLocal(String(clamped))
    }
  }

  const handleAdjust = (delta: number) => {
    const current = value ?? 0
    let next = current + delta
    if (min !== undefined && next < min) next = min
    if (max !== undefined && next > max) next = max
    // round to avoid float weirdness
    next = Math.round(next * 100) / 100
    onChange(next)
  }

  return (
    <div className={`flex items-stretch rounded-md border border-line bg-surface overflow-hidden ${className}`}>
      <button
        type="button"
        onClick={() => handleAdjust(-step)}
        className="flex items-center justify-center px-3 bg-iron-50 hover:bg-iron-100 active:bg-iron-200 dark:bg-iron-900 dark:hover:bg-iron-800 text-faint transition-colors"
      >
        <Minus size={18} />
      </button>
      
      <input
        type="text"
        inputMode="decimal"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="w-16 min-w-0 text-center bg-transparent py-2 text-base font-semibold text-ink focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-500"
      />

      <button
        type="button"
        onClick={() => handleAdjust(step)}
        className="flex items-center justify-center px-3 bg-iron-50 hover:bg-iron-100 active:bg-iron-200 dark:bg-iron-900 dark:hover:bg-iron-800 text-faint transition-colors"
      >
        <Plus size={18} />
      </button>
    </div>
  )
}
