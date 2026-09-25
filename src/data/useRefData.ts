import { useMemo } from 'react'
import { getRepository } from './index'
import { useQuery } from './useQuery'

/** Loads common reference lists (doctors, departments) and name resolvers.
 *  Works in both modes; replaces the old useDB-based selector helpers. */
export function useRefData() {
  const repo = getRepository()
  const { data: doctors } = useQuery(() => repo.listDoctors(), [])
  const { data: departments } = useQuery(() => repo.listDepartments(), [])
  const docMap = useMemo(() => new Map((doctors ?? []).map((d) => [d.id, d.name])), [doctors])
  const deptMap = useMemo(() => new Map((departments ?? []).map((d) => [d.id, d.name])), [departments])
  return {
    doctors: doctors ?? [],
    departments: departments ?? [],
    doctorName: (id?: string) => docMap.get(id ?? '') ?? '—',
    deptName: (id?: string) => deptMap.get(id ?? '') ?? '—',
  }
}
