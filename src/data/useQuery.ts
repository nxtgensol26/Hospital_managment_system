import { useCallback, useEffect, useRef, useState } from 'react'

export interface QueryState<T> {
  data: T | undefined
  loading: boolean
  error?: string
  reload: () => void
}

/**
 * Minimal async data hook. Refetches when `deps` change or `reload()` is called.
 * Works for both LocalRepository and SupabaseRepository (all methods are async).
 */
export function useQuery<T>(fn: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [tick, setTick] = useState(0)
  const fnRef = useRef(fn)
  fnRef.current = fn
  const reload = useCallback(() => setTick((t) => t + 1), [])

  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef.current()
      .then((d) => { if (alive) { setData(d); setError(undefined) } })
      .catch((e) => { if (alive) setError(String(e?.message ?? e)) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  return { data, loading, error, reload }
}
