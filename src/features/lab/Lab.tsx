import { useMemo, useState } from 'react'
import { FlaskConical, TestTube, CheckCircle2, ShieldCheck, Send, Printer, FlaskRound, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Table, Badge, EmptyState, Modal, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { fmtDateTime, fmtDate } from '../../lib/format'
import type { LabSample, SampleStatus, Patient, LabTest, LabOrder } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'
import { printDoc } from '../../lib/print'

const STATUS_TONE: Record<SampleStatus, 'slate' | 'amber' | 'blue' | 'teal' | 'green' | 'violet'> = {
  pending: 'slate', collected: 'blue', processing: 'amber', completed: 'violet', verified: 'teal', released: 'green',
}

export function Lab() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const { doctorName } = useRefData()
  const [tab, setTab] = useState<'work' | 'orders'>('work')
  const [resultFor, setResultFor] = useState<LabSample | null>(null)

  const { data: samples, reload: reloadS } = useQuery(() => repo.listLabSamples(), [])
  const { data: orders, reload: reloadO } = useQuery(() => repo.listLabOrders(), [])
  const { data: tests } = useQuery(() => repo.listLabTests(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const testMap = useMemo(() => new Map((tests ?? []).map((t) => [t.id, t])), [tests])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p])); return (id: string) => m.get(id) }, [patients])
  const reloadAll = () => { reloadS(); reloadO() }

  const allSamples = samples ?? []
  const activeSamples = allSamples.filter((s) => s.status !== 'released')

  async function act(fn: () => Promise<void>, msg: string) {
    try { await fn(); toast.success(msg); reloadAll() } catch (e) { toast.error('Action failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Diagnostics / Laboratory" subtitle="Sample collection → processing → result → verification → release" icon={<FlaskConical size={22} />} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {(['pending', 'collected', 'completed', 'verified', 'released'] as SampleStatus[]).map((st) => (
          <Card key={st} className="p-3.5"><p className="text-[11px] font-semibold uppercase text-ink-faint">{st}</p><p className="mt-0.5 text-2xl font-extrabold text-ink">{allSamples.filter((s) => s.status === st).length}</p></Card>
        ))}
      </div>
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-sunken p-1">
        <button onClick={() => setTab('work')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'work' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>Sample Worklist</button>
        <button onClick={() => setTab('orders')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'orders' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>Orders & Reports</button>
      </div>

      {tab === 'work' ? (
        <Card>
          {activeSamples.length === 0 ? <EmptyState icon={<TestTube size={22} />} title="Worklist clear" hint="No pending samples. New lab orders from doctors appear here." /> : (
            <Table head={<><th className="th">Sample</th><th className="th">Patient</th><th className="th">Test</th><th className="th">Status</th><th className="th">Result</th><th className="th">Actions</th></>}>
              {activeSamples.map((s) => {
                const t = testMap.get(s.testId); const p = patientName(s.patientId)
                return (
                  <tr key={s.id}>
                    <td className="td font-mono text-xs font-semibold text-brand-700">{s.code ?? s.id.slice(0, 8)}</td>
                    <td className="td">{p?.name ?? s.patientId}<br /><span className="text-xs text-ink-faint">{p?.code ?? ''}</span></td>
                    <td className="td">{t?.name}<br /><span className="text-xs text-ink-faint">{t?.sampleType}</span></td>
                    <td className="td"><Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge></td>
                    <td className="td">{s.result ? <>{s.result} {s.resultUnit} {s.flag && s.flag !== 'normal' && <Badge tone={s.flag === 'critical' ? 'red' : 'amber'}>{s.flag}</Badge>}</> : '—'}</td>
                    <td className="td">
                      <div className="flex flex-wrap gap-1">
                        {s.status === 'pending' && can('lab.collect') && <button className="btn-ghost !px-2 !py-1 text-xs" onClick={() => act(() => repo.collectSample(s.id), 'Sample collected')}><TestTube size={13} /> Collect</button>}
                        {(s.status === 'collected' || s.status === 'processing') && can('lab.result') && <button className="btn-primary !px-2 !py-1 text-xs" onClick={() => setResultFor(s)}><FlaskRound size={13} /> Enter Result</button>}
                        {s.status === 'completed' && can('lab.verify') && <button className="btn-teal !px-2 !py-1 text-xs" onClick={() => act(() => repo.verifyResult(s.id), 'Result verified')}><ShieldCheck size={13} /> Verify</button>}
                        {s.status === 'completed' && !can('lab.verify') && <Badge tone="violet">Awaiting verification</Badge>}
                        {s.status === 'verified' && <Badge tone="teal">Ready to release</Badge>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </Card>
      ) : (
        <Card>
          {(orders ?? []).length === 0 ? <EmptyState icon={<FlaskConical size={22} />} title="No lab orders" /> : (
            <div className="divide-y divide-surface-line">
              {(orders ?? []).map((o) => {
                const os = allSamples.filter((s) => s.orderId === o.id)
                const allVerified = os.length > 0 && os.every((s) => s.status === 'verified' || s.status === 'released')
                const released = o.status === 'reported'
                return (
                  <div key={o.id} className="p-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <span className="font-mono text-sm font-semibold text-brand-700">{o.code ?? o.id.slice(0, 8)}</span>
                        <span className="ml-2 text-sm text-ink">{patientName(o.patientId)?.name ?? o.patientId}</span>
                        <span className="ml-2 text-xs text-ink-faint">{doctorName(o.doctorId)} · {fmtDate(o.createdAt)}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge tone={released ? 'green' : allVerified ? 'teal' : 'amber'}>{o.status}</Badge>
                        {allVerified && !released && can('lab.release') && <button className="btn-teal !px-2.5 !py-1 text-xs" onClick={() => act(() => repo.releaseOrderReport(o.id), 'Report released · patient notified')}><Send size={13} /> Release</button>}
                        {released && <button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => printReport(o, os, testMap, patientName(o.patientId))}><Printer size={13} /> Print Report</button>}
                      </div>
                    </div>
                    <Table head={<><th className="th">Test</th><th className="th">Result</th><th className="th">Unit</th><th className="th">Ref Range</th><th className="th">Status</th></>}>
                      {os.map((s) => (
                        <tr key={s.id}>
                          <td className="td">{testMap.get(s.testId)?.name}</td>
                          <td className="td font-semibold">{s.result ?? '—'} {s.flag && s.flag !== 'normal' && <Badge tone={s.flag === 'critical' ? 'red' : 'amber'}>{s.flag}</Badge>}</td>
                          <td className="td text-ink-faint">{s.resultUnit ?? '—'}</td>
                          <td className="td text-ink-faint">{s.refRange ?? '—'}</td>
                          <td className="td"><Badge tone={STATUS_TONE[s.status]}>{s.status}</Badge></td>
                        </tr>
                      ))}
                    </Table>
                  </div>
                )
              })}
            </div>
          )}
        </Card>
      )}

      {resultFor && <ResultModal sample={resultFor} test={testMap.get(resultFor.testId)} patient={patientName(resultFor.patientId)} onClose={() => setResultFor(null)} onSaved={reloadAll} />}
    </div>
  )
}

function ResultModal({ sample, test, patient, onClose, onSaved }: { sample: LabSample; test?: LabTest; patient?: Patient; onClose: () => void; onSaved: () => void }) {
  const repo = getRepository()
  const [result, setResult] = useState('')
  const [flag, setFlag] = useState<LabSample['flag']>('normal')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!result.trim()) return toast.error('Enter a result value')
    setBusy(true)
    try { await repo.enterResult(sample.id, result.trim(), flag); toast.success('Result entered', 'Awaiting verification'); onSaved(); onClose() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Enter Result — ${test?.name ?? ''}`} subtitle={`${patient?.name ?? ''}`}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Save Result</button></>}>
      <div className="space-y-4">
        <div className="rounded-lg bg-surface-muted p-3 text-sm text-ink-soft">Reference range: <b className="text-ink">{sample.refRange ?? test?.refRange ?? '—'} {sample.resultUnit ?? test?.unit ?? ''}</b></div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Result Value" required><input className="input" value={result} onChange={(e) => setResult(e.target.value)} placeholder="e.g. 13.5" autoFocus /></Field>
          <Field label="Flag"><select className="input" value={flag} onChange={(e) => setFlag(e.target.value as LabSample['flag'])}><option value="normal">Normal</option><option value="high">High</option><option value="low">Low</option><option value="critical">Critical</option></select></Field>
        </div>
      </div>
    </Modal>
  )
}

function printReport(order: LabOrder, samples: LabSample[], testMap: Map<string, LabTest>, patient?: Patient) {
  printDoc('Lab Report', `
    <h2 class="title">Laboratory Report — ${order.code ?? order.id}</h2>
    <div class="grid">
      <div><span>Patient</span><b>${patient?.name ?? ''}</b> (${patient?.code ?? ''})</div>
      <div><span>Report Date</span>${fmtDateTime(new Date().toISOString())}</div>
      <div><span>Gender</span>${patient?.gender ?? ''}</div>
      <div><span>Sample(s)</span>${samples.length}</div>
    </div>
    <table><thead><tr><th>Test</th><th>Result</th><th>Unit</th><th>Reference</th></tr></thead><tbody>
    ${samples.map((s) => `<tr><td>${testMap.get(s.testId)?.name ?? ''}</td><td><b>${s.result ?? '—'}</b>${s.flag && s.flag !== 'normal' ? ` (${s.flag})` : ''}</td><td>${s.resultUnit ?? ''}</td><td>${s.refRange ?? ''}</td></tr>`).join('')}
    </tbody></table>
    <p style="margin-top:16px;font-size:12px;color:#42536e">Verified & released electronically via NxtHealth. This is a computer-generated report.</p>
  `)
}
