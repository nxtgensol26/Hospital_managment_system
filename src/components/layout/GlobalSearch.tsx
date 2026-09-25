import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, UserRound, CornerDownLeft, Loader2 } from 'lucide-react'
import { ageFromDob } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const nav = useNavigate()
  const repo = getRepository()
  const { data: patients, loading } = useQuery(() => (open ? repo.listPatients(q) : Promise.resolve([])), [q, open])

  function go(path: string) { nav(path); onClose() }
  if (!open) return null

  const rows = (patients ?? []).slice(0, 8)
  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center bg-navy-900/40 p-4 pt-[12vh] backdrop-blur-sm animate-fade-in" onMouseDown={onClose}>
      <div className="card w-full max-w-xl animate-scale-in overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-surface-line px-4">
          <Search size={18} className="text-ink-faint" />
          <input autoFocus className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-ink-faint" placeholder="Search patient by ID, mobile or name…" value={q} onChange={(e) => setQ(e.target.value)} />
          {loading ? <Loader2 size={14} className="animate-spin text-ink-faint" /> : <kbd className="rounded border border-surface-line px-1.5 py-0.5 text-[10px] text-ink-faint">ESC</kbd>}
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {rows.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-ink-faint">{loading ? 'Searching…' : 'No matches found.'}</p>
          ) : (
            <>
              <p className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-faint">Patients</p>
              {rows.map((p) => (
                <button key={p.id} onClick={() => go(`/patients/${p.id}`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface-muted">
                  <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-brand-600"><UserRound size={16} /></div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                    <p className="truncate text-xs text-ink-faint">{p.code ?? p.id} · {p.mobile} · {ageFromDob(p.dob, p.ageYears)} · {p.gender}</p>
                  </div>
                  <CornerDownLeft size={14} className="text-ink-faint" />
                </button>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
