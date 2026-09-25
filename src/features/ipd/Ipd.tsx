import { useMemo, useState } from 'react'
import { BedDouble, NotebookPen, LogOut, Printer, Clock, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Badge, EmptyState, Modal, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { fmtDateTime, fmtDate, daysBetween, todayISO, inr } from '../../lib/format'
import type { Admission } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'
import { printDoc } from '../../lib/print'

export function Ipd() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const { doctorName } = useRefData()
  const [noteFor, setNoteFor] = useState<Admission | null>(null)
  const [dischargeFor, setDischargeFor] = useState<Admission | null>(null)
  const { data: admissions, loading, reload } = useQuery(() => repo.listAdmissions(), [])
  const { data: beds } = useQuery(() => repo.listBeds(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const { data: bills } = useQuery(() => repo.listBills(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p])); return (id: string) => m.get(id) }, [patients])
  const bedLabel = useMemo(() => { const m = new Map((beds ?? []).map((b) => [b.id, b.label])); return (id?: string) => (id ? m.get(id) ?? '—' : '—') }, [beds])

  const active = (admissions ?? []).filter((a) => a.status !== 'discharged')
  const discharged = (admissions ?? []).filter((a) => a.status === 'discharged')

  function printSummary(a: Admission) {
    const p = patientName(a.patientId)
    const ab = (bills ?? []).filter((b) => b.admissionId === a.id)
    printDoc('Discharge Summary', `
      <h2 class="title">Discharge Summary — ${a.code ?? a.id}</h2>
      <div class="grid">
        <div><span>Patient</span><b>${p?.name ?? ''}</b> (${p?.code ?? a.patientId})</div>
        <div><span>Admitted</span>${fmtDateTime(a.admittedAt)}</div>
        <div><span>Discharged</span>${fmtDateTime(a.dischargedAt)}</div>
        <div><span>Attending</span>${doctorName(a.doctorId)}</div>
      </div>
      <div class="box"><b>Reason for admission:</b> ${a.reason ?? '—'}</div>
      <div class="box"><b>Discharge notes:</b><br/>${(a.dischargeSummary ?? '').replace(/\n/g, '<br/>')}</div>
      ${ab.length ? `<div class="box"><b>Billing:</b> ${ab.map((b) => `${b.code ?? b.id} — ${inr(b.total)} (${b.status})`).join('<br/>')}</div>` : ''}
    `)
  }

  return (
    <div>
      <PageHeader title="IPD / Admissions" subtitle="Inpatient management, nursing notes & discharge" icon={<BedDouble size={22} />} actions={loading ? <Loader2 size={16} className="animate-spin text-ink-faint" /> : undefined} />
      <Card>
        <div className="border-b border-surface-line px-5 py-3"><h3 className="text-sm font-bold text-ink">Currently Admitted ({active.length})</h3></div>
        {active.length === 0 ? <EmptyState icon={<BedDouble size={22} />} title="No active admissions" hint="Admit patients from the Bed Management board." /> : (
          <div className="divide-y divide-surface-line">
            {active.map((a) => (
              <div key={a.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-mono text-sm font-semibold text-brand-700">{a.code ?? a.id}</span><span className="font-bold text-ink">{patientName(a.patientId)?.name ?? a.patientId}</span><Badge tone="blue">Bed {bedLabel(a.bedId)}</Badge></div>
                    <p className="mt-1 text-xs text-ink-faint">{doctorName(a.doctorId)} · admitted {fmtDateTime(a.admittedAt)} · {daysBetween(a.admittedAt.slice(0, 10), todayISO()) + 1} day(s)</p>
                    {a.reason && <p className="mt-1 text-sm text-ink-soft">{a.reason}</p>}
                  </div>
                  {can('ipd.manage') && (
                    <div className="flex gap-1">
                      <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setNoteFor(a)}><NotebookPen size={13} /> Note</button>
                      <button className="btn-danger !px-2.5 !py-1 text-xs" onClick={() => setDischargeFor(a)}><LogOut size={13} /> Discharge</button>
                    </div>
                  )}
                </div>
                {a.nursingNotes && a.nursingNotes.length > 0 && (
                  <div className="mt-3 space-y-1 rounded-lg bg-surface-muted p-3">
                    {a.nursingNotes.slice(0, 3).map((n, i) => (<p key={i} className="flex items-start gap-2 text-xs text-ink-soft"><Clock size={12} className="mt-0.5 shrink-0" /> <span><b className="text-ink">{fmtDateTime(n.at)}:</b> {n.note}</span></p>))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
      {discharged.length > 0 && (
        <Card className="mt-4">
          <div className="border-b border-surface-line px-5 py-3"><h3 className="text-sm font-bold text-ink">Recent Discharges</h3></div>
          <div className="divide-y divide-surface-line">
            {discharged.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-center justify-between px-5 py-2.5"><span className="text-sm">{patientName(a.patientId)?.name ?? a.patientId} · <span className="text-ink-faint">{a.code ?? a.id}</span></span><div className="flex items-center gap-2"><span className="text-xs text-ink-faint">{fmtDate(a.dischargedAt)}</span><button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => printSummary(a)}><Printer size={13} /> Summary</button></div></div>
            ))}
          </div>
        </Card>
      )}
      {noteFor && <NoteModal admission={noteFor} onClose={() => setNoteFor(null)} onDone={reload} />}
      {dischargeFor && <DischargeModal admission={dischargeFor} onClose={() => setDischargeFor(null)} onDone={reload} />}
    </div>
  )
}

function NoteModal({ admission, onClose, onDone }: { admission: Admission; onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!note.trim()) return toast.error('Enter a note')
    setBusy(true)
    try { await repo.addNursingNote(admission.id, note.trim()); toast.success('Note added'); onDone(); onClose() } catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Add Nursing Note" subtitle={admission.code ?? admission.id}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <NotebookPen size={16} />} Save</button></>}>
      <Field label="Note"><textarea className="input min-h-[100px]" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Medication given, observations, vitals…" autoFocus /></Field>
    </Modal>
  )
}

function DischargeModal({ admission, onClose, onDone }: { admission: Admission; onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const [summary, setSummary] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    setBusy(true)
    try { await repo.dischargePatient(admission.id, summary || 'Discharged in stable condition.'); toast.success('Patient discharged', 'Discharge notification sent'); onDone(); onClose() } catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Discharge Patient" subtitle={`${admission.code ?? admission.id} · bed freed for cleaning`}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-danger" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />} Confirm Discharge</button></>}>
      <Field label="Discharge Summary" hint="Condition at discharge, follow-up advice, medications."><textarea className="input min-h-[120px]" value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Patient stable, advised follow-up in 7 days…" autoFocus /></Field>
    </Modal>
  )
}
