# Spec: Acesso `staff` (Muro + Check-in) via link de auto-login

**Data:** 2026-05-29
**Tópico:** Dar a outra pessoa acesso ao painel admin limitado a Muro de Dores +
Check-in, entregue por um link de auto-login com token (estilo mentor/jurado).

## Contexto

- O **admin** usa **Supabase Auth real** (`signInWithPassword`); o poder vem do
  `app_metadata.role` no JWT (`admin`/`viewer`/`checkin`). Todas as policies/RPCs
  do admin checam `is_admin()` / `is_admin_or_viewer()` / `is_checkin_staff()` via
  `auth.jwt() -> app_metadata -> role`.
- **Mentores/jurados** usam um token UUID validado por RPCs `SECURITY DEFINER` que
  recebem `p_token` — **não** têm sessão Supabase nem poder de admin.

Logo, um token estilo jurado **não** dá acesso ao painel admin (tudo lá depende do
JWT). Para um link com token dar acesso, ele precisa virar uma **sessão Supabase
real** com o role apropriado.

Padrão de role existente (`migrations/create_checkin_role.sql`): helpers
`is_checkin_staff()` etc. + policies/RPCs que gate nesses helpers. Reusamos esse
padrão.

## Objetivo

Uma pessoa da organização consegue, por um link de 1 clique, entrar no painel e
operar **apenas** o Muro de Dores e o Check-in, sem receber a senha de admin.

## Decisões (confirmadas com o usuário)

- **Escopo:** role novo `staff` = Muro de Dores + Check-in (nem viewer, nem admin,
  nem checkin servem).
- **Entrega:** link de auto-login `#admin-acesso?t=<token>`, onde `t` é a senha de
  uma conta Supabase dedicada (email é constante no front). Reusa a auth/RLS atuais.
- **Revogação:** trocar a senha da conta `staff` invalida o link antigo.
- **Aceito:** o link É a credencial (repassável); mitigado pelo role limitado +
  timeout de inatividade de 30 min já existente.

## Backend — nova migration `migrations/add_staff_role.sql`

Aditiva e idempotente. Aplicada via MCP (não auto-aplica).

### Helper

- `is_wall_staff()` → `role IN ('admin','staff')` (`SECURITY DEFINER`, STABLE,
  `search_path = public`; REVOKE de PUBLIC/anon, GRANT a authenticated).

### Ajustes em helpers/policies existentes

- `is_checkin_staff()` → passa a `role IN ('admin','checkin','staff')` (re-CREATE).
- Policy "Checkin can read confirmed registrations" → trocar a condição de role de
  `= 'checkin'` para `IN ('checkin','staff')` (mantém `payment_status='confirmed'`).
  Isso habilita, para `staff`: a busca de inscrito do check-in **e** a busca do
  "adicionar dor por participante" (ambas filtram confirmados). Staff NÃO ganha a
  policy admin/viewer (sem acesso a não-confirmados, pagamentos, etc.).

### RPCs do muro — re-CREATE trocando o gate

Reproduzir o corpo atual (de `add_wall_voters.sql` / `add_wall_identity.sql`)
trocando **apenas** a checagem de autorização:

- `wall_set_phase`, `wall_hide_pain`, `wall_unhide_pain`, `wall_admin_add_pain`:
  `IF NOT is_admin()` → `IF NOT is_wall_staff()`.
- `wall_admin_list`: `IF NOT is_admin_or_viewer()` → `IF NOT (is_admin_or_viewer()
OR is_wall_staff())`.
- `set_checkin` já gate em `is_checkin_staff()` (passa a aceitar staff
  automaticamente após o ajuste do helper). Sem mudança no corpo.

## Conta Supabase dedicada

Criar via MCP um usuário `staff` (ex.: `equipe-muro@hackiasc.com`), auto-confirmado,
com `raw_app_meta_data = '{"role":"staff"}'` e uma senha forte aleatória (= o token
do link). A senha é entregue ao orquestrador para montar o link; não vai pro repo.

## Frontend

### `src/lib/config.js`

- `STAFF_ACCESS_EMAIL` = email da conta staff (constante, não secreto).

### Rota de auto-login `#admin-acesso` (novo `src/admin/StaffAccess.jsx`)

- Lê `t` do hash (`#admin-acesso?t=<token>`), igual ao `seedTokenFromUrl` do jurado.
- `supabase.auth.signInWithPassword({ email: STAFF_ACCESS_EMAIL, password: t })`.
- Sucesso: `history.replaceState(null,'','#admin')` (remove o token da URL) e segue
  para o painel.
- Falha: mensagem ("link inválido ou expirado") + link para `#admin-login`.
- Estados de loading/erro próprios (componente fullscreen, padrão dos outros logins).

### `src/admin/useAdminAuth.js`

- `onAuthStateChange` passa a tratar `SIGNED_IN` também (hoje só `SIGNED_OUT`):
  ao receber SIGNED_IN, revalida o role do `session.user.app_metadata.role` e
  seta `role`/`isAuthenticated` + inicia o tracking de inatividade. Assim o
  auto-login assume a sessão sem reload. `'staff'` entra em `VALID_ROLES`.

### `src/App.jsx`

- Rota `#admin-acesso` → renderiza `<StaffAccess />`.

### `src/admin/AdminPanel.jsx`

- `role === 'staff'`: `TABS` filtra para `['wall','checkin']`; aba default `'wall'`.
- Badge "equipe" no header (como os badges de viewer/checkin).
- Os conteúdos de `wall`/`checkin` já renderizam sob `!readOnly` (staff não é
  viewer), então aparecem; as demais abas não têm botão para staff. RLS/RPCs são a
  garantia real (staff não consegue ler/escrever fora do escopo mesmo via hash).

## Fluxo

Link `#admin-acesso?t=SENHA` → `StaffAccess` faz signIn → limpa URL → `#admin` →
`useAdminAuth` (SIGNED_IN) assume sessão role=staff → `AdminPanel` mostra Muro +
Check-in.

## Segurança / tradeoffs

- Link = credencial (repassável). Aceito; mitigado por role limitado + timeout 30min.
- Senha (token) aparece na URL → removida imediatamente via `replaceState`; a
  sessão fica no storage do Supabase, não a senha.
- Staff vê PII inerente: confirmados (nome/CPF/nascimento) no check-in e contato dos
  votantes no muro. Esperado.
- Revogação: trocar a senha da conta staff (MCP) mata o link antigo.
- Defesa em profundidade: mesmo forçando outra aba via hash, RLS/RPCs barram staff
  fora de Muro/Check-in.
- Auditoria: ações saem com o email da conta staff (identidade compartilhada).

## Casos de borda

- `t` ausente/!= senha: signIn falha → tela de erro com link p/ login normal.
- Conta staff com role removido/trocado: `VALID_ROLES` rejeita → signOut + erro.
- Link aberto já logado como admin: o signIn troca a sessão para staff (rebaixa) —
  aceitável; admin reentra pelo login normal. (Documentar; não bloquear.)
- Token na URL não deve vazar: `replaceState` imediato após o signIn.

## Verificação

- `npm run build` + `eslint` nos arquivos tocados.
- Migration aplicada via MCP; conferir helpers (`is_wall_staff`) e que os RPCs do
  muro aceitam staff (testável criando a conta e abrindo o link).
- Manual: abrir o link → cai no painel com só Muro + Check-in; testar mudar fase do
  muro e um check-in; confirmar que abas de admin não aparecem.

## Fora de escopo

- Abordagem com Edge Function / token opaco em tabela (escolhido o link com
  credencial).
- Identidade por pessoa (cada operador com conta própria) — é uma conta staff
  compartilhada.
- Fix do "hard reload / nova versão" — tarefa separada, logo após.

## Arquivos afetados

- novo: `migrations/add_staff_role.sql`
- novo: `src/admin/StaffAccess.jsx`
- `src/admin/useAdminAuth.js`
- `src/admin/AdminPanel.jsx`
- `src/App.jsx`
- `src/lib/config.js`
- conta Supabase `staff` (via MCP, fora do repo)
- novo: `docs/changelog/2026-05-29-staff-role-token-access.md`
