import type { License, LicensePayload, LicenseStatus, LicenseType } from '../types'
import type { ModuleKey } from '../config'
import { hmacSha256 } from '../lib/crypto'
import { useDB } from '../store/db'
import { pushAudit } from './audit'
import { todayISO, addDays } from '../lib/format'

/* ------------------------------------------------------------------ *
 *  LicenseService
 *
 *  A NxtHealth license is a *signed token*, not a frontend boolean.
 *  Token layout:  NXHLIC.<base64url(JSON{ p: payload, s: signature })>
 *
 *  DEV signer  : HMAC-SHA256(DEV_SIGNING_KEY, canonical(payload))
 *  PRODUCTION  : payload signed server-side by NxtGenSol with an
 *                asymmetric private key (RSA / Ed25519). NxtHealth would
 *                then verify with the bundled PUBLIC key. Only `sign()`
 *                and `verifySignature()` change — activation, status and
 *                every UI screen stay identical.
 * ------------------------------------------------------------------ */

// DEV ONLY. Never ship a real signing secret in the distributed client.
const DEV_SIGNING_KEY = 'nxtgensol-dev-license-key-DO-NOT-USE-IN-PROD'

const TRIAL_DAYS = 15
const MONTHLY_DAYS = 30
const YEARLY_DAYS = 365

function canonical(p: LicensePayload): string {
  // stable ordering so signature is reproducible
  return JSON.stringify({
    product: p.product,
    hospitalId: p.hospitalId,
    hospitalName: p.hospitalName,
    type: p.type,
    startDate: p.startDate,
    expiryDate: p.expiryDate,
    userLimit: p.userLimit,
    modules: [...p.modules].sort(),
    issuedBy: p.issuedBy,
    issuedAt: p.issuedAt,
  })
}

function sign(p: LicensePayload): string {
  return hmacSha256(DEV_SIGNING_KEY, canonical(p))
}

function verifySignature(p: LicensePayload, signature: string): boolean {
  return sign(p) === signature
}

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): string {
  const pad = s.length % 4 ? '='.repeat(4 - (s.length % 4)) : ''
  return decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad)))
}

export function expiryFor(type: LicenseType, start: string): string | 'LIFETIME' {
  switch (type) {
    case 'TRIAL':
      return addDays(start, TRIAL_DAYS)
    case 'MONTHLY':
      return addDays(start, MONTHLY_DAYS)
    case 'YEARLY':
      return addDays(start, YEARLY_DAYS)
    case 'LIFETIME':
      return 'LIFETIME'
  }
}

/** Build a signed license token from a payload (used by the generator). */
export function generateToken(input: {
  hospitalId: string
  hospitalName: string
  type: LicenseType
  startDate?: string
  userLimit: number
  modules: ModuleKey[]
}): { token: string; payload: LicensePayload; humanKey: string } {
  const startDate = input.startDate || todayISO()
  const payload: LicensePayload = {
    product: 'NxtHealth',
    hospitalId: input.hospitalId,
    hospitalName: input.hospitalName,
    type: input.type,
    startDate,
    expiryDate: expiryFor(input.type, startDate),
    userLimit: input.userLimit,
    modules: input.modules,
    issuedBy: 'NxtGenSol',
    issuedAt: new Date().toISOString(),
  }
  const signature = sign(payload)
  const token = 'NXHLIC.' + b64urlEncode(JSON.stringify({ p: payload, s: signature }))
  const humanKey = `NXH-${input.type}-${input.hospitalId.replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 10)}-${signature.slice(0, 12).toUpperCase()}`
  return { token, payload, humanKey }
}

export interface DecodedLicense {
  payload: LicensePayload
  signature: string
  signatureValid: boolean
}

export function decodeToken(token: string): DecodedLicense | null {
  try {
    const raw = token.trim()
    if (!raw.startsWith('NXHLIC.')) return null
    const json = JSON.parse(b64urlDecode(raw.slice('NXHLIC.'.length)))
    const payload = json.p as LicensePayload
    const signature = json.s as string
    if (!payload || !signature || payload.product !== 'NxtHealth') return null
    return { payload, signature, signatureValid: verifySignature(payload, signature) }
  } catch {
    return null
  }
}

export function computeStatus(payload: LicensePayload): LicenseStatus {
  if (payload.expiryDate === 'LIFETIME') return 'active'
  const today = todayISO()
  if (today > payload.expiryDate) return 'expired'
  return payload.type === 'TRIAL' ? 'trial' : 'active'
}

export function daysRemaining(payload: LicensePayload): number | null {
  if (payload.expiryDate === 'LIFETIME') return null
  const ms = new Date(payload.expiryDate + 'T23:59:59').getTime() - Date.now()
  return Math.max(0, Math.ceil(ms / 86400000))
}

export type ActivationOutcome =
  | { ok: true; license: License }
  | { ok: false; reason: string }

/** Activate a license from a token OR the app-generated human key. */
export function activate(tokenOrKey: string, hospitalId: string, actorName = 'Activation'): ActivationOutcome {
  const decoded = decodeToken(tokenOrKey)
  if (!decoded) {
    record('failed', tokenOrKey, hospitalId, actorName, 'Unrecognised or malformed license key')
    return { ok: false, reason: 'This does not look like a valid NxtHealth license key.' }
  }
  if (!decoded.signatureValid) {
    record('failed', tokenOrKey, hospitalId, actorName, 'Signature verification failed')
    return { ok: false, reason: 'License signature is invalid. Please contact NxtGenSol support.' }
  }
  if (hospitalId && decoded.payload.hospitalId.toLowerCase() !== hospitalId.toLowerCase()) {
    record('failed', tokenOrKey, hospitalId, actorName, 'Hospital ID mismatch')
    return { ok: false, reason: `This license is issued for Hospital ID "${decoded.payload.hospitalId}".` }
  }
  const status = computeStatus(decoded.payload)
  if (status === 'expired') {
    record('failed', tokenOrKey, hospitalId, actorName, 'License already expired')
    return { ok: false, reason: 'This license has already expired.' }
  }

  const license: License = { ...decoded.payload, key: tokenOrKey, signature: decoded.signature, status }
  useDB.getState().update((db) => {
    db.license = license
    db.hospital.id = license.hospitalId
    pushAudit(db, { id: 'system', name: actorName, role: 'hospital_admin' }, 'License activated', 'license', license.hospitalId, `${license.type} · valid to ${license.expiryDate}`)
    db.licenseActivations.unshift({
      id: `act_${Math.random().toString(36).slice(2, 9)}`,
      key: license.key.slice(0, 40),
      hospitalId,
      activatedAt: new Date().toISOString(),
      activatedBy: actorName,
      result: 'success',
    })
  })
  return { ok: true, license }
}

/** Start the one-and-only 15-day trial for a hospital. */
export function startTrial(hospitalId: string, hospitalName: string, actorName = 'Trial'): ActivationOutcome {
  const db = useDB.getState().db
  if (db.trialUsedHospitalIds.includes(hospitalId.toLowerCase())) {
    return { ok: false, reason: 'A free trial has already been used for this Hospital ID.' }
  }
  const modules: ModuleKey[] = ['opd', 'ipd', 'appointments', 'diagnostics', 'pharmacy', 'billing', 'emergency', 'beds', 'portal', 'reports', 'admin']
  const { token, payload } = generateToken({
    hospitalId,
    hospitalName,
    type: 'TRIAL',
    userLimit: 10,
    modules,
  })
  const license: License = { ...payload, key: token, signature: '', status: 'trial' }
  license.signature = decodeToken(token)!.signature

  useDB.getState().update((store) => {
    store.license = license
    store.hospital.id = hospitalId
    store.hospital.name = hospitalName
    store.trialUsedHospitalIds.push(hospitalId.toLowerCase())
    pushAudit(store, { id: 'system', name: actorName, role: 'hospital_admin' }, 'Trial started', 'license', hospitalId, `15-day trial · valid to ${payload.expiryDate}`)
    store.licenseActivations.unshift({
      id: `act_${Math.random().toString(36).slice(2, 9)}`,
      key: 'TRIAL',
      hospitalId,
      activatedAt: new Date().toISOString(),
      activatedBy: actorName,
      result: 'success',
    })
  })
  return { ok: true, license }
}

function record(result: 'success' | 'failed', key: string, hospitalId: string, actorName: string, reason?: string) {
  useDB.getState().update((db) => {
    db.licenseActivations.unshift({
      id: `act_${Math.random().toString(36).slice(2, 9)}`,
      key: key.slice(0, 40),
      hospitalId,
      activatedAt: new Date().toISOString(),
      activatedBy: actorName,
      result,
      reason,
    })
  })
}

/** Live status of the currently installed license (recomputed against today). */
export function currentStatus(): { status: LicenseStatus; license: License | null; daysLeft: number | null } {
  const license = useDB.getState().db.license
  if (!license) return { status: 'unlicensed', license: null, daysLeft: null }
  if (!verifySignature(license, license.signature)) {
    return { status: 'invalid', license, daysLeft: null }
  }
  const status = computeStatus(license)
  return { status, license: { ...license, status }, daysLeft: daysRemaining(license) }
}

export function isModuleEnabled(mod: ModuleKey): boolean {
  const { license, status } = currentStatus()
  if (!license) return false
  if (status === 'expired' || status === 'invalid') return false
  return license.modules.includes(mod)
}
