import { useEffect, useState } from 'react'
import { LogoMark } from '../../components/Logo'
import { APP } from '../../config'

/**
 * Premium, restrained startup sequence:
 *   1. "Powered by NxtGenSol"
 *   2. NxtHealth logo mark draws in
 *   3. "NxtHealth" wordmark + tagline
 *   4. smooth fade to the License / Login screen
 */
export function StartupAnimation({ onDone }: { onDone: () => void }) {
  const [phase, setPhase] = useState(0) // 0 powered, 1 logo, 2 wordmark, 3 leaving
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const timers = [
      setTimeout(() => setPhase(1), 900),
      setTimeout(() => setPhase(2), 1650),
      setTimeout(() => setLeaving(true), 2900),
      setTimeout(() => onDone(), 3400),
    ]
    return () => timers.forEach(clearTimeout)
  }, [onDone])

  return (
    <div
      className={`fixed inset-0 z-[100] grid place-items-center bg-white transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}
    >
      {/* soft ambient background */}
      <div className="pointer-events-none absolute inset-0 grid-bg opacity-60" />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br from-brand-100/50 to-teal-100/40 blur-3xl" />

      <div className="relative flex flex-col items-center">
        {/* Powered by */}
        <div
          className="mb-8 text-center transition-all duration-700"
          style={{ opacity: phase >= 0 ? 1 : 0, transform: phase >= 1 ? 'translateY(-4px)' : 'translateY(0)' }}
        >
          <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-ink-faint animate-fade-in">
            {APP.poweredBy}
          </p>
        </div>

        {/* Logo */}
        <div
          className="transition-all duration-700"
          style={{
            opacity: phase >= 1 ? 1 : 0,
            transform: phase >= 1 ? 'scale(1)' : 'scale(0.8)',
          }}
        >
          <div className="relative">
            <div className="absolute inset-0 -z-10 animate-ping rounded-[22px] bg-brand-400/20" style={{ animationDuration: '2.4s' }} />
            <LogoMark size={96} className="drop-shadow-[0_18px_40px_rgba(24,102,224,0.28)]" />
          </div>
        </div>

        {/* Wordmark */}
        <div
          className="mt-6 flex flex-col items-center transition-all duration-700"
          style={{
            opacity: phase >= 2 ? 1 : 0,
            transform: phase >= 2 ? 'translateY(0)' : 'translateY(10px)',
          }}
        >
          <h1 className="text-4xl font-extrabold tracking-tight text-ink">
            Nxt<span className="text-brand-600">Health</span>
          </h1>
          <p className="mt-2 text-sm font-medium text-ink-soft">{APP.tagline}</p>
        </div>

        {/* progress line */}
        <div className="mt-10 h-0.5 w-44 overflow-hidden rounded-full bg-surface-line">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-500 to-teal-500 transition-all duration-[2600ms] ease-out"
            style={{ width: phase >= 2 ? '100%' : phase >= 1 ? '55%' : '18%' }}
          />
        </div>
      </div>

      <div className="absolute bottom-8 text-center">
        <p className="text-[11px] text-ink-faint">
          {APP.company} · {APP.support.phone} · {APP.support.email}
        </p>
      </div>
    </div>
  )
}
