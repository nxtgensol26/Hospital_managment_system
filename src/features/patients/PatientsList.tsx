import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Users, Plus, Search, Phone, ChevronRight, Loader2 } from 'lucide-react'
import { useAuth } from '../../store/auth'
import { PageHeader, Card, Table, Badge, Avatar, EmptyState } from '../../components/ui'
import { ageFromDob, fmtDate } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

export function PatientsList() {
  const repo = getRepository()
  const can = useAuth((s) => s.can)
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { data: rows, loading, error } = useQuery(() => repo.listPatients(q), [q])

  return (
    <div>
      <PageHeader
        title="Patient Master"
        subtitle="Registered patients · permanent IDs"
        icon={<Users size={22} />}
        actions={can('patients.create') && <button className="btn-primary" onClick={() => nav('/patients/new')}><Plus size={16} /> Register Patient</button>}
      />

      <Card>
        <div className="flex items-center gap-2 border-b border-surface-line p-3">
          <div className="relative max-w-md flex-1">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <input className="input pl-9" placeholder="Search by Patient ID, name or mobile…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          {loading && <Loader2 size={16} className="animate-spin text-ink-faint" />}
        </div>
        {error ? (
          <EmptyState icon={<Users size={22} />} title="Couldn't load patients" hint={error} />
        ) : !rows || (loading && rows.length === 0) ? (
          <div className="flex items-center justify-center gap-2 py-14 text-sm text-ink-faint"><Loader2 size={18} className="animate-spin" /> Loading patients…</div>
        ) : rows.length === 0 ? (
          <EmptyState icon={<Users size={22} />} title="No patients found" hint="Try a different search, or register a new patient." />
        ) : (
          <Table
            head={<><th className="th">Patient</th><th className="th">Patient ID</th><th className="th">Age / Gender</th><th className="th">Mobile</th><th className="th">Blood</th><th className="th">Registered</th><th className="th"></th></>}
          >
            {rows.map((p) => (
              <tr key={p.id} className="cursor-pointer hover:bg-surface-muted" onClick={() => nav(`/patients/${p.id}`)}>
                <td className="td">
                  <div className="flex items-center gap-3">
                    <Avatar name={p.name} size={36} tone={p.gender === 'female' ? 'violet' : 'blue'} />
                    <div>
                      <p className="font-semibold text-ink">{p.name}</p>
                      {p.provisional && <Badge tone="amber">Provisional</Badge>}
                    </div>
                  </div>
                </td>
                <td className="td font-mono text-xs font-semibold text-brand-700">{p.code ?? p.id}</td>
                <td className="td">{ageFromDob(p.dob, p.ageYears)} · <span className="capitalize">{p.gender}</span></td>
                <td className="td"><span className="flex items-center gap-1.5 text-ink-soft"><Phone size={13} /> {p.mobile}</span></td>
                <td className="td"><Badge tone="red">{p.bloodGroup}</Badge></td>
                <td className="td text-ink-soft">{fmtDate(p.registeredAt)}</td>
                <td className="td text-right"><ChevronRight size={16} className="text-ink-faint" /></td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  )
}
