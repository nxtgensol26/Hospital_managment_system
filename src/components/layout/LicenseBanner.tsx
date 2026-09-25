import { AlertTriangle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import { fmtDate } from '../../lib/format'
import { getRepository } from '../../data'
import { useQuery } from '../../data/useQuery'

/** Contextual license warning strip: shows at 7/3/1 days and on expiry. */
export function LicenseBanner() {
  const repo = getRepository()
  const { data } = useQuery(() => repo.licenseCurrent(), [])
  if (!data?.license) return null
  const lic = data.license
  const expiry = lic.expiry_date ?? lic.expiryDate ?? null
  const daysLeft = data.daysLeft ?? null

  if (data.status === 'expired') {
    return (
      <div className="flex items-center justify-center gap-2 bg-rose-600 px-4 py-2 text-sm font-semibold text-white">
        <AlertTriangle size={16} /> Your license expired{expiry ? ` on ${fmtDate(expiry)}` : ''}. Protected modules are locked.
        <Link to="/admin/license" className="underline">Renew now</Link>
      </div>
    )
  }
  if (data.status === 'trial' && daysLeft != null && daysLeft <= 7) {
    const tone = daysLeft <= 1 ? 'bg-rose-500' : daysLeft <= 3 ? 'bg-amber-500' : 'bg-amber-400'
    return (
      <div className={`flex items-center justify-center gap-2 ${tone} px-4 py-2 text-sm font-semibold text-white`}>
        <Clock size={16} /> Trial ends in {daysLeft} day{daysLeft === 1 ? '' : 's'}{expiry ? ` (${fmtDate(expiry)})` : ''}.
        <Link to="/admin/license" className="underline">Activate a license</Link>
      </div>
    )
  }
  return null
}
