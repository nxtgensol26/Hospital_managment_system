import { CheckCircle2, XCircle, Info, X } from 'lucide-react'
import { useToast } from '../store/toast'

export function Toaster() {
  const { toasts, dismiss } = useToast()
  return (
    <div className="pointer-events-none fixed bottom-5 right-5 z-[60] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2.5">
      {toasts.map((t) => {
        const cfg = {
          success: { icon: CheckCircle2, ring: 'border-emerald-200', color: 'text-emerald-600' },
          error: { icon: XCircle, ring: 'border-rose-200', color: 'text-rose-600' },
          info: { icon: Info, ring: 'border-brand-200', color: 'text-brand-600' },
        }[t.kind]
        const Icon = cfg.icon
        return (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${cfg.ring} bg-white p-3.5 shadow-pop animate-fade-up`}
          >
            <Icon size={20} className={`mt-0.5 shrink-0 ${cfg.color}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t.title}</p>
              {t.message && <p className="mt-0.5 text-xs text-ink-soft">{t.message}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-faint hover:bg-surface-sunken">
              <X size={15} />
            </button>
          </div>
        )
      })}
    </div>
  )
}
