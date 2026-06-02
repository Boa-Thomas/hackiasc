// src/admin/accountScope.js
// Builds the hybrid scope object for a password account (SP1 stores it; SP3
// enforces it). Empty/unset => {} which always means "unrestricted".
// Row-scope keys (team_ids/idea_ids) are NOT collected here: SP1 only provisions
// admin/viewer/checkin/staff (capability/UI scope), never mentor/juror.
export function buildScope({ readOnly = false, allowedTabs = [] } = {}) {
  const scope = {}
  if (readOnly) scope.read_only = true
  const tabs = (Array.isArray(allowedTabs) ? allowedTabs : [])
    .map((t) => String(t).trim())
    .filter(Boolean)
  if (tabs.length) scope.allowed_tabs = [...new Set(tabs)]
  return scope
}
