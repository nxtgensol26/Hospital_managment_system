import { APP } from '../config'

export function pad(n: number, len: number) {
  return String(n).padStart(len, '0')
}

export const patientId = (seq: number) => `${APP.patientIdPrefix}-${pad(seq, 6)}`
export const apptId = (seq: number) => `APT-${pad(seq, 6)}`
export const visitId = (seq: number) => `V-${pad(seq, 6)}`
export const rxId = (seq: number) => `RX-${pad(seq, 6)}`
export const labOrderId = (seq: number) => `LAB-${pad(seq, 6)}`
export const sampleId = (seq: number) => `S-${pad(seq, 7)}`
export const admissionId = (seq: number) => `IPD-${pad(seq, 6)}`
export const erId = (seq: number) => `ER-${pad(seq, 6)}`
export const invoiceId = (seq: number) => `INV-${pad(seq, 6)}`
export const ticketId = (year: number, seq: number) =>
  `${APP.ticketPrefix}-${year}-${pad(seq, 6)}`

export function inr(n: number): string {
  return '₹' + (n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function fmtDate(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function fmtDateTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtTime(iso?: string): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
}

export function relTime(iso?: string): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  return `${d}d ago`
}

export function ageFromDob(dob?: string, ageYears?: number): string {
  if (ageYears != null) return `${ageYears}y`
  if (!dob) return '—'
  const d = new Date(dob)
  const now = new Date()
  let age = now.getFullYear() - d.getFullYear()
  const m = now.getMonth() - d.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--
  return `${age}y`
}

export function todayISO(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export function addDays(dateISO: string, days: number): string {
  const d = new Date(dateISO + 'T00:00:00')
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function daysBetween(from: string, to: string): number {
  const a = new Date(from + (from.length === 10 ? 'T00:00:00' : ''))
  const b = new Date(to + (to.length === 10 ? 'T00:00:00' : ''))
  return Math.ceil((b.getTime() - a.getTime()) / 86400000)
}

export function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join('')
}
