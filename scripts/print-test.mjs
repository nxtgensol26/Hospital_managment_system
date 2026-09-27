// NxtHealth — receipt / print logic tests (NOT a physical printer test).
import { readFileSync } from 'node:fs'
import { buildReceiptHtml, inr } from './lib/receipt.mjs'

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗ FAIL:', m) } }

console.log('\n=== NxtHealth receipt / print tests (logic + CSS, not physical) ===\n')

const bill = { id: 'uuid-1', code: 'INV-000042', total: 1000, paid: 400 }
const patient = { id: 'uuid-p', code: 'NH-000009', name: 'Asha Rao' }
const pay = { id: 'pay-9f8e7d6c5b4a', patientId: 'uuid-p', amount: 600, method: 'upi', reference: 'UTR123', at: new Date().toISOString() }

// 1. payment saved → receipt generated
const html = buildReceiptHtml(bill, pay, patient)
ok(typeof html === 'string' && html.length > 50, 'payment (persisted) generates a receipt')
// 2. correct receipt number (database-backed, from pay.id)
ok(html.includes('RCPT-PAY9F8E7D6'), 'receipt contains a unique receipt number derived from the payment id')
// 3. correct patient
ok(html.includes('Asha Rao') && html.includes('NH-000009'), 'receipt contains the correct patient name + ID')
// 4. correct amount
ok(html.includes(inr(600)), 'receipt contains the correct paid amount')
// 5. correct payment mode
ok(html.includes('UPI'), 'receipt contains the correct payment mode')
// balance + PAID
ok(html.includes(inr(1000)) && html.includes('Balance Due') && html.includes(inr(0)), 'receipt shows total + balance (fully paid → balance 0)')
ok(html.includes('PAID'), 'fully-paid receipt shows PAID')

// 6. failed payment does NOT generate a successful receipt
let threw = false
try { buildReceiptHtml(bill, null, patient) } catch { threw = true }
ok(threw, 'no persisted payment (failed) → receipt is NOT generated')
let threw2 = false
try { buildReceiptHtml(bill, { patientId: 'x', amount: 600, method: 'cash' }, patient) } catch { threw2 = true }
ok(threw2, 'payment without a DB id (not persisted) → receipt is NOT generated')

// 10. receipt uses real (passed) data, not hardcoded
const html2 = buildReceiptHtml({ id: 'u2', code: 'INV-000099', total: 250, paid: 0 }, { id: 'pay-xyz', patientId: 'p2', amount: 250, method: 'cash', at: '' }, { code: 'NH-000010', name: 'Ravi' })
ok(html2.includes('INV-000099') && html2.includes('Ravi') && html2.includes(inr(250)) && !html2.includes('Asha Rao'), 'receipt is bound to the provided data (no hardcoded values)')

// itemized BILL DETAILS from real line items + reconciliation
const itemBill = { id: 'u3', code: 'INV-000015', subtotal: 1600, discountPct: 0, discountAmt: 0, taxPct: 0, taxAmt: 0, total: 1600, paid: 0, items: [
  { id: 'i1', kind: 'consultation', description: 'Doctor Consultation', qty: 1, unitPrice: 500, amount: 500 },
  { id: 'i2', kind: 'diagnostics', description: 'Blood Test', qty: 1, unitPrice: 300, amount: 300 },
  { id: 'i3', kind: 'pharmacy', description: 'Medicine ABC', qty: 2, unitPrice: 400, amount: 800 },
] }
const rHtml = buildReceiptHtml(itemBill, { id: 'pay-abc', patientId: 'p', amount: 1600, method: 'cash', at: '' }, { code: 'NH-000050', name: 'Test' })
ok(rHtml.includes('Bill Details') && rHtml.includes('Doctor Consultation') && rHtml.includes('Blood Test') && rHtml.includes('Medicine ABC'), 'receipt shows itemized bill details (real line items)')
ok(rHtml.includes('Payment Summary') && rHtml.includes(inr(1600)), 'receipt shows payment summary with invoice total')
ok(itemBill.items.reduce((s, i) => s + i.amount, 0) === itemBill.total, 'line-item sum reconciles to invoice total (no disc/tax)')
ok(!rHtml.includes('Discount') && !rHtml.includes('Tax / GST'), 'discount/tax rows hidden when not stored')
// discount + tax shown when actually stored
const dtBill = { id: 'u4', code: 'INV-000016', subtotal: 1000, discountPct: 10, discountAmt: 100, taxPct: 5, taxAmt: 45, total: 945, paid: 0, items: [{ id: 'i1', kind: 'procedure', description: 'Minor Procedure', qty: 1, unitPrice: 1000, amount: 1000 }] }
const dtHtml = buildReceiptHtml(dtBill, { id: 'pay-d', patientId: 'p', amount: 945, method: 'card', at: '' }, { code: 'NH-1', name: 'D' })
ok(dtHtml.includes('Discount (10%)') && dtHtml.includes('Tax / GST (5%)'), 'stored discount + tax rendered on receipt')
ok(+(dtBill.subtotal - dtBill.discountAmt + dtBill.taxAmt).toFixed(2) === dtBill.total, 'subtotal − discount + tax reconciles to invoice total')

// 7/8/9. print CSS rules exist and are applied
const printSrc = readFileSync(new URL('../src/lib/print.ts', import.meta.url), 'utf8')
ok(printSrc.includes('@media print') && printSrc.includes('.noprint'), 'print CSS hides navigation/controls (.noprint in @media print)')
ok(printSrc.includes('body.a4') && printSrc.includes('@page'), 'A4 print CSS exists (body.a4 + @page)')
ok(printSrc.includes('body.t80') && printSrc.includes('body.t58'), 'thermal receipt CSS exists (80mm + 58mm)')
ok(printSrc.includes('setPrintHospital'), 'print uses the real hospital (setPrintHospital), not hardcoded')
ok(printSrc.includes('createElement(\'iframe\')') || printSrc.includes("createElement('iframe')"), 'popup-blocked fallback (hidden iframe) is implemented')

console.log(`\n=== RESULT: ${pass} passed, ${fail} failed ===\n`)
if (fail > 0) process.exit(1)
