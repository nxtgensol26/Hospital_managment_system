import React from 'react'
import { initials } from '../lib/format'

/* ---------------- Card ---------------- */
export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`card ${className}`}>{children}</div>
}

export function CardHeader({ title, subtitle, action }: { title: React.ReactNode; subtitle?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-surface-line px-5 py-4">
      <div>
        <h3 className="text-[15px] font-bold text-ink">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Section title ---------------- */
export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
}: {
  title: string
  subtitle?: string
  actions?: React.ReactNode
  icon?: React.ReactNode
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600">{icon}</div>}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-ink">{title}</h1>
          {subtitle && <p className="text-sm text-ink-soft">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}

/* ---------------- Badge / status pill ---------------- */
type Tone = 'blue' | 'teal' | 'green' | 'amber' | 'red' | 'slate' | 'violet'
const toneMap: Record<Tone, string> = {
  blue: 'bg-brand-50 text-brand-700',
  teal: 'bg-teal-50 text-teal-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  slate: 'bg-slate-100 text-slate-600',
  violet: 'bg-violet-50 text-violet-700',
}
export function Badge({ tone = 'slate', children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  return (
    <span className={`chip ${toneMap[tone]}`}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  )
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, size = 36, tone = 'blue' }: { name: string; size?: number; tone?: Tone }) {
  const bg: Record<Tone, string> = {
    blue: 'bg-brand-100 text-brand-700',
    teal: 'bg-teal-100 text-teal-700',
    green: 'bg-emerald-100 text-emerald-700',
    amber: 'bg-amber-100 text-amber-700',
    red: 'bg-rose-100 text-rose-700',
    slate: 'bg-slate-200 text-slate-700',
    violet: 'bg-violet-100 text-violet-700',
  }
  return (
    <div
      className={`grid shrink-0 place-items-center rounded-full font-bold ${bg[tone]}`}
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </div>
  )
}

/* ---------------- Empty state ---------------- */
export function EmptyState({ icon, title, hint, action }: { icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      {icon && <div className="grid h-14 w-14 place-items-center rounded-2xl bg-surface-sunken text-ink-faint">{icon}</div>}
      <div>
        <p className="font-semibold text-ink">{title}</p>
        {hint && <p className="mt-1 text-sm text-ink-faint">{hint}</p>}
      </div>
      {action}
    </div>
  )
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md',
  showClose = true,
  closeOnBackdrop = true,
}: {
  open: boolean
  onClose: () => void
  title: React.ReactNode
  subtitle?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
  showClose?: boolean
  closeOnBackdrop?: boolean
}) {
  // Escape closes the modal via the same onClose the X uses (each modal decides
  // what onClose means — e.g. a mandatory gate can route it to a secure exit).
  React.useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  const w = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' }[size]
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-900/40 p-4 backdrop-blur-sm animate-fade-in" onMouseDown={closeOnBackdrop ? onClose : undefined}>
      <div
        className={`card ${w} my-8 w-full animate-scale-in overflow-hidden`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-surface-line px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-ink">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {showClose && (
            <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-faint hover:bg-surface-sunken" aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-surface-line bg-surface-muted px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

/* ---------------- Confirm dialog ---------------- */
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  danger,
}: {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <button className="btn-outline" onClick={onClose}>Cancel</button>
          <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={() => { onConfirm(); onClose() }}>{confirmLabel}</button>
        </>
      }
    >
      <p className="text-sm text-ink-soft">{message}</p>
    </Modal>
  )
}

/* ---------------- Field helpers ---------------- */
export function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-faint">{hint}</span>}
    </label>
  )
}

/* ---------------- Data table shell ---------------- */
export function Table({ head, children, className = '' }: { head: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full border-collapse">
        <thead className="bg-surface-muted">
          <tr className="border-b border-surface-line">{head}</tr>
        </thead>
        <tbody className="divide-y divide-surface-line">{children}</tbody>
      </table>
    </div>
  )
}

/* ---------------- Stat card ---------------- */
export function StatCard({
  label,
  value,
  sub,
  icon,
  tone = 'blue',
  onClick,
}: {
  label: string
  value: React.ReactNode
  sub?: React.ReactNode
  icon?: React.ReactNode
  tone?: Tone
  onClick?: () => void
}) {
  const iconBg: Record<Tone, string> = {
    blue: 'bg-brand-50 text-brand-600',
    teal: 'bg-teal-50 text-teal-600',
    green: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-rose-50 text-rose-600',
    slate: 'bg-slate-100 text-slate-600',
    violet: 'bg-violet-50 text-violet-600',
  }
  return (
    <div
      className={`card p-4 ${onClick ? 'cursor-pointer transition hover:shadow-pop' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
          <p className="mt-1.5 text-2xl font-extrabold tracking-tight text-ink">{value}</p>
          {sub && <p className="mt-0.5 text-xs text-ink-soft">{sub}</p>}
        </div>
        {icon && <div className={`grid h-10 w-10 place-items-center rounded-xl ${iconBg[tone]}`}>{icon}</div>}
      </div>
    </div>
  )
}
