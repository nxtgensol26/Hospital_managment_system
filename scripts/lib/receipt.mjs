// NxtHealth — pure receipt/invoice HTML builders (testable).
// Mirrors the receipt logic in src/features/billing/Billing.tsx (printReceipt).
// A receipt can ONLY be built from a PERSISTED payment (pay.id present).
export function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

const SUBHEAD = 'margin:16px 0 6px;font-size:13px;font-weight:800;color:#0f1e3d;letter-spacing:.02em'

// Itemized BILL DETAILS block, derived from the invoice's ACTUAL line items.
// Discount/Tax rows appear only when actually stored (> 0). Nothing is invented.
export function buildBillDetails(bill) {
  const items = Array.isArray(bill.items) ? bill.items : []
  if (!items.length) return ''
  const rows = items.map((it, i) => `<tr><td>${i + 1}. ${it.description}</td><td>${it.kind ?? ''}</td><td style="text-align:center">${Number(it.qty)}</td><td style="text-align:right">${inr(it.unitPrice)}</td><td style="text-align:right">${inr(it.amount)}</td></tr>`).join('')
  const hasDisc = Number(bill.discountAmt) > 0
  const hasTax = Number(bill.taxAmt) > 0
  return `
    <h3 style="${SUBHEAD}">Bill Details</h3>
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

export function buildReceiptHtml(bill, pay, patient) {
  if (!pay || !pay.id) throw new Error('payment must be persisted (pay.id) before generating a receipt')
  const paidToDate = +(Number(bill.paid) + Number(pay.amount)).toFixed(2)
  const balance = +(Number(bill.total) - paidToDate).toFixed(2)
  const receiptNo = 'RCPT-' + String(pay.id).replace(/[^a-zA-Z0-9]/g, '').slice(0, 10).toUpperCase()
  return `
    <h2 class="title">Payment Receipt${balance <= 0 ? ' <span class="pill">PAID</span>' : ''}</h2>
    <div class="grid">
      <div><span>Receipt No</span><b>${receiptNo}</b></div>
      <div><span>Invoice</span>${bill.code ?? bill.id}</div>
      <div><span>Patient</span>${patient?.name ?? ''} (${patient?.code ?? pay.patientId})</div>
      <div><span>Payment Mode</span>${String(pay.method).toUpperCase()}${pay.reference ? ' · ' + pay.reference : ''}</div>
    </div>
    ${buildBillDetails(bill)}
    <h3 style="${SUBHEAD}">Payment Summary</h3>
    <div class="totals">
      <div><span>Invoice Total</span><span>${inr(bill.total)}</span></div>
      <div class="grand"><span>Amount Paid Now</span><span>${inr(pay.amount)}</span></div>
      <div><span>Paid to date</span><span>${inr(paidToDate)}</span></div>
      <div><span>Balance Due</span><span>${inr(balance)}</span></div>
    </div>`
}
