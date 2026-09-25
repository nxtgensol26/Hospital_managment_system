import type { AuditEntry, Database, Role } from '../types'
import { useDB } from '../store/db'
import { useAuth } from '../store/auth'

export interface AuditActor {
  id: string
  name: string
  role: Role
}

/** Append an audit entry inside an existing DB mutation (no extra write). */
export function pushAudit(
  db: Database,
  actor: AuditActor,
  action: string,
  entity: string,
  entityId?: string,
  detail?: string,
) {
  const entry: AuditEntry = {
    id: `aud_${Math.random().toString(36).slice(2, 10)}`,
    at: new Date().toISOString(),
    actorId: actor.id,
    actorName: actor.name,
    actorRole: actor.role,
    action,
    entity,
    entityId,
    detail,
  }
  db.auditLog.unshift(entry)
  if (db.auditLog.length > 2000) db.auditLog.length = 2000
}

/** Standalone audit write using the currently logged-in user as actor. */
export function audit(action: string, entity: string, entityId?: string, detail?: string) {
  const u = useAuth.getState().user
  const actor: AuditActor = u
    ? { id: u.id, name: u.name, role: u.role }
    : { id: 'system', name: 'System', role: 'super_admin' }
  useDB.getState().update((db) => pushAudit(db, actor, action, entity, entityId, detail))
}
