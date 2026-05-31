// Lógica pura do mural de elogios (sugar cubes). Espelha as validações do
// servidor (sugar_insert) para dar feedback imediato no cliente; o servidor
// continua sendo a fonte de verdade.

export const MESSAGE_MAX = 280
export const ORG_LABEL = 'Organização HackIA'

// Valida/normaliza a mensagem: trim, vazio → erro, corte em MESSAGE_MAX.
export function validateMessage(raw) {
  const value = (raw ?? '').trim()
  if (value === '') return { ok: false, error: 'message_required' }
  return { ok: true, value: value.slice(0, MESSAGE_MAX) }
}

// Auto-elogio: mesmo tipo E mesma ref (organização tem ref null dos dois lados).
export function isSelfCompliment(senderType, senderRef, recipientType, recipientRef) {
  return senderType === recipientType && (senderRef ?? null) === (recipientRef ?? null)
}

// Achata o roster ({participants, mentors, organization}) numa lista plana de
// opções selecionáveis. Organização primeiro (sempre incluída).
export function buildRecipientOptions(roster) {
  const opts = [{ type: 'organization', ref: null, name: ORG_LABEL }]
  for (const p of roster?.participants ?? []) {
    opts.push({ type: 'participant', ref: p.ref, name: p.name })
  }
  for (const m of roster?.mentors ?? []) {
    opts.push({ type: 'mentor', ref: m.ref, name: m.name })
  }
  return opts
}

const ERROR_MESSAGES = [
  ['message_required', 'Escreva uma mensagem.'],
  ['self_compliment', 'Você não pode enviar um elogio para si mesmo.'],
  ['rate_limited', 'Aguarde um instante antes de enviar outro elogio.'],
  ['recipient_not_found', 'Destinatário inválido.'],
  ['invalid_recipient', 'Destinatário inválido.'],
  ['unauthorized', 'Sessão inválida. Entre novamente.'],
  ['forbidden', 'Sessão inválida. Entre novamente.'],
  ['payment_not_confirmed', 'Sessão inválida. Entre novamente.'],
  ['invalid_or_expired_session', 'Sessão inválida. Entre novamente.'],
]

// Traduz a mensagem de erro do Supabase (que contém o texto do RAISE) para
// pt-BR. Faz match por substring; fallback genérico.
export function errorText(raw) {
  const msg = String(raw ?? '')
  for (const [code, text] of ERROR_MESSAGES) {
    if (msg.includes(code)) return text
  }
  return 'Não foi possível enviar agora. Tente de novo.'
}
