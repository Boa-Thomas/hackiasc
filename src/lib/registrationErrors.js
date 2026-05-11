// ─── Postgres unique-violation parser ─────────────────────────────────────────
// Quando o INSERT batch de uma equipe falha com 23505, o Supabase JS devolve um
// objeto { code: '23505', message, details, hint }. O `details` carrega:
//   Key (lower(email))=(victor@email.com) already exists.
//   Key (regexp_replace(cpf, '\D'::text, ''::text, 'g'::text))=(12345678900) already exists.
//   Key (email)=(victor@email.com) already exists.   <- constraint legado
//
// Esta função identifica QUAL valor da batch causou o conflito e mapeia para
// líder ou um membro específico, pra mensagem de erro apontar a linha exata
// em vez de cair em "Nenhuma inscrição pendente encontrada".

const EMAIL_DETAIL_RE = /Key \(.*?email.*?\)=\(([^)]+)\)/i
const CPF_DETAIL_RE = /Key \(.*?cpf.*?\)=\(([^)]+)\)/i

function normalizeEmail(value) {
  return (value || '').trim().toLowerCase()
}

function normalizeCpf(value) {
  return (value || '').replace(/\D/g, '')
}

/**
 * @param {{ code?: string, message?: string, details?: string }} error
 * @param {{ leaderEmail?: string, leaderCpf?: string, members?: Array<{ email?: string, cpf?: string }> }} context
 */
export function parseRegistrationInsertError(error, context = {}) {
  if (!error || error.code !== '23505') {
    return { kind: 'unknown', userMessage: 'Erro ao enviar inscrição. Tente novamente.' }
  }

  const details = error.details || ''
  const members = context.members || []

  const emailMatch = details.match(EMAIL_DETAIL_RE)
  if (emailMatch) {
    const conflictedEmail = normalizeEmail(emailMatch[1])
    const leaderEmail = normalizeEmail(context.leaderEmail)

    if (conflictedEmail && conflictedEmail === leaderEmail) {
      return {
        kind: 'email',
        belongsTo: 'leader',
        value: conflictedEmail,
        recoverable: true,
        userMessage: `O e-mail ${conflictedEmail} já está cadastrado em uma inscrição ativa.`,
      }
    }

    const memberIndex = members.findIndex(m => normalizeEmail(m.email) === conflictedEmail)
    if (memberIndex >= 0) {
      return {
        kind: 'email',
        belongsTo: 'member',
        memberIndex,
        value: conflictedEmail,
        recoverable: false,
        userMessage: `O e-mail ${conflictedEmail} (membro ${memberIndex + 1}) já está cadastrado em uma inscrição ativa. Remova ou troque esse membro antes de prosseguir.`,
      }
    }

    return {
      kind: 'email',
      belongsTo: 'unknown',
      value: conflictedEmail,
      recoverable: false,
      userMessage: `O e-mail ${conflictedEmail} já está cadastrado em uma inscrição ativa.`,
    }
  }

  const cpfMatch = details.match(CPF_DETAIL_RE)
  if (cpfMatch) {
    const conflictedCpf = normalizeCpf(cpfMatch[1])
    const leaderCpf = normalizeCpf(context.leaderCpf)

    if (conflictedCpf && conflictedCpf === leaderCpf) {
      return {
        kind: 'cpf',
        belongsTo: 'leader',
        value: conflictedCpf,
        recoverable: false,
        userMessage: 'O CPF do líder já está cadastrado em uma inscrição ativa.',
      }
    }

    const memberIndex = members.findIndex(m => normalizeCpf(m.cpf) === conflictedCpf)
    if (memberIndex >= 0) {
      return {
        kind: 'cpf',
        belongsTo: 'member',
        memberIndex,
        value: conflictedCpf,
        recoverable: false,
        userMessage: `O CPF do membro ${memberIndex + 1} já está cadastrado em uma inscrição ativa. Remova ou troque esse membro antes de prosseguir.`,
      }
    }

    return {
      kind: 'cpf',
      belongsTo: 'unknown',
      value: conflictedCpf,
      recoverable: false,
      userMessage: 'Um CPF da equipe já está cadastrado em uma inscrição ativa.',
    }
  }

  return {
    kind: 'unknown',
    recoverable: true,
    userMessage: 'Erro ao enviar inscrição. Tente novamente.',
  }
}
