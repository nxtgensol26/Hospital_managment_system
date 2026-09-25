import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Public Supabase client — anon/publishable key only. Never the service-role key.
 * All privileged operations go through edge functions or SECURITY DEFINER RPCs,
 * with authorization derived from the authenticated session (RLS), not the client.
 */
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const DATA_MODE = ((import.meta.env.VITE_DATA_MODE as string) || 'local').toLowerCase() as
  | 'local'
  | 'supabase'

export const isSupabase = DATA_MODE === 'supabase' && !!url && !!anon

let _client: SupabaseClient | null = null
export function supabase(): SupabaseClient {
  if (!_client) {
    if (!url || !anon) throw new Error('Supabase env not configured (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)')
    _client = createClient(url, anon, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'nxthealth.supabase.auth' },
    })
  }
  return _client
}

export function fnUrl(name: string): string {
  return `${url}/functions/v1/${name}`
}

/** Invoke an edge function with the current session's JWT. */
export async function invokeFn<T = any>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase().functions.invoke(name, { body: body as Record<string, unknown> })
  if (error) {
    // Surface the function's JSON error message when present
    const msg = (data as any)?.error || error.message
    throw new Error(msg)
  }
  if ((data as any)?.error) throw new Error((data as any).error)
  return data as T
}
