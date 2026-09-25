import { useMemo, useState } from 'react'
import { Pill, PackageCheck, Boxes, AlertTriangle, Plus, CalendarClock, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Table, Badge, EmptyState, Modal, Field } from '../../components/ui'
import { toast } from '../../store/toast'
import { inr, fmtDate, relTime, todayISO, addDays } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { useRefData } from '../../data/useRefData'

export function Pharmacy() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const { doctorName } = useRefData()
  const [tab, setTab] = useState<'queue' | 'inventory'>('queue')
  const [purchaseOpen, setPurchaseOpen] = useState(false)

  const { data: prescriptions, reload: reloadRx } = useQuery(() => repo.listPrescriptions(), [])
  const { data: medicines } = useQuery(() => repo.listMedicines(), [])
  const { data: batches, reload: reloadB } = useQuery(() => repo.listMedicineBatches(), [])
  const { data: patients } = useQuery(() => repo.listPatients(), [])
  const patientName = useMemo(() => { const m = new Map((patients ?? []).map((p) => [p.id, p.name])); return (id: string) => m.get(id) ?? id }, [patients])

  const queue = (prescriptions ?? []).filter((p) => p.status === 'sent_to_pharmacy')
  const stockOf = (medId: string) => (batches ?? []).filter((b) => b.medicineId === medId).reduce((s, b) => s + b.quantity, 0)
  const low = (medicines ?? []).map((m) => ({ med: m, qty: stockOf(m.id) })).filter((x) => x.qty <= x.med.reorderLevel)
  const cutoff = addDays(todayISO(), 60)
  const expiring = (batches ?? []).filter((b) => b.quantity > 0 && b.expiry <= cutoff).sort((a, b) => a.expiry.localeCompare(b.expiry))

  async function dispense(id: string) {
    try { await repo.dispensePrescription(id); toast.success('Dispensed', 'Stock deducted (FEFO)'); reloadRx(); reloadB() }
    catch (e) { toast.error('Dispense failed', String((e as Error).message)) }
  }

  return (
    <div>
      <PageHeader title="Pharmacy" subtitle="Dispense prescriptions & manage medicine inventory" icon={<Pill size={22} />}
        actions={can('pharmacy.inventory') && <button className="btn-primary" onClick={() => setPurchaseOpen(true)}><Plus size={16} /> Purchase Entry</button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Rx Queue</p><p className="mt-1 text-2xl font-extrabold text-ink">{queue.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Medicines</p><p className="mt-1 text-2xl font-extrabold text-ink">{(medicines ?? []).length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Low Stock</p><p className="mt-1 text-2xl font-extrabold text-amber-600">{low.length}</p></Card>
        <Card className="p-4"><p className="text-xs font-semibold uppercase text-ink-faint">Expiring ≤60d</p><p className="mt-1 text-2xl font-extrabold text-rose-600">{expiring.length}</p></Card>
      </div>
      <div className="mb-4 flex gap-1 rounded-lg bg-surface-sunken p-1">
        <button onClick={() => setTab('queue')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'queue' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>Prescription Queue</button>
        <button onClick={() => setTab('inventory')} className={`rounded-md px-4 py-2 text-sm font-semibold ${tab === 'inventory' ? 'bg-white text-brand-700 shadow-sm' : 'text-ink-soft'}`}>Inventory & Batches</button>
      </div>

      {tab === 'queue' ? (
        <Card>
          {queue.length === 0 ? <EmptyState icon={<PackageCheck size={22} />} title="Queue is clear" hint="Prescriptions from doctors appear here for dispensing." /> : (
            <div className="divide-y divide-surface-line">
              {queue.map((rx) => (
                <div key={rx.id} className="p-4">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <div><span className="font-mono text-sm font-semibold text-brand-700">{rx.code ?? rx.id}</span><span className="ml-2 font-medium text-ink">{patientName(rx.patientId)}</span><span className="ml-2 text-xs text-ink-faint">{doctorName(rx.doctorId)} · {relTime(rx.createdAt)}</span></div>
                    {can('pharmacy.dispense') && <button className="btn-primary !px-3 !py-1.5 text-xs" onClick={() => dispense(rx.id)}><PackageCheck size={14} /> Dispense</button>}
                  </div>
                  <Table head={<><th className="th">Medicine</th><th className="th">Dosage</th><th className="th">Freq</th><th className="th">Duration</th><th className="th">Qty</th><th className="th">Stock</th></>}>
                    {rx.items.map((it) => {
                      const med = (medicines ?? []).find((m) => m.name.toLowerCase() === it.medicineName.toLowerCase())
                      const stock = med ? stockOf(med.id) : null
                      return (
                        <tr key={it.id}>
                          <td className="td font-medium">{it.medicineName}</td><td className="td">{it.dosage}</td><td className="td">{it.frequency}</td><td className="td">{it.duration}</td><td className="td">{it.quantity}</td>
                          <td className="td">{stock == null ? <Badge tone="slate">not in catalog</Badge> : stock >= it.quantity ? <Badge tone="green">{stock}</Badge> : <Badge tone="red">{stock} (short)</Badge>}</td>
                        </tr>
                      )
                    })}
                  </Table>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <div className="space-y-4">
          {(low.length > 0 || expiring.length > 0) && (
            <div className="grid gap-4 md:grid-cols-2">
              {low.length > 0 && (
                <Card><div className="border-b border-surface-line px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-bold text-amber-700"><AlertTriangle size={15} /> Low Stock</h3></div>
                  <div className="space-y-1.5 p-3">{low.map(({ med, qty }) => <div key={med.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2 text-sm"><span className="font-medium">{med.name}</span><span>{qty} / reorder {med.reorderLevel}</span></div>)}</div></Card>
              )}
              {expiring.length > 0 && (
                <Card><div className="border-b border-surface-line px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-bold text-rose-700"><CalendarClock size={15} /> Expiring Soon</h3></div>
                  <div className="space-y-1.5 p-3">{expiring.map((b) => { const m = (medicines ?? []).find((x) => x.id === b.medicineId); return <div key={b.id} className="flex items-center justify-between rounded-lg bg-rose-50 px-3 py-2 text-sm"><span className="font-medium">{m?.name} · {b.batchNo}</span><span>exp {fmtDate(b.expiry)} · {b.quantity}u</span></div> })}</div></Card>
              )}
            </div>
          )}
          <Card>
            <div className="border-b border-surface-line px-5 py-3"><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><Boxes size={16} /> Medicine Catalog</h3></div>
            <Table head={<><th className="th">Medicine</th><th className="th">Category</th><th className="th">MRP</th><th className="th">Total Stock</th><th className="th">Batches</th><th className="th">Reorder</th></>}>
              {(medicines ?? []).map((m) => {
                const mb = (batches ?? []).filter((b) => b.medicineId === m.id); const stock = mb.reduce((s, b) => s + b.quantity, 0)
                return (
                  <tr key={m.id}>
                    <td className="td font-medium">{m.name}</td><td className="td text-ink-soft">{m.category}</td><td className="td">{inr(m.mrp)}</td>
                    <td className="td"><Badge tone={stock <= m.reorderLevel ? 'red' : 'green'}>{stock} {m.unit}s</Badge></td>
                    <td className="td text-xs text-ink-faint">{mb.map((b) => `${b.batchNo} (${b.quantity})`).join(', ') || '—'}</td>
                    <td className="td text-ink-soft">{m.reorderLevel}</td>
                  </tr>
                )
              })}
            </Table>
          </Card>
        </div>
      )}
      {purchaseOpen && <PurchaseModal medicines={medicines ?? []} onClose={() => setPurchaseOpen(false)} onDone={reloadB} />}
    </div>
  )
}

function PurchaseModal({ medicines, onClose, onDone }: { medicines: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const repo = getRepository()
  const [f, setF] = useState({ medicineId: medicines[0]?.id ?? '', batchNo: '', quantity: 100, purchasePrice: 1, expiry: addDays(todayISO(), 365), supplier: 'MediSupply Distributors' })
  const [busy, setBusy] = useState(false)
  async function submit() {
    if (!f.medicineId || !f.batchNo.trim()) return toast.error('Medicine and batch number required')
    setBusy(true)
    try { await repo.addMedicineBatch(f); toast.success('Stock added', `${f.quantity} units · batch ${f.batchNo}`); onDone(); onClose() }
    catch (e) { toast.error('Failed', String((e as Error).message)) } finally { setBusy(false) }
  }
  return (
    <Modal open onClose={onClose} title="Purchase / Stock Entry" subtitle="Add a new batch to inventory"
      footer={<><button className="btn-outline" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={submit} disabled={busy}>{busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add Stock</button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Medicine" required><select className="input" value={f.medicineId} onChange={(e) => setF({ ...f, medicineId: e.target.value })}>{medicines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></Field>
        <Field label="Batch No" required><input className="input" value={f.batchNo} onChange={(e) => setF({ ...f, batchNo: e.target.value })} /></Field>
        <Field label="Quantity"><input type="number" className="input" value={f.quantity} onChange={(e) => setF({ ...f, quantity: Number(e.target.value) })} /></Field>
        <Field label="Purchase Price / unit"><input type="number" step="0.1" className="input" value={f.purchasePrice} onChange={(e) => setF({ ...f, purchasePrice: Number(e.target.value) })} /></Field>
        <Field label="Expiry"><input type="date" className="input" value={f.expiry} onChange={(e) => setF({ ...f, expiry: e.target.value })} /></Field>
        <Field label="Supplier"><input className="input" value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
      </div>
    </Modal>
  )
}
