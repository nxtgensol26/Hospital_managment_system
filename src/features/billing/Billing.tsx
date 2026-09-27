import { useMemo, useState } from 'react'
import { ReceiptText, Plus, Trash2, Printer, IndianRupee, CreditCard, Loader2, Search } from 'lucide-react'
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

type StatusFilter = 'all' | 'unpaid' | 'partial' | 'paid'

export function Billing() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const [createOpen, setCreateOpen] = useState(false)
  const [payFor, setPayFor] = useState<Bill | null>(null)
  const [selected, setSelected] = useState<Patient | null>(null)
  const [psearch, setPsearch] = useState('')
  const [filter, setFilter] = useState<StatusFilter>('all')

  const { data: bills, reload: reloadAll } = useQuery(() => repo.listBills(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const { data: hospital } = useQuery(() => repo.getHospital().catch(() => null), [])
  // Patient-scoped billing history — queried only for the selected patient (RLS tenant-scoped).
  const { data: patientBills, reload: reloadPatient } = useQuery(() => (selected ? repo.listBillsForPatient(selected.id) : Promise.resolve([] as Bill[])), [selected?.id])
  const { data: matches } = useQuery(() => (psearch.trim() ? repo.listPatients(psearch) : Promise.resolve([] as Patient[])), [psearch])

  const patientMap = useMemo(() => new Map((patients ?? []).map((p) => [p.id, p])), [patients])
  const patientName = (id: string) => patientMap.get(id)?.name ?? id
  const reload = () => { reloadAll(); reloadPatient() }

  const rows = bills ?? []
  const outstanding = rows.filter((b) => b.status !== 'paid').reduce((s, b) => s + (b.total - b.paid), 0)
  const history = (patientBills ?? []).filter((b) => filter === 'all' ? true : filter === 'unpaid' ? (b.status !== 'paid' && b.status !== 'partial') : b.status === filter)

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

      {/* Patient billing lookup */}
      <Card className="mb-4 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-bold text-ink"><Search size={15} className="text-brand-600" /> Patient billing lookup</div>
        {selected ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-line bg-surface-muted px-3 py-2">
            <div className="text-sm">
              <b className="text-ink">{selected.name}</b>
              <span className="ml-2 font-mono text-brand-700">{selected.code ?? selected.id}</span>
              {selected.mobile ? <span className="ml-2 text-ink-soft">· {selected.mobile}</span> : null}
              {hospital?.name ? <span className="ml-2 text-ink-faint">· {hospital.name}</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {can('billing.manage') && <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={() => setCreateOpen(true)}><Plus size={13} /> New Invoice</button>}
              <button className="text-xs font-semibold text-brand-600" onClick={() => { setSelected(null); setPsearch(''); setFilter('all') }}>Clear</button>
            </div>
          </div>
        ) : (
          <div>
            <input className="input" placeholder="Search Patient ID, name or mobile…" value={psearch} onChange={(e) => setPsearch(e.target.value)} />
            {psearch.trim() && (matches ?? []).length > 0 && (
              <div className="mt-1 overflow-hidden rounded-lg border border-surface-line">
                {(matches ?? []).slice(0, 6).map((p) => (
                  <button key={p.id} onClick={() => { setSelected(p); setPsearch('') }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-surface-muted">
                    <span className="font-medium text-ink">{p.name}</span>
                    <span className="text-ink-faint">{p.code ?? p.id}{p.mobile ? ` · ${p.mobile}` : ''}</span>
                  </button>
                ))}
              </div>
            )}
            {psearch.trim() && (matches ?? []).length === 0 && <p className="mt-2 text-sm text-ink-faint">No patient matches “{psearch}”.</p>}
          </div>
        )}
      </Card>

      {selected ? (
        <div>
          <div className="mb-3 flex flex-wrap gap-1 rounded-lg bg-surface-sunken p-1">
            {(['all', 'unpaid', 'partial', 'paid'] as StatusFilter[]).map((f) => (
              <button key={f} onClick={() => setFilter(f)} className={`rounded-md px-3 py-1.5 text-xs font-semibold capitalize ${filter === f ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>{f}</button>
            ))}
          </div>
          {history.length === 0 ? (
            <Card><EmptyState icon={<ReceiptText size={22} />} title="No billing records found for this patient." hint={filter === 'all' ? undefined : `No ${filter} invoices.`} /></Card>
          ) : (
            <div className="space-y-3">
              {history.map((b) => <InvoiceCard key={b.id} bill={b} patient={selected} canPay={can('billing.manage')} onPay={() => setPayFor(b)} />)}
            </div>
          )}
        </div>
      ) : (
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
      )}

      {createOpen && <CreateBill initialPatient={selected} onClose={() => setCreateOpen(false)} onDone={reload} />}
      {payFor && <PayModal bill={payFor} patient={patientMap.get(payFor.patientId) ?? (selected?.id === payFor.patientId ? selected : undefined)} onClose={() => setPayFor(null)} onDone={reload} />}
    </div>
  )
}

function InvoiceCard({ bill, patient, canPay, onPay }: { bill: Bill; patient?: Patient; canPay: boolean; onPay: () => void }) {
  const due = bill.total - bill.paid
  return (
    <Card className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm">
          <span className="font-mono font-semibold text-brand-700">{bill.code ?? bill.id}</span>
          <span className="ml-2 text-ink-faint">{fmtDate(bill.createdAt)}</span>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={bill.status === 'paid' ? 'green' : bill.status === 'partial' ? 'amber' : 'red'}>{bill.status}</Badge>
          {bill.status !== 'paid' && canPay && <button className="btn-primary !px-2.5 !py-1 text-xs" onClick={onPay}><CreditCard size={13} /> Pay</button>}
          <button className="btn-outline !px-2.5 !py-1 text-xs" onClick={() => printInvoice(bill, patient)}><Printer size={13} /> Invoice</button>
        </div>
      </div>
      <Table head={<><th className="th">Description</th><th className="th">Type</th><th className="th">Qty</th><th className="th">Rate</th><th className="th">Amount</th></>}>
        {bill.items.map((it) => (
          <tr key={it.id}>
            <td className="td">{it.description}</td>
            <td className="td text-ink-faint capitalize">{it.kind}</td>
            <td className="td">{it.qty}</td>
            <td className="td">{inr(it.unitPrice)}</td>
            <td className="td font-semibold">{inr(it.amount)}</td>
          </tr>
        ))}
      </Table>
      <div className="mt-3 flex justify-end">
        <div className="min-w-[240px] space-y-1 text-sm">
          <div className="flex justify-between text-ink-soft"><span>Subtotal</span><span>{inr(bill.subtotal)}</span></div>
          {bill.discountAmt > 0 && <div className="flex justify-between text-ink-soft"><span>Discount{bill.discountPct ? ` (${bill.discountPct}%)` : ''}</span><span>− {inr(bill.discountAmt)}</span></div>}
          {bill.taxAmt > 0 && <div className="flex justify-between text-ink-soft"><span>Tax / GST{bill.taxPct ? ` (${bill.taxPct}%)` : ''}</span><span>+ {inr(bill.taxAmt)}</span></div>}
          <div className="flex justify-between border-t border-surface-line pt-1 text-base font-extrabold text-ink"><span>Total</span><span>{inr(bill.total)}</span></div>
          <div className="flex justify-between text-emerald-700"><span>Paid to date</span><span>{inr(bill.paid)}</span></div>
          <div className="flex justify-between font-semibold text-rose-600"><span>Balance due</span><span>{inr(due)}</span></div>
        </div>
      </div>
    </Card>
  )
}

function CreateBill({ onClose, onDone, initialPatient }: { onClose: () => void; onDone: () => void; initialPatient?: Patient | null }) {
  const repo = getRepository()
  const [patientId, setPatientId] = useState(initialPatient?.id ?? '')
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

const RCPT_SUBHEAD = 'margin:16px 0 6px;font-size:13px;font-weight:800;color:#0f1e3d;letter-spacing:.02em'

// Itemized BILL DETAILS from the invoice's ACTUAL stored line items (same source
// as Billing History and the Invoice PDF). Discount/Tax shown only when > 0.
function billDetailsHtml(bill: Bill) {
  if (!bill.items?.length) return ''
  const rows = bill.items.map((it, i) => `<tr><td>${i + 1}. ${it.description}</td><td>${it.kind}</td><td style="text-align:center">${it.qty}</td><td style="text-align:right">${inr(it.unitPrice)}</td><td style="text-align:right">${inr(it.amount)}</td></tr>`).join('')
  const hasDisc = bill.discountAmt > 0
  const hasTax = bill.taxAmt > 0
  return `
    <h3 style="${RCPT_SUBHEAD}">Bill Details</h3>
    <table><thead><tr><th>Description</th><th>Type</th><th style="text-align:center">Qty</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th></tr></thead><tbody>
    ${rows}
    </tbody></table>
    <div class="totals">
      <div><span>Subtotal</span><span>${inr(bill.subtotal)}</span></div>
      ${hasDisc ? `<div><span>Discount${bill.discountPct ? ` (${bill.discountPct}%)` : ''}</span><span>− ${inr(bill.discountAmt)}</span></div>` : ''}
      ${hasTax ? `<div><span>Tax / GST${bill.taxPct ? ` (${bill.taxPct}%)` : ''}</span><span>+ ${inr(bill.taxAmt)}</span></div>` : ''}
      <div class="grand"><span>Invoice Total</span><span>${inr(bill.total)}</span></div>
    </div>`
}

function printReceipt(bill: Bill, pay: Payment, patient?: Patient) {
  // `bill` is the pre-payment snapshot (with its real line items); `pay` is the persisted payment.
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
    ${billDetailsHtml(bill)}
    <h3 style="${RCPT_SUBHEAD}">Payment Summary</h3>
    <div class="totals">
      <div><span>Invoice Total</span><span>${inr(bill.total)}</span></div>
      <div class="grand"><span>Amount Paid Now</span><span>${inr(pay.amount)}</span></div>
      <div><span>Paid to date</span><span>${inr(paidToDate)}</span></div>
      <div><span>Balance Due</span><span>${inr(balance)}</span></div>
    </div>
    <p style="margin-top:16px;font-size:12px;color:#42536e">Thank you. This is a computer-generated receipt from NxtHealth.</p>
  `, { layout: 'a4' })
}
