import { ulid } from 'ulid'
import { format } from 'date-fns'

export const newId = () => ulid()
export const nowIso = () => new Date().toISOString()
export const today = () => format(new Date(), 'yyyy-MM-dd')

/** Stamp create fields onto a partial entity. */
export function stamp<T extends { id?: string }>(x: T) {
  const t = nowIso()
  return { ...x, id: x.id ?? newId(), createdAt: t, updatedAt: t }
}

/** Epley estimated 1RM (spec §4.6). reps>0. */
export function e1rm(load: number, reps: number): number {
  if (reps <= 0 || load <= 0) return 0
  if (reps === 1) return load
  return Math.round(load * (1 + reps / 30) * 10) / 10
}

/** Volume load for a set. */
export const setTonnage = (load?: number, reps?: number) =>
  (load ?? 0) * (reps ?? 0)

export const KG_PER_LB = 0.45359237
export const lbToKg = (lb: number) => Math.round(lb * KG_PER_LB * 10) / 10
export const kgToLb = (kg: number) => Math.round((kg / KG_PER_LB) * 10) / 10

export function fmtLoad(v: number | undefined, units: 'lb' | 'kg') {
  if (v == null) return '—'
  return `${v} ${units}`
}

export function fullName(c: { firstName: string; lastName: string }) {
  return `${c.firstName} ${c.lastName}`.trim()
}

export function initials(c: { firstName: string; lastName: string }) {
  return `${c.firstName[0] ?? ''}${c.lastName[0] ?? ''}`.toUpperCase()
}

export function daysSince(iso?: string): number | null {
  if (!iso) return null
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000)
}
