import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import {
  Search, Command, LogOut, UserRound, ChevronDown, PanelLeftClose, PanelLeft, Plus, ShieldCheck, Clock,
} from 'lucide-react'
import { Wordmark, LogoMark } from '../Logo'
import { NAV } from './nav'
import { useAuth } from '../../store/auth'
import { ROLE_LABELS } from '../../lib/rbac'
import { GlobalSearch } from './GlobalSearch'
import { ForcePasswordChange } from '../../features/auth/ForcePasswordChange'
import { LicenseBanner } from './LicenseBanner'
import { APP } from '../../config'
import { Avatar } from '../ui'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'
import { setPrintHospital } from '../../lib/print'

export function AppShell() {
  const user = useAuth((s) => s.user)!
  const can = useAuth((s) => s.can)
  const logout = useAuth((s) => s.logout)
  const repo = getRepository()
  const { data: hospital } = useQuery(() => repo.getHospital(), [])
  const { data: license } = useQuery(() => repo.licenseCurrent(), [])
  const [collapsed, setCollapsed] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const nav = useNavigate()
  const loc = useLocation()
  const status = license?.status ?? 'unlicensed'
  const daysLeft = license?.daysLeft ?? null
  const licType = (license?.license?.type ?? license?.license?.type) as string | undefined
  const licModules: string[] = (license?.license?.modules ?? []) as string[]
  // Module gating: active/trial → by license; expired → locked; unlicensed → open (pre-licensing).
  const isEnabled = (mod?: string) => {
    if (!mod) return true
    if (status === 'active' || status === 'trial') return licModules.includes(mod)
    if (status === 'expired' || status === 'invalid') return false
    return true
  }

  useEffect(() => { if (hospital) setPrintHospital(hospital) }, [hospital])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen(true)
      }
      if (e.key === 'Escape') setSearchOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const crumbs = buildCrumbs(loc.pathname)

  return (
    <div className="flex h-screen overflow-hidden bg-surface-muted">
      {/* Sidebar */}
      <aside className={`flex shrink-0 flex-col border-r border-surface-line bg-white shadow-rail transition-all duration-200 ${collapsed ? 'w-[68px]' : 'w-[248px]'}`}>
        <div className="flex h-16 items-center justify-between px-4">
          {collapsed ? <LogoMark size={32} /> : <Wordmark size="sm" />}
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-4">
          {NAV.map((section) => {
            const items = section.items.filter((i) => (!i.perm || can(i.perm)))
            if (items.length === 0) return null
            return (
              <div key={section.title} className="mb-4">
                {!collapsed && <p className="px-2 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-faint">{section.title}</p>}
                <div className="space-y-0.5">
                  {items.map((item) => {
                    const locked = item.module && !isEnabled(item.module)
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.to === '/dashboard'}
                        title={collapsed ? item.label : undefined}
                        className={({ isActive }) =>
                          `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium transition ${
                            isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-soft hover:bg-surface-muted hover:text-ink'
                          } ${collapsed ? 'justify-center' : ''}`
                        }
                      >
                        <item.icon size={18} className="shrink-0" />
                        {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                        {!collapsed && locked && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500">LOCKED</span>}
                      </NavLink>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </nav>
        {!collapsed && (
          <div className="border-t border-surface-line p-3">
            <div className="rounded-xl bg-surface-muted p-3">
              <p className="text-[11px] font-semibold text-ink">{hospital?.name ?? 'NxtHealth'}</p>
              <p className="mt-0.5 flex items-center gap-1 text-[11px] text-ink-faint">
                {status === 'trial' ? <><Clock size={11} className="text-amber-500" /> Trial · {daysLeft ?? '—'}d left</>
                  : status === 'active' ? <><ShieldCheck size={11} className="text-teal-600" /> {licType} license</>
                  : status === 'expired' ? <><Clock size={11} className="text-rose-500" /> License expired</>
                  : <><ShieldCheck size={11} className="text-ink-faint" /> Unlicensed</>}
              </p>
            </div>
          </div>
        )}
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Topbar */}
        <header className="flex h-16 shrink-0 items-center gap-3 border-b border-surface-line bg-white px-4">
          <button onClick={() => setCollapsed((c) => !c)} className="rounded-lg p-2 text-ink-faint hover:bg-surface-muted" title="Toggle sidebar">
            {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
          </button>

          {/* Breadcrumbs */}
          <div className="hidden items-center gap-1.5 text-sm text-ink-faint md:flex">
            {crumbs.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-surface-line">/</span>}
                <span className={i === crumbs.length - 1 ? 'font-semibold text-ink' : ''}>{c}</span>
              </span>
            ))}
          </div>

          <div className="flex-1" />

          {/* Global search trigger */}
          <button onClick={() => setSearchOpen(true)} className="flex items-center gap-2 rounded-lg border border-surface-line bg-surface-muted px-3 py-2 text-sm text-ink-faint hover:bg-surface-sunken">
            <Search size={16} />
            <span className="hidden lg:inline">Search patients…</span>
            <kbd className="hidden items-center gap-0.5 rounded border border-surface-line bg-white px-1.5 py-0.5 text-[10px] lg:flex"><Command size={10} />K</kbd>
          </button>

          {can('patients.create') && (
            <button onClick={() => nav('/patients/new')} className="btn-primary hidden sm:inline-flex"><Plus size={16} /> New Patient</button>
          )}

          {/* Profile */}
          <div className="relative">
            <button onClick={() => setMenuOpen((m) => !m)} className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-surface-muted">
              <Avatar name={user.name} size={34} />
              <div className="hidden text-left leading-tight sm:block">
                <p className="text-sm font-semibold text-ink">{user.name}</p>
                <p className="text-[11px] text-ink-faint">{ROLE_LABELS[user.role]}</p>
              </div>
              <ChevronDown size={15} className="text-ink-faint" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-30" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 z-40 mt-2 w-56 animate-scale-in rounded-xl border border-surface-line bg-white p-1.5 shadow-pop">
                  <div className="border-b border-surface-line px-3 py-2">
                    <p className="text-sm font-semibold text-ink">{user.name}</p>
                    <p className="text-xs text-ink-faint">{user.email || user.username}</p>
                  </div>
                  <Link to="/profile" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted"><UserRound size={15} /> My Profile</Link>
                  <Link to="/support" onClick={() => setMenuOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-ink-soft hover:bg-surface-muted"><ShieldCheck size={15} /> Support</Link>
                  <button onClick={async () => { await logout(); nav('/') }} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-rose-600 hover:bg-rose-50"><LogOut size={15} /> Sign out</button>
                </div>
              </>
            )}
          </div>
        </header>

        <LicenseBanner />

        {/* Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1400px] px-4 py-6 md:px-6">
            <Outlet />
          </div>
          <footer className="border-t border-surface-line px-6 py-4 text-center text-xs text-ink-faint">
            {APP.product} v{APP.version} · {APP.company} · {APP.support.phone} · {APP.support.email}
          </footer>
        </main>
      </div>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ForcePasswordChange />
    </div>
  )
}

function buildCrumbs(path: string): string[] {
  const map: Record<string, string> = {
    dashboard: 'Control Room', patients: 'Patients', new: 'New Registration', appointments: 'Appointments',
    queue: 'OPD Queue', emergency: 'Emergency', consultations: 'Consultations', lab: 'Diagnostics',
    pharmacy: 'Pharmacy', beds: 'Bed Management', ipd: 'IPD', billing: 'Billing', reports: 'Reports & Flow',
    notifications: 'Notifications', audit: 'Audit Log', admin: 'Administration', license: 'License Manager',
    support: 'Support', profile: 'My Profile',
  }
  const parts = path.split('/').filter(Boolean)
  return ['NxtHealth', ...parts.map((p) => map[p] || (p.match(/^NH-/) ? p : p))]
}
