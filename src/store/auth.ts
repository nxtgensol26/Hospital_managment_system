import { create } from 'zustand'
import type { User } from '../types'
import { useDB } from './db'
import { verifyPassword, hashPassword } from '../lib/crypto'
import { roleCan, type Permission } from '../lib/rbac'
import { pushAudit } from '../services/audit'
import { isSupabase } from '../lib/supabase'
import { supabaseAuth } from '../services/supabase-auth'

const SESSION_KEY = 'nxthealth.session.v1'

type Result = { ok: boolean; reason?: string; mustChange?: boolean }

interface AuthStore {
  user: User | null
  ready: boolean
  recovery: boolean
  login: (username: string, password: string) => Promise<Result>
  loginPatient: (loginId: string, password: string) => Promise<Result>
  logout: () => Promise<void>
  changePassword: (oldPass: string, newPass: string) => Promise<Result>
  sendReset: (email: string) => Promise<Result>
  can: (permission: Permission) => boolean
  restore: () => Promise<void>
}

let recoverySubscribed = false

function saveLocalSession(userId: string | null) {
  try {
    if (userId) localStorage.setItem(SESSION_KEY, userId)
    else localStorage.removeItem(SESSION_KEY)
  } catch { /* ignore */ }
}

export const useAuth = create<AuthStore>((set, get) => ({
  user: null,
  ready: false,
  recovery: false,

  restore: async () => {
    if (isSupabase) {
      if (!recoverySubscribed) {
        recoverySubscribed = true
        supabaseAuth.onAuthEvent((event) => { if (event === 'PASSWORD_RECOVERY') set({ recovery: true }) })
      }
      try {
        const user = await supabaseAuth.restore()
        set({ user, ready: true })
      } catch {
        set({ ready: true })
      }
      return
    }
    try {
      const id = localStorage.getItem(SESSION_KEY)
      if (id) {
        const u = useDB.getState().db.users.find((x) => x.id === id && x.active)
        if (u) set({ user: u })
      }
    } catch { /* ignore */ }
    set({ ready: true })
  },

  login: async (username, password) => {
    if (isSupabase) {
      const res = await supabaseAuth.login(username, password)
      if (res.ok && res.user) set({ user: res.user })
      return { ok: res.ok, reason: res.reason, mustChange: res.mustChange }
    }
    // ---- local DEV mode ----
    const db = useDB.getState().db
    const u = db.users.find((x) => x.username.toLowerCase() === username.trim().toLowerCase() && x.role !== 'patient')
    if (!u || !u.active) return { ok: false, reason: 'Invalid username or password.' }
    if (!verifyPassword(password, u.passwordHash)) return { ok: false, reason: 'Invalid username or password.' }
    useDB.getState().update((d) => {
      const target = d.users.find((x) => x.id === u.id)!
      target.lastLoginAt = new Date().toISOString()
      pushAudit(d, { id: u.id, name: u.name, role: u.role }, 'Signed in', 'user', u.id)
    })
    const fresh = useDB.getState().db.users.find((x) => x.id === u.id)!
    set({ user: fresh })
    saveLocalSession(u.id)
    return { ok: true, mustChange: !!u.mustChangePassword }
  },

  loginPatient: async (loginId, password) => {
    if (isSupabase) {
      const res = await supabaseAuth.loginPatient(loginId, password)
      if (res.ok && res.user) set({ user: res.user })
      return { ok: res.ok, reason: res.reason, mustChange: res.mustChange }
    }
    // ---- local DEV mode ----
    const db = useDB.getState().db
    const cred = db.patientCredentials.find((c) => c.loginId.toLowerCase() === loginId.trim().toLowerCase())
    if (!cred) return { ok: false, reason: 'Invalid Patient ID or password.' }
    const patient = db.patients.find((p) => p.id === cred.patientId)
    if (!patient) return { ok: false, reason: 'Patient record not found.' }
    let ok = false
    let mustChange = !cred.passwordChanged
    let userRec = db.users.find((u) => u.patientId === patient.id && u.role === 'patient')
    if (!cred.passwordChanged && cred.tempPassword) ok = password === cred.tempPassword
    else if (userRec) { ok = verifyPassword(password, userRec.passwordHash); mustChange = !!userRec.mustChangePassword }
    if (!ok) return { ok: false, reason: 'Invalid Patient ID or password.' }
    if (!userRec) {
      const created: User = {
        id: `pu_${patient.id}`, name: patient.name, username: patient.id, role: 'patient', patientId: patient.id,
        passwordHash: hashPassword(cred.tempPassword || 'temp'), mustChangePassword: mustChange, active: true, createdAt: new Date().toISOString(),
      }
      useDB.getState().update((d) => { d.users.push(created); pushAudit(d, { id: created.id, name: created.name, role: 'patient' }, 'Patient portal sign-in', 'patient', patient.id) })
    }
    const finalUser = useDB.getState().db.users.find((u) => u.patientId === patient.id && u.role === 'patient')!
    set({ user: finalUser })
    saveLocalSession(finalUser.id)
    return { ok: true, mustChange }
  },

  logout: async () => {
    if (isSupabase) { await supabaseAuth.logout(); set({ user: null }); return }
    const u = get().user
    if (u) useDB.getState().update((d) => pushAudit(d, { id: u.id, name: u.name, role: u.role }, 'Signed out', 'user', u.id))
    set({ user: null })
    saveLocalSession(null)
  },

  changePassword: async (oldPass, newPass) => {
    const u = get().user
    if (!u) return { ok: false, reason: 'Not signed in.' }
    if (isSupabase) {
      const res = await supabaseAuth.changePassword(newPass)
      if (res.ok) set({ user: { ...u, mustChangePassword: false }, recovery: false })
      return res
    }
    if (newPass.length < 6) return { ok: false, reason: 'New password must be at least 6 characters.' }
    if (u.role === 'patient') {
      const db = useDB.getState().db
      const cred = db.patientCredentials.find((c) => c.patientId === u.patientId)
      const validOld = (cred && !cred.passwordChanged && cred.tempPassword === oldPass) || verifyPassword(oldPass, u.passwordHash)
      if (!validOld) return { ok: false, reason: 'Current password is incorrect.' }
      useDB.getState().update((d) => {
        const target = d.users.find((x) => x.id === u.id)!
        target.passwordHash = hashPassword(newPass); target.mustChangePassword = false
        const c = d.patientCredentials.find((x) => x.patientId === u.patientId)
        if (c) { c.passwordChanged = true; c.tempPassword = undefined }
        pushAudit(d, { id: u.id, name: u.name, role: u.role }, 'Password changed', 'user', u.id)
      })
    } else {
      if (!verifyPassword(oldPass, u.passwordHash)) return { ok: false, reason: 'Current password is incorrect.' }
      useDB.getState().update((d) => {
        const target = d.users.find((x) => x.id === u.id)!
        target.passwordHash = hashPassword(newPass); target.mustChangePassword = false
        pushAudit(d, { id: u.id, name: u.name, role: u.role }, 'Password changed', 'user', u.id)
      })
    }
    const fresh = useDB.getState().db.users.find((x) => x.id === u.id)!
    set({ user: fresh })
    return { ok: true }
  },

  sendReset: async (email) => {
    if (!isSupabase) return { ok: false, reason: 'Password reset requires the Supabase backend.' }
    return supabaseAuth.sendReset(email)
  },

  can: (permission) => {
    const u = get().user
    if (!u) return false
    return roleCan(u.role, permission)
  },
}))
