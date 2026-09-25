import type { User, Role } from '../types'
import { supabase } from '../lib/supabase'

/**
 * Supabase-backed authentication. Credentials are handled by Supabase Auth
 * (bcrypt, sessions, refresh tokens) — the app never sees password hashes.
 * The app User is hydrated from the public.users profile (RLS-guarded).
 */

const PATIENT_EMAIL_DOMAIN = '@patients.nxthealth.local'

/** Map a patient code (NH-000001) to its synthetic portal email. */
export function patientEmail(loginId: string): string {
  const v = loginId.trim()
  if (v.includes('@')) return v
  return `${v.toLowerCase()}${PATIENT_EMAIL_DOMAIN}`
}

async function profileToUser(): Promise<User | null> {
  const client = supabase()
  const { data: auth } = await client.auth.getUser()
  const authUser = auth.user
  if (!authUser) return null
  const { data: profile } = await client
    .from('users')
    .select('id,name,username,email,role,doctor_id,patient_id,hospital_id,must_change_password,active')
    .eq('id', authUser.id)
    .maybeSingle()
  if (!profile) return null
  const mustChange =
    (authUser.user_metadata?.must_change_password as boolean | undefined) ?? profile.must_change_password ?? false
  const user: User = {
    id: profile.id,
    name: profile.name,
    username: profile.username ?? profile.email ?? '',
    email: profile.email ?? authUser.email ?? undefined,
    role: profile.role as Role,
    hospitalId: profile.hospital_id ?? undefined,
    doctorId: profile.doctor_id ?? undefined,
    patientId: profile.patient_id ?? undefined,
    passwordHash: '',
    active: profile.active,
    mustChangePassword: mustChange,
    createdAt: authUser.created_at ?? new Date().toISOString(),
  }
  return user
}

async function auditLogin(user: User, action: string) {
  try {
    await supabase().from('audit_logs').insert({ hospital_id: user.hospitalId ?? null, actor_id: user.id, actor_name: user.name, actor_role: user.role, action, entity: 'user', entity_id: user.id })
  } catch { /* non-blocking */ }
}

export const supabaseAuth = {
  async login(username: string, password: string): Promise<{ ok: boolean; reason?: string; mustChange?: boolean; user?: User }> {
    const email = username.includes('@') ? username.trim() : username.trim() // staff sign in with email
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    if (error) return { ok: false, reason: error.message }
    const user = await profileToUser()
    if (!user) return { ok: false, reason: 'Profile not found for this account.' }
    if (user.role === 'patient') { await supabase().auth.signOut(); return { ok: false, reason: 'Use the Patient Portal tab to sign in.' } }
    await supabase().from('users').update({ last_login_at: new Date().toISOString() }).eq('id', user.id)
    await auditLogin(user, 'Signed in')
    return { ok: true, mustChange: user.mustChangePassword, user }
  },

  async loginPatient(loginId: string, password: string): Promise<{ ok: boolean; reason?: string; mustChange?: boolean; user?: User }> {
    const email = patientEmail(loginId)
    const { error } = await supabase().auth.signInWithPassword({ email, password })
    if (error) return { ok: false, reason: 'Invalid Patient ID or password.' }
    const user = await profileToUser()
    if (!user || user.role !== 'patient') { await supabase().auth.signOut(); return { ok: false, reason: 'Not a patient portal account.' } }
    return { ok: true, mustChange: user.mustChangePassword, user }
  },

  async logout(): Promise<void> {
    try { const u = await profileToUser(); if (u && u.role !== 'patient') await auditLogin(u, 'Signed out') } catch { /* ignore */ }
    await supabase().auth.signOut()
  },

  async changePassword(newPass: string): Promise<{ ok: boolean; reason?: string }> {
    if (newPass.length < 6) return { ok: false, reason: 'Password must be at least 6 characters.' }
    const { error } = await supabase().auth.updateUser({
      password: newPass,
      data: { must_change_password: false },
    })
    if (error) return { ok: false, reason: error.message }
    const { data: auth } = await supabase().auth.getUser()
    if (auth.user) await supabase().from('users').update({ must_change_password: false }).eq('id', auth.user.id)
    return { ok: true }
  },

  async restore(): Promise<User | null> {
    const { data } = await supabase().auth.getSession()
    if (!data.session) return null
    return profileToUser()
  },

  async sendReset(email: string): Promise<{ ok: boolean; reason?: string }> {
    const redirectTo = `${window.location.origin}/`
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), { redirectTo })
    if (error) return { ok: false, reason: error.message }
    return { ok: true }
  },

  onAuthEvent(cb: (event: string) => void) {
    return supabase().auth.onAuthStateChange((event) => cb(event))
  },
}
