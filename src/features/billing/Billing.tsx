import { useMemo, useState } from 'react'
import { ReceiptText, Plus, Trash2, Printer, IndianRupee, CreditCard, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Table, Badge, EmptyState, Modal, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { inr, fmtDate, fmtDateTime } from '../../lib/format'
import type { Bill, BillItemKind, Patient, Payment } from '../../types'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { printDoc } from '../../lib/print'

const KINDS: { kind: BillItemKind; label: string }[] = [
  { kind: 'consultation', label: 'Consultation' }, { kind: 'diagnostics', label: 'Diagnostics' }, { kind: 'imaging', label: 'Imaging' },
  { kind: 'pharmacy', label: 'Pharmacy' }, { kind: 'procedure', label: 'Procedure' }, { kind: 'room', label: 'Room / Bed' },
  { kind: 'admission', label: 'Admission' }, { kind: 'other', label: 'Other' },
]

export function Billing() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const [createOpen, setCreateOpen] = useState(false)
  const [payFor, setPayFor] = useState<Bill | null>(null)
  const { data: bills, reload } = useQuery(() => repo.listBills(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientMap = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p])), [patients])
  const patientName = (id: string) => patientMap.get(id)?.name ?? id

  const rows = bills ?? []
  const outstanding = rows.filter((b) => b.status !== 'paid').reduce((s, b) => s + (b.total - b.paid), 0)

  return (
    <div>
      <PageHeader title="Billing" subtitle="Invoices, payments & outstanding balances" icon={<ReceiptText size={22} />}
        actions={can('billing.manage') && <button className="btn-primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> New Invoice</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Invoices</p><p className="mt-1 text-2xl font-extrabold text-ink">{rows.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Paid</p><p className="mt-1 text-2xl font-extrabold text-emerald-600">{rows.filter((b) => b.status === 'paid').length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Outstanding</p><p className="mt-1 text-2xl font-extrabold text-rose-600">{inr(outstanding)}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Unpaid</p><p className="mt-1 text-2xl font-extrabold text-amber-600">{rows.filter((b) => b.status !== 'paid').length}</p></Card>
      </div>
      <Card>
        {rows.length === 0 ? <EmptyState icon={<ReceiptText size={22} />} title="No invoices yet" hint="Create an invoice to bill a patient." /> : (
          <Table head={<><th className="th">Invoice</th><th className="th">Patient</th><th className="th">Date</th><th className="th">Items</th><th className="th">Total</th><th className="th">Paid</th><th className="th">Status</th><th className="th">Actions</th></>}>
            {rows.map((b) => (
              <tr key={b.id}>
                <td className="td font-mono text-xs font-semibold text-brand-700">{b.code ?? b.id}</td>
                <td className="td font-medium">{patientName(b.patientId)}</td>
                <td className="td text-ink-soft">{fmtDate(b.createdAt)}</td>
                <td className="td text-ink-soft">{b.items.length}</td>
                <td className="td font-semibold">{inr(b.total)}</td>
                <td className="td">{inr(b.paid)}</td>
                <td className="td"><Badge tone={b.status === 'paid' ? 'green' : b.status === 'partial' ? 'amber' : 'red'}>{b.status}</Badge></td>
                <td className="td">
                  <div className="flex gap-1">
                    {b.status !== 'paid' && can('billing.manage') && <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => setPayFor(b)}><CreditCard size={13} /> Pay</button>}
                    <button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => printInvoice(b, patientMap.get(b.patientId))}><Printer size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      {createOpen && <CreateBill onClose={() => setCreateOpen(false)} onDone={reload} />}
      {payFor && <PayModal bill={payFor} patient={patientMap.get(payFor.patientId)} onClose={() => setPayFor(null)} onDone={reload} />}
    </div>
  )
}

function CreateBill({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const [patientId, setPatientId] = useState('')
  const [psearch, setPsearch] = useState('')
  const [busy, setBusy] = useState(false)
  const { data: matches } = useQuery(() => (psearch.trim() ? repo.listPatients(psearch) : Promise.resolve([] as Patient[])), [psearch])
  const { data: selList } = useQuery(() => (patientId ? repo.getPatient(patientId).then((p) => (p ? [p] : [])) : Promise.resolve([])), [patientId])
  const selected = selList?.[0]
  const [items, setItems] = useState<{ kind: BillItemKind; description: string; qty: number; unitPrice: number }[]>([{ kind: 'consultation', description: 'Consultation fee', qty: 1, unitPrice: 400 }])
  const [discountPct, setDiscountPct] = useState(0)
  const [taxPct, setTaxPct] = useState(0)
  const subtotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const discountAmt = (subtotal * discountPct) / 100
  const taxAmt = ((subtotal - discountAmt) * taxPct) / 100
  const total = subtotal - discountAmt + taxAmt
  function upd(i: number, k: string, v: string | number) { setItems((s) => s.map((it, idx) => idx === i ? { ...it, [k]: v } : it)) }

  async function submit() {
    if (!patientId) return toast.error('Select a patient')
    const valid = items.filter((it) => it.description.trim() && it.unitPrice > 0)
    if (!valid.length) return toast.error('Add at least one line item')
    setBusy(true)
    try { const b = await repo.createBill({ patientId, items: valid, discountPct, taxPct }); toast.success('Invoice created', `${b.code ?? b.id} · ${inr(b.total)}`); onDone(); onClose() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }

  return (
    <Modal open onClose={onClose} size="lg" title="New Invoice" subtitle="Add charges across services"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <ReceiptText size={16} />} Generate Invoice</button></>}>
      <div className="space-y-4">
        <Field label="Patient" required>
          {selected ? <div className="flex items-center justify-between rounded-lg border border-surface-line px-3 py-2"><span className="text-sm"><b>{selected.name}</b> · {selected.code ?? selected.id}</span><button className="text-xs text-brand-600" onClick={() => setPatientId('')}>Change</button></div>
            : <><input className="input" placeholder="Search patient…" value={psearch} onChange={(e) => setPsearch(e.target.value)} />{(matches ?? []).slice(0, 5).map((p) => <button key={p.id} onClick={() => { setPatientId(p.id); setPsearch('') }} className="mt-1 flex w-full justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted"><span>{p.name}</span><span className="text-ink-faint">{p.code ?? p.id}</span></button>)}</>}
        </Field>
        <div>
          <div className="mb-1.5 flex items-center justify-between"><span className="label !mb-0">Line Items</span><button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={() => setItems((s) => [...s, { kind: 'other', description: '', qty: 1, unitPrice: 0 }])}><Plus size={13} /> Add</button></div>
          <div className="space-y-2">
            {items.map((it, i) => (
              <div key={i} className="grid grid-cols-12 items-center gap-2">
                <select className="input col-span-3 !py-2" value={it.kind} onChange={(e) => upd(i, 'kind', e.target.value)}>{KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}</select>
                <input className="input col-span-4 !py-2" placeholder="Description" value={it.description} onChange={(e) => upd(i, 'description', e.target.value)} />
                <input type="number" className="input col-span-2 !py-2" placeholder="Qty" value={it.qty} onChange={(e) => upd(i, 'qty', Number(e.target.value))} />
                <input type="number" className="input col-span-2 !py-2" placeholder="Price" value={it.unitPrice} onChange={(e) => upd(i, 'unitPrice', Number(e.target.value))} />
                <button className="col-span-1 grid h-9 place-items-center rounded-lg text-rose-500 hover:bg-rose-50" onClick={() => setItems((s) => s.filter((_, idx) => idx !== i))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4 border-t border-surface-line pt-4">
          <div className="flex gap-3">
            <Field label="Discount %"><input type="number" className="input w-24" value={discountPct} onChange={(e) => setDiscountPct(Number(e.target.value))} /></Field>
            <Field label="Tax / GST %"><input type="number" className="input w-24" value={taxPct} onChange={(e) => setTaxPct(Number(e.target.value))} /></Field>
          </div>
          <div className="min-w-[220px] space-y-1 text-sm">
            <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{inr(subtotal)}</span></div>
            <div className="flex justify-between text-ink-soft"><span>Discount</span><span>− {inr(discountAmt)}</span></div>
            <div className="flex justify-between text-ink-soft"><span>Tax</span><span>+ {inr(taxAmt)}</span></div>
            <div className="flex justify-between border-t border-surface-line pt-1 text-base font-extrabold text-ink"><span>Total</span><span>{inr(total)}</span></div>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function PayModal({ bill, patient, onClose, onDone }: { bill: Bill; patient?: Patient; onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const due = bill.total - bill.paid
  const [amount, setAmount] = useState(due)
  const [method, setMethod] = useState<Payment['method']>('cash')
  const [reference, setReference] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (amount <= 0) return toast.error('Enter a valid amount')
    setBusy(true)
    try { const pay = await repo.addPayment({ billId: bill.id, amount, method, reference }); toast.success('Payment recorded', inr(amount)); onDone(); onClose(); printReceipt(bill, pay, patient) }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title={`Payment — ${bill.code ?? bill.id}`} subtitle={`Due: ${inr(due)}`}
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <IndianRupee size={16} />} Record & Print Receipt</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount" required><input type="number" className="input" value={amount} onChange={(e) => setAmount(Number(e.target.value))} max={due} /></Field>
        <Field label="Method"><select className="input" value={method} onChange={(e) => setMethod(e.target.value as Payment['method'])}><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option><option value="insurance">Insurance</option><option value="other">Other</option></select></Field>
        <Field label="Reference (optional)"><input className="input" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Txn / UTR no." /></Field>
      </div>
    </Modal>
  )
}

function printInvoice(bill: Bill, patient?: Patient) {
  printDoc('Invoice', `
    <h2 class="title">Tax Invoice — ${bill.code ?? bill.id}</h2>
    <div class="grid">
      <div><span>Patient</span><b>${patient?.name ?? ''}</b> (${patient?.code ?? bill.patientId})</div>
      <div><span>Date</span>${fmtDateTime(bill.createdAt)}</div>
      <div><span>Status</span><span class="pill">${bill.status.toUpperCase()}</span></div>
    </div>
    <table style="margin-top:14px"><thead><tr><th>Description</th><th>Type</th><th>Qty</th><th>Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>
    ${bill.items.map((it) => `<tr><td>${it.description}</td><td>${it.kind}</td><td>${it.qty}</td><td>${inr(it.unitPrice)}</td><td style="text-align:right">${inr(it.amount)}</td></tr>`).join('')}
    </tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${inr(bill.subtotal)}</span></div>
      <div><span>Discount (${bill.discountPct}%)</span><span>− ${inr(bill.discountAmt)}</span></div>
      <div><span>Tax (${bill.taxPct}%)</span><span>+ ${inr(bill.taxAmt)}</span></div>
      <div class="grand"><span>Total</span><span>${inr(bill.total)}</span></div>
      <div><span>Paid</span><span>${inr(bill.paid)}</span></div>
      <div><span>Balance</span><span>${inr(bill.total - bill.paid)}</span></div>
    </div>
  `)
}

function printReceipt(bill: Bill, pay: Payment, patient?: Patient) {
  // `bill` is the pre-payment snapshot; `pay` is the persisted payment.
  const paidToDate = +(bill.paid + pay.amount).toFixed(2)
  const balance = +(bill.total - paidToDate).toFixed(2)
  const receiptNo = `RCPT-${String(pay.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()}`
  printDoc('Payment Receipt', `
    <h2 class="title">Payment Receipt${balance <= 0 ? ' &nbsp;<span class="pill">PAID</span>' : ''}</h2>
    <div class="grid">
      <div><span>Receipt No</span><b>${receiptNo}</b></div>
      <div><span>Invoice</span>${bill.code ?? bill.id}</div>
      <div><span>Date</span>${fmtDateTime(pay.at)}</div>
      <div><span>Patient</span>${patient?.name ?? ''} (${patient?.code ?? pay.patientId})</div>
      <div><span>Payment Mode</span>${pay.method.toUpperCase()}${pay.reference ? ` · ${pay.reference}` : ''}</div>
    </div>
    <div class="totals">
      <div><span>Invoice Total</span><span>${inr(bill.total)}</span></div>
      <div class="grand"><span>Amount Paid Now</span><span>${inr(pay.amount)}</span></div>
      <div><span>Paid to date</span><span>${inr(paidToDate)}</span></div>
      <div><span>Balance Due</span><span>${inr(balance)}</span></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#42536e">Thank you. This is a computer-generated receipt from NxtHealth.</p>
  `, { layout: 'a4' })
}
