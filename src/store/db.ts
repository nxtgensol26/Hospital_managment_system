import { create } from 'zustand'
import type { Database } from '../types'
import { buildSeed } from '../data/seed'

const STORAGE_KEY = 'nxthealth.db.v1'

function load(): Database {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as Database
  } catch {
    /* ignore corrupt storage */
  }
  const seed = buildSeed()
  persist(seed)
  return seed
}

function persist(db: Database) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch {
    /* storage may be full / unavailable */
  }
}

interface DBStore {
  db: Database
  /** Apply a mutation to a cloned DB and persist. Returns an optional value. */
  update: <T = void>(mutator: (db: Database) => T) => T
  reset: () => void
}

/**
 * Single source of truth for all persisted entities. This is the ONLY module
 * that touches localStorage — replace `load`/`persist` with API calls to move
 * to a real backend without changing any feature code.
 */
export const useDB = create<DBStore>((set, get) => ({
  db: load(),
  update: (mutator) => {
    const clone: Database = structuredClone(get().db)
    const result = mutator(clone)
    persist(clone)
    set({ db: clone })
    return result
  },
  reset: () => {
    const seed = buildSeed()
    persist(seed)
    set({ db: seed })
  },
}))

/** Allocate the next value of a named sequence counter (patient, appt, …). */
export function nextSeq(db: Database, key: string): number {
  db.counters[key] = (db.counters[key] || 0) + 1
  return db.counters[key]
}
