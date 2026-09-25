import { useMemo } from 'react'
import { BellRing, MessageSquare, Smartphone, CheckCheck, Loader2 } from 'lucide-react'
import { PageHeader, Card, Table, Badge, EmptyState } from '../../components/ui'
import { fmtDateTime } from '../../lib/format'
import type { NotificationLog } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

const CHANNEL = { rcs: { icon: MessageSquare, tone: 'blue' as const }, sms: { icon: Smartphone, tone: 'teal' as const }, whatsapp: { icon: MessageSquare, tone: 'green' as const } }
const STATUS_TONE: Record<NotificationLog['status'], 'green' | 'teal' | 'red' | 'amber'> = { sent: 'green', delivered: 'green', failed: 'red', fallback: 'amber' }

export function NotificationsPage() {
  const repo = getRepository()
  const { data: logs, loading } = useQuery(() => repo.listNotifications(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id?: string) => (id ? m.get(id) ?? '—' : '—') }, [patients])
  const rows = logs ?? []
  const sent = rows.filter((l) => l.status !== 'failed').length

  return (
    <div>
      <PageHeader title="Notifications" subtitle="Outbound RCS / SMS message log · provider-agnostic delivery" icon={<BellRing size={22} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Total Sent</p><p className="mt-1 text-2xl font-extrabold text-ink">{sent}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Via RCS</p><p className="mt-1 text-2xl font-extrabold text-brand-600">{rows.filter((l) => l.channel === 'rcs').length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">SMS Fallback</p><p className="mt-1 text-2xl font-extrabold text-amber-600">{rows.filter((l) => l.status === 'fallback').length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Failed</p><p className="mt-1 text-2xl font-extrabold text-rose-600">{rows.filter((l) => l.status === 'failed').length}</p></Card>
      </div>
      <Card>
        {loading ? <div className="flex items-center justify-center gap-2 py-14 text-sm text-ink-faint"><Loader2 size={18} className="animate-spin" /> Loading…</div> : rows.length === 0 ? <EmptyState icon={<BellRing size={22} />} title="No notifications sent yet" hint="Registration, appointment, lab and billing events trigger messages automatically." /> : (
          <Table head={<><th className="th">Time</th><th className="th">To</th><th className="th">Patient</th><th className="th">Template</th><th className="th">Channel</th><th className="th">Provider</th><th className="th">Status</th><th className="th">Message</th></>}>
            {rows.slice(0, 100).map((l) => {
              const Ch = CHANNEL[l.channel]?.icon ?? MessageSquare
              return (
                <tr key={l.id}>
                  <td className="td whitespace-nowrap text-xs text-ink-soft">{fmtDateTime(l.at)}</td>
                  <td className="td font-mono text-xs">{l.to}</td>
                  <td className="td text-ink-soft">{patientName(l.patientId)}</td>
                  <td className="td"><Badge tone="slate">{l.templateKey}</Badge></td>
                  <td className="td"><Badge tone={CHANNEL[l.channel]?.tone ?? 'slate'}><Ch size={11} /> {l.channel.toUpperCase()}</Badge></td>
                  <td className="td text-xs text-ink-faint">{l.provider}</td>
                  <td className="td"><Badge tone={STATUS_TONE[l.status]}><CheckCheck size={11} /> {l.status}</Badge></td>
                  <td className="td max-w-[280px] truncate text-xs text-ink-soft" title={l.message}>{l.message}</td>
                </tr>
              )
            })}
          </Table>
        )}
      </Card>
    </div>
  )
}
