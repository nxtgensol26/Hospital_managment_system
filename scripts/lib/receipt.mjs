// NxtHealth — pure receipt/invoice HTML builders (testable).
// Mirrors the receipt logic in src/features/billing/Billing.tsx (printReceipt).
// A receipt can ONLY be built from a PERSISTED payment (pay.id present).
export function inr(n) { return '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

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
    <div class="totals">
      <div><span>Invoice Total</span><span>${inr(bill.total)}</span></div>
      <div class="grand"><span>Amount Paid Now</span><span>${inr(pay.amount)}</span></div>
      <div><span>Paid to date</span><span>${inr(paidToDate)}</span></div>
      <div><span>Balance Due</span><span>${inr(balance)}</span></div>
    </div>`
}
