// Sanitiza a descrição da ideia de um time no client, espelhando a validação da
// RPC participant_update_team: trim, vazio → null, máximo 500 caracteres.

export const IDEA_MAX_LENGTH = 500

export function cleanIdeaDescription(raw) {
  const trimmed = (raw ?? '').trim()
  if (trimmed.length > IDEA_MAX_LENGTH) {
    return { value: null, error: 'idea_too_long' }
  }
  return { value: trimmed === '' ? null : trimmed, error: null }
}
