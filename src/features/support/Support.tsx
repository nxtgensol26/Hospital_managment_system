import { useState } from 'react'
import { LifeBuoy, Phone, Mail, Plus, Ticket, Globe, Loader2 } from 'lucide-react'
import { PageHeader, Card, CardHeader, Field, Badge, Modal, EmptyState, Table } from '../../components/ui'
import { APP } from '../../config'
import { toast } from '../../store/toast'
import { fmtDateTime } from '../../lib/format'
import type { TicketPriority, TicketStatus } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

const PRIO_TONE: Record<TicketPriority, 'slate' | 'blue' | 'amber' | 'red'> = { low: 'slate', medium: 'blue', high: 'amber', critical: 'red' }
const STAT_TONE: Record<TicketStatus, 'blue' | 'amber' | 'green' | 'slate'> = { open: 'blue', in_progress: 'amber', resolved: 'green', closed: 'slate' }

export function Support() {
  const repo = getRepository()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ subject: '', description: '', priority: 'medium' as TicketPriority })
  const { data: tickets, loading, reload } = useQuery(() => repo.listTickets(), [])

  async function raise() {
    if (!f.subject.trim()) return toast.error('Subject is required')
    try { const t = await repo.createTicket(f); toast.success('Ticket raised', t.code ?? t.id); setOpen(false); setF({ subject: '', description: '', priority: 'medium' }); reload() }
    catch (e) { toast.error('Failed', String((e as Error).message)) }
  }
  async function setStatus(id: string, status: TicketStatus) {
    try { await repo.setTicketStatus(id, status); toast.info('Ticket updated'); reload() } catch (e) { toast.error('Failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Support" subtitle="Get help from the NxtGenSol team" icon={<LifeBuoy size={22} />}
        actions={<button className="btn-primary" onClick={() => setOpen(true)}><Plus size={16} /> Raise Ticket</button>} />
      <div className="mb-5 grid gap-4 sm:grid-cols-3">
        <a href={`tel:${APP.support.phone}`} className="card flex items-center gap-3 p-4 hover:shadow-pop"><div className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-brand-600"><Phone size={20} /></div><div><p className="text-xs text-ink-faint">Call us</p><p className="font-bold text-ink">{APP.support.phone}</p></div></a>
        <a href={`mailto:${APP.support.email}`} className="card flex items-center gap-3 p-4 hover:shadow-pop"><div className="grid h-11 w-11 place-items-center rounded-xl bg-teal-50 text-teal-600"><Mail size={20} /></div><div><p className="text-xs text-ink-faint">Email</p><p className="font-bold text-ink">{APP.support.email}</p></div></a>
        <div className="card flex items-center gap-3 p-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-violet-50 text-violet-600"><Globe size={20} /></div><div><p className="text-xs text-ink-faint">Web</p><p className="font-bold text-ink">{APP.support.website}</p></div></div>
      </div>
      <Card>
        <CardHeader title="Your Tickets" subtitle={`Format: ${APP.ticketPrefix}-YYYY-NNNNNN`} action={loading ? <Loader2 size={14} className="animate-spin text-ink-faint" /> : undefined} />
        {(tickets ?? []).length === 0 ? <EmptyState icon={<Ticket size={22} />} title="No tickets yet" hint="Raise a ticket and our team will get back to you." /> : (
          <Table head={<><th className="th">Ticket</th><th className="th">Subject</th><th className="th">Priority</th><th className="th">Status</th><th className="th">Created</th><th className="th">Actions</th></>}>
            {(tickets ?? []).map((t) => (
              <tr key={t.id}>
                <td className="td font-mono text-xs font-semibold text-brand-700">{t.code ?? t.id}</td>
                <td className="td font-medium">{t.subject}<br /><span className="text-xs text-ink-faint">{t.description}</span></td>
                <td className="td"><Badge tone={PRIO_TONE[t.priority]}>{t.priority}</Badge></td>
                <td className="td"><Badge tone={STAT_TONE[t.status]}>{t.status.replace('_', ' ')}</Badge></td>
                <td className="td text-xs text-ink-soft">{fmtDateTime(t.createdAt)}</td>
                <td className="td">
                  {t.status !== 'closed' && (
                    <div className="flex gap-1">
                      {t.status === 'open' && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setStatus(t.id, 'in_progress')}>Start</button>}
                      {t.status !== 'resolved' && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setStatus(t.id, 'resolved')}>Resolve</button>}
                      <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => setStatus(t.id, 'closed')}>Close</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Modal open={open} onClose={() => setOpen(false)} title="Raise Support Ticket" subtitle={`${APP.company} · ${APP.support.phone}`}
        footer={<><button className="btn-outline" onClick={() => setOpen(false)}>Cancel</button><button className="btn-primary" onClick={raise}><Ticket size={16} /> Submit</button></>}>
        <div className="space-y-4">
          <Field label="Subject" required><input className="input" value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="Brief summary of the issue" /></Field>
          <Field label="Description"><textarea className="input min-h-[100px]" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Steps, expected vs actual…" /></Field>
          <Field label="Priority"><select className="input" value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as TicketPriority })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></Field>
        </div>
      </Modal>
    </div>
  )
}
