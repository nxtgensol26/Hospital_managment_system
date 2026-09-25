import { APP } from '../config'

/** NxtHealth logo mark — pulse line + medical cross in a rounded tile. */
export function LogoMark({ size = 40, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <defs>
        <linearGradient id="nx-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2f84f5" />
          <stop offset="1" stopColor="#16aaa4" />
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="16" fill="url(#nx-g)" />
      <path
        d="M12 34 h9 l4 -11 l7 20 l5 -13 l3 6 h11"
        fill="none"
        stroke="#fff"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M40 16 h5 v5 h5 v5 h-5 v5 h-5 v-5 h-5 v-5 h5 z" fill="#fff" fillOpacity="0.92" />
    </svg>
  )
}

export function Wordmark({
  size = 'md',
  showTagline = false,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg'
  showTagline?: boolean
  className?: string
}) {
  const markSize = size === 'lg' ? 44 : size === 'sm' ? 28 : 36
  const text = size === 'lg' ? 'text-2xl' : size === 'sm' ? 'text-base' : 'text-xl'
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={markSize} />
      <div className="leading-tight">
        <div className={`font-extrabold tracking-tight text-ink ${text}`}>
          Nxt<span className="text-brand-600">Health</span>
        </div>
        {showTagline && <div className="text-[11px] font-medium text-ink-faint">{APP.tagline}</div>}
      </div>
    </div>
  )
}
