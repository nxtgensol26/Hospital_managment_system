import { APP } from '../config'
import { useDB } from '../store/db'
import type { Hospital } from '../types'

/**
 * Print utility. Renders a self-contained, branded document and prints it.
 * - Uses the REAL hospital (set via setPrintHospital from the app shell) so
 *   Supabase-mode prints show the authenticated hospital, not the local seed.
 * - Supports A4 and thermal (80mm / 58mm) layouts, switchable in the preview.
 * - Falls back to a hidden iframe when the popup window is blocked.
 * - Only the document prints (toolbar is .noprint).
 */
let currentHospital: Partial<Hospital> | null = null
export function setPrintHospital(h: Partial<Hospital> | null) { currentHospital = h }
function hospital(): Partial<Hospital> {
  if (currentHospital) return currentHospital
  try { return useDB.getState().db.hospital } catch { return { name: APP.product } }
}

export type PrintLayout = 'a4' | 'thermal80' | 'thermal58'

const css = `
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #10233f; margin: 0; }
  .doc { margin: 0 auto; padding: 24px; }
  body.a4 .doc { max-width: 720px; }
  body.t80 .doc { max-width: 80mm; padding: 6px 8px; font-size: 12px; }
  body.t58 .doc { max-width: 58mm; padding: 5px 6px; font-size: 11px; }
  .head { display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 3px solid #1866e0; padding-bottom: 12px; gap:10px; }
  body.t80 .head, body.t58 .head { display:block; text-align:center; border-bottom:2px dashed #999; }
  .brand { display:flex; align-items:center; gap:10px; }
  body.t80 .brand, body.t58 .brand { justify-content:center; }
  .brand .mark { width:40px; height:40px; border-radius:10px; background:linear-gradient(135deg,#2f84f5,#16aaa4); display:grid; place-items:center; color:#fff; font-weight:800; font-size:18px; }
  body.t80 .brand .mark, body.t58 .brand .mark { display:none; }
  .brand h1 { margin:0; font-size:20px; } .brand h1 span { color:#1866e0; }
  .brand .tag { font-size:11px; color:#667; }
  body.t80 .brand .tag, body.t58 .brand .tag { display:none; }
  .hosp { text-align:right; font-size:12px; color:#42536e; }
  body.t80 .hosp, body.t58 .hosp { text-align:center; font-size:11px; margin-top:4px; }
  .hosp b { color:#10233f; font-size:14px; }
  h2.title { font-size:15px; text-transform:uppercase; letter-spacing:.06em; color:#1866e0; margin: 18px 0 10px; }
  body.t80 h2.title, body.t58 h2.title { text-align:center; font-size:13px; margin:10px 0 6px; }
  table { width:100%; border-collapse:collapse; font-size:13px; }
  body.t80 table, body.t58 table { font-size:11px; }
  th,td { text-align:left; padding:7px 9px; border-bottom:1px solid #e2eaf2; }
  body.t80 th, body.t80 td, body.t58 th, body.t58 td { padding:3px 2px; }
  th { background:#f4f8fc; font-size:11px; text-transform:uppercase; color:#667; }
  body.t80 th, body.t58 th { background:none; border-bottom:1px dashed #999; }
  tr, td, th { page-break-inside: avoid; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:6px 20px; font-size:13px; }
  body.t80 .grid, body.t58 .grid { grid-template-columns:1fr; gap:2px; font-size:11px; }
  .grid div { padding:4px 0; border-bottom:1px dashed #e2eaf2; }
  .grid span { color:#667; display:inline-block; min-width:130px; }
  body.t80 .grid span, body.t58 .grid span { min-width:80px; }
  .box { border:1px solid #dce7f0; border-radius:12px; padding:14px; margin-top:12px; }
  body.t80 .box, body.t58 .box { border:0; border-top:1px dashed #999; border-radius:0; padding:6px 0; }
  .cred { background:#eef6ff; border:1px dashed #8ec6ff; border-radius:12px; padding:14px; margin-top:12px; }
  .cred b { font-family: Consolas, monospace; }
  .totals { margin-left:auto; width:280px; font-size:13px; margin-top:10px; }
  body.t80 .totals, body.t58 .totals { width:100%; font-size:11px; }
  .totals div { display:flex; justify-content:space-between; padding:5px 0; }
  .totals .grand { border-top:2px solid #1866e0; font-weight:800; font-size:15px; padding-top:8px; }
  .foot { margin-top:24px; border-top:1px solid #e2eaf2; padding-top:12px; font-size:11px; color:#8494ac; display:flex; justify-content:space-between; }
  body.t80 .foot, body.t58 .foot { display:block; text-align:center; border-top:1px dashed #999; }
  .pill { display:inline-block; padding:3px 9px; border-radius:99px; background:#e7f7ef; color:#137443; font-size:11px; font-weight:700; }
  .toolbar { position:sticky; top:0; background:#0f1e3d; color:#fff; padding:10px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap; }
  .toolbar button { padding:8px 14px; border:0; border-radius:8px; font-weight:700; cursor:pointer; background:#1866e0; color:#fff; }
  .toolbar button.alt { background:#334; }
  @page { margin: 12mm; }
  body.t80 { }  body.t58 { }
  @media print { .noprint { display:none !important; } .doc { padding: 0; } @page { margin: 6mm; } }
`

function buildHtml(title: string, inner: string, layout: PrintLayout): string {
  const h = hospital()
  const bodyClass = layout === 'thermal58' ? 't58' : layout === 'thermal80' ? 't80' : 'a4'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — ${APP.product}</title><style>${css}</style></head>
  <body class="${bodyClass}">
  <div class="toolbar noprint">
    <button data-nxt-layout="a4">Print A4</button>
    <button class="alt" data-nxt-layout="t80">Thermal 80mm</button>
    <button class="alt" data-nxt-layout="t58">Thermal 58mm</button>
    <button class="alt" data-nxt-print="1">Save as PDF</button>
  </div>
  <div class="doc">
    <div class="head">
      <div class="brand"><div class="mark">N</div><div><h1>Nxt<span>Health</span></h1><div class="tag">${APP.tagline}</div></div></div>
      <div class="hosp"><b>${h.name ?? APP.product}</b><br/>${h.address ?? ''}<br/>${h.city ?? ''}<br/>${h.phone ?? ''}</div>
    </div>
    ${inner}
    <div class="foot"><span>${APP.product} by ${APP.company}</span><span>Support: ${APP.support.phone} · ${APP.support.email}</span></div>
  </div>
  </body></html>`
}

// Wire the toolbar without inline scripts/handlers, so the print document works
// under a strict Content-Security-Policy (script-src 'self'). The controls are
// attached programmatically from this (same-origin) app code.
function wireControls(win: Window) {
  try {
    const d = win.document
    d.querySelectorAll<HTMLElement>('[data-nxt-layout]').forEach((b) => b.addEventListener('click', () => { d.body.className = b.getAttribute('data-nxt-layout') || 'a4'; win.print() }))
    d.querySelectorAll<HTMLElement>('[data-nxt-print]').forEach((b) => b.addEventListener('click', () => win.print()))
  } catch { /* ignore */ }
}

export function printDoc(title: string, inner: string, opts?: { layout?: PrintLayout }) {
  const html = buildHtml(title, inner, opts?.layout ?? 'a4')
  const w = window.open('', '_blank', 'width=860,height=920')
  if (w) { w.document.open(); w.document.write(html); w.document.close(); wireControls(w); w.focus(); return }
  // Popup blocked → print via a hidden iframe.
  const iframe = document.createElement('iframe')
  iframe.style.position = 'fixed'; iframe.style.right = '0'; iframe.style.bottom = '0'
  iframe.style.width = '0'; iframe.style.height = '0'; iframe.style.border = '0'
  document.body.appendChild(iframe)
  const doc = iframe.contentWindow?.document
  if (!doc) return
  doc.open(); doc.write(html); doc.close()
  const cw = iframe.contentWindow!
  const done = () => { try { cw.focus(); cw.print() } catch { /* ignore */ } setTimeout(() => iframe.remove(), 60000) }
  if (doc.readyState === 'complete') setTimeout(done, 200)
  else cw.addEventListener('load', () => setTimeout(done, 200))
}
