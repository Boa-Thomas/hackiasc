import { supabase } from './supabase'

/**
 * Log an action to the audit_log table.
 *
 * @param {Object} entry
 * @param {string} entry.action       - e.g. 'registration.create', 'payment.confirm'
 * @param {'public'|'admin'|'system'} entry.actorType
 * @param {string} [entry.actorEmail] - who performed the action
 * @param {string} [entry.targetTable]
 * @param {string} [entry.targetId]
 * @param {string} [entry.targetEmail]
 * @param {Object} [entry.oldData]
 * @param {Object} [entry.newData]
 * @param {Object} [entry.metadata]
 */
export async function audit(entry) {
  if (!supabase) return

  try {
    await supabase.from('audit_log').insert({
      action: entry.action,
      actor_type: entry.actorType,
      actor_email: entry.actorEmail ?? null,
      target_table: entry.targetTable ?? null,
      target_id: entry.targetId ?? null,
      target_email: entry.targetEmail ?? null,
      old_data: entry.oldData ?? null,
      new_data: entry.newData ?? null,
      metadata: entry.metadata ?? null,
    })
  } catch {
    // Audit logging should never break the main flow
  }
}
