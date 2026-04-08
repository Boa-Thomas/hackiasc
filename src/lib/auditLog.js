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

// Actions that originate from unauthenticated (anon) users — must go through
// the log-event edge function since anon INSERT on audit_log is not allowed.
const PUBLIC_ACTIONS = ['registration.', 'waitlist.']

export async function audit(entry) {
  if (!supabase) return
  try {
    const isPublic = PUBLIC_ACTIONS.some(prefix => entry.action.startsWith(prefix))
    if (isPublic) {
      await supabase.functions.invoke('log-event', {
        body: {
          action: entry.action,
          actor_email: entry.actorEmail,
          target_table: entry.targetTable,
          target_id: entry.targetId,
          target_email: entry.targetEmail,
          new_data: entry.newData,
          metadata: entry.metadata,
        },
      })
    } else {
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
    }
  } catch {
    // Audit logging should never break the main flow
  }
}
