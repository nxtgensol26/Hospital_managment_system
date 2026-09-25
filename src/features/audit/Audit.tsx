import { useMemo, useState } from 'react'
import { ScrollText, Search, Loader2 } from 'lucide-react'
import { PageHeader, Card, Table, Badge, EmptyState, Avatar } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import { ROLE_LABELS } from '../../lib/rbac'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

export function AuditLogPage() {
  const repo = getRepository()
  const [q, setQ] = useState('')
  const { data: entries, loading, error } = useQuery(() => repo.listAudit(), [])

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase()
    return (entries ?? []).filter((a) => !term || a.action.toLowerCase().includes(term) || a.actorName.toLowerCase().includes(term) || a.entity.toLowerCase().includes(term) || (a.entityId ?? '').toLowerCase().includes(term))
  }, [entries, q])

  return (
    <div>
      <PageHeader title="Audit Log" subtitle="Immutable trail of every sensitive action" icon={<ScrollText size={22} />} />
      <Card>
        <div className="flex items-center gap-2 border-b border-surface-line p-3">
          <div className="relative max-w-md flex-1"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" /><input className="input pl-9" placeholder="Search actions, users, entities…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {loading && <Loader2 size={16} className="animate-spin text-ink-faint" />}
        </div>
        {error ? <EmptyState icon={<ScrollText size={22} />} title="Couldn't load audit log" hint={error} /> : rows.length === 0 ? <EmptyState icon={<ScrollText size={22} />} title="No audit entries" /> : (
          <Table head={<><th className="th">Time</th><th className="th">Actor</th><th className="th">Role</th><th className="th">Action</th><th className="th">Entity</th><th className="th">Detail</th></>}>
            {rows.slice(0, 200).map((a) => (
              <tr key={a.id}>
                <td className="td whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(a.at)}</td>
                <td className="td"><div className="flex items-center gap-2"><Avatar name={a.actorName} size={26} /> <span className="text-sm font-medium">{a.actorName}</span></div></td>
                <td className="td"><Badge tone="slate">{ROLE_LABELS[a.actorRole]}</Badge></td>
                <td className="td font-medium text-ink">{a.action}</td>
                <td className="td text-ink-soft">{a.entity}{a.entityId ? <span className="font-mono text-xs text-brand-700"> · {a.entityId}</span> : ''}</td>
                <td className="td text-xs text-ink-faint">{a.detail ?? '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
