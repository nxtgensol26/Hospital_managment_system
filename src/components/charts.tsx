/** Dependency-free SVG/CSS charts for a clean, non-generic look. */

export function MiniBars({ data, color = '#1866e0', unit = '' }: { data: { day: string; value: number }[]; color?: string; unit?: string }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="flex items-end gap-2" style={{ height: 120 }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
          <div className="text-[10px] font-semibold text-ink-soft">{d.value ? (unit ? `${unit}${d.value}` : d.value) : ''}</div>
          <div className="flex w-full flex-1 items-end">
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value ? 4 : 0, background: color, opacity: 0.25 + 0.75 * (d.value / max) }}
            />
          </div>
          <div className="text-[10px] text-ink-faint">{d.day}</div>
        </div>
      ))}
    </div>
  )
}

export function Donut({ segments, size = 150 }: { segments: { label: string; value: number; color: string }[]; size?: number }) {
  const total = Math.max(1, segments.reduce((s, x) => s + x.value, 0))
  const r = size / 2 - 12
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          {segments.map((s, i) => {
            const len = (s.value / total) * c
            const el = (
              <circle
                key={i}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth={14}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                strokeLinecap="butt"
              />
            )
            offset += len
            return el
          })}
        </g>
        <text x="50%" y="48%" textAnchor="middle" className="fill-ink" fontSize={size * 0.2} fontWeight="800">{total}</text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-ink-faint" fontSize={size * 0.08} fontWeight="600">TOTAL</text>
      </svg>
      <div className="space-y-1.5">
        {segments.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-sm">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
            <span className="text-ink-soft">{s.label}</span>
            <span className="font-bold text-ink">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
