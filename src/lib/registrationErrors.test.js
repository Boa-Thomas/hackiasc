import { describe, it, expect } from 'vitest'
import { parseRegistrationInsertError } from './registrationErrors'

// ── Fixtures que simulam o shape exato do erro do Supabase JS ────────────────
// Confirmado lendo:
//   https://supabase.com/docs/reference/javascript/select#error-handling
//   PostgrestError carrega { code, message, details, hint } cru do Postgres.

function pgUniqueError({ constraint, key, value }) {
  return {
    code: '23505',
    message: `duplicate key value violates unique constraint "${constraint}"`,
    details: `Key (${key})=(${value}) already exists.`,
    hint: null,
  }
}

describe('parseRegistrationInsertError', () => {
  // ── Cenário do Victor: email de MEMBRO já cadastrado ─────────────────────
  it('identifica conflito por email no índice de um membro específico', () => {
    const error = pgUniqueError({
      constraint: 'uq_registrations_email_active',
      key: 'lower(email)',
      value: 'giuliano.bogo@gmail.com',
    })
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'victorfurquim01@gmail.com',
      members: [
        { email: 'giuliano.bogo@gmail.com', cpf: '11111111111' },
        { email: 'andref@outlook.com', cpf: '22222222222' },
        { email: 'outro@email.com', cpf: '33333333333' },
      ],
    })

    expect(result.kind).toBe('email')
    expect(result.belongsTo).toBe('member')
    expect(result.memberIndex).toBe(0)
    expect(result.value).toBe('giuliano.bogo@gmail.com')
    expect(result.recoverable).toBe(false)
    expect(result.userMessage).toContain('giuliano.bogo@gmail.com')
    expect(result.userMessage).toContain('membro 1')
  })

  it('aponta o membro correto quando o conflito é no 3º membro', () => {
    const error = pgUniqueError({
      constraint: 'uq_registrations_email_active',
      key: 'lower(email)',
      value: 'outro@email.com',
    })
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'victorfurquim01@gmail.com',
      members: [
        { email: 'giuliano.bogo@gmail.com' },
        { email: 'andref@outlook.com' },
        { email: 'outro@email.com' },
      ],
    })

    expect(result.belongsTo).toBe('member')
    expect(result.memberIndex).toBe(2)
    expect(result.userMessage).toContain('membro 3')
  })

  // ── Conflito no LÍDER (deve manter compatibilidade com recovery por email)
  it('identifica conflito quando o email é do líder', () => {
    const error = pgUniqueError({
      constraint: 'uq_registrations_email_active',
      key: 'lower(email)',
      value: 'victorfurquim01@gmail.com',
    })
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'victorfurquim01@gmail.com',
      members: [{ email: 'outro@email.com' }],
    })

    expect(result.belongsTo).toBe('leader')
    expect(result.recoverable).toBe(true) // recoverRegistration faz sentido aqui
  })

  // ── Suporte ao constraint LEGADO `registrations_email_key` (UNIQUE(email))
  it('extrai email mesmo quando o details usa "Key (email)=(...)" sem lower()', () => {
    const error = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "registrations_email_key"',
      details: 'Key (email)=(VictorFurquim01@gmail.com) already exists.',
    }
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'victorfurquim01@gmail.com',
      members: [],
    })

    // Normaliza casing antes de comparar com o líder
    expect(result.belongsTo).toBe('leader')
    expect(result.value).toBe('victorfurquim01@gmail.com')
  })

  // ── Conflito por CPF (do PR #26: uq_reg_cpf_active)
  it('identifica conflito por CPF de um membro', () => {
    const error = pgUniqueError({
      constraint: 'uq_reg_cpf_active',
      key: "regexp_replace(cpf, '\\D'::text, ''::text, 'g'::text)",
      value: '13403679985',
    })
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'lider@x.com',
      leaderCpf: '99999999999',
      members: [
        { email: 'a@x.com', cpf: '111.111.111-11' },
        { email: 'b@x.com', cpf: '134.036.799-85' },
      ],
    })

    expect(result.kind).toBe('cpf')
    expect(result.belongsTo).toBe('member')
    expect(result.memberIndex).toBe(1)
    expect(result.userMessage).toContain('membro 2')
  })

  it('identifica conflito por CPF do líder mesmo com pontuação na entrada', () => {
    const error = pgUniqueError({
      constraint: 'uq_reg_cpf_active',
      key: "regexp_replace(cpf, '\\D'::text, ''::text, 'g'::text)",
      value: '13403679985',
    })
    const result = parseRegistrationInsertError(error, {
      leaderCpf: '134.036.799-85',
      members: [],
    })

    expect(result.belongsTo).toBe('leader')
    expect(result.kind).toBe('cpf')
  })

  // ── Erros que não são 23505 não devem ser parseados
  it('devolve unknown quando o erro não é 23505', () => {
    const error = { code: '42501', message: 'permission denied' }
    const result = parseRegistrationInsertError(error, {})
    expect(result.kind).toBe('unknown')
    expect(result.userMessage).toMatch(/erro/i)
  })

  it('devolve unknown quando error é null/undefined', () => {
    expect(parseRegistrationInsertError(null).kind).toBe('unknown')
    expect(parseRegistrationInsertError(undefined).kind).toBe('unknown')
  })

  // ── Edge cases que o details não vem (defensivo)
  it('cai em unknown quando 23505 sem details parseável', () => {
    const error = { code: '23505', message: 'duplicate key', details: '' }
    const result = parseRegistrationInsertError(error, {})
    expect(result.kind).toBe('unknown')
    expect(result.recoverable).toBe(true) // mantém o caminho de recovery existente
  })

  it('quando conflito por email mas valor não bate com líder nem membros, devolve unknown owner', () => {
    const error = pgUniqueError({
      constraint: 'uq_registrations_email_active',
      key: 'lower(email)',
      value: 'desconhecido@email.com',
    })
    const result = parseRegistrationInsertError(error, {
      leaderEmail: 'lider@x.com',
      members: [{ email: 'outro@x.com' }],
    })
    expect(result.kind).toBe('email')
    expect(result.belongsTo).toBe('unknown')
    expect(result.userMessage).toContain('desconhecido@email.com')
  })
})
