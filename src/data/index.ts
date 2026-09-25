import { isSupabase } from '../lib/supabase'
import type { Repository } from './repository'
import { LocalRepository } from './local-repository'
import { SupabaseRepository } from './supabase-repository'

let _repo: Repository | null = null

/** The active data backend. Swap by changing VITE_DATA_MODE — UI is unchanged. */
export function getRepository(): Repository {
  if (!_repo) _repo = isSupabase ? new SupabaseRepository() : new LocalRepository()
  return _repo
}

export type { Repository } from './repository'
