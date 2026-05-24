# feat: identity confirmation on check-in + least-privilege checkin role

**Data:** 2026-05-24
**Branch:** feat/checkin-identity-role
**Arquivos alterados:** src/admin/AdminCheckin.jsx, src/admin/AdminPanel.jsx, src/admin/useAdminAuth.js, migrations/create_checkin_role.sql

## O que foi feito
1. **Confirmação de identidade no check-in.** O botão "Check-in" abre um modal que exibe
   nome, CPF e data de nascimento do cadastro. O operador compara com o documento do
   participante e marca "Conferi com o documento"; só então o check-in é confirmado.
2. **Papel `checkin` (least-privilege).** Operadores de portaria recebem um papel que
   enxerga APENAS a aba de Check-in e não pode tocar em pagamentos, times ou qualquer
   outra coisa.
3. **Auditoria atribuível.** Cada check-in/undo é gravado no `audit_log` com o email do
   operador extraído do JWT (server-authoritative) e `identity_verified: true`.

## Por que
Já entrou gente não identificada em edições anteriores. A conferência de CPF + nascimento
cria uma barreira na portaria, e o papel restrito permite ter 2-3 operadores sem dar acesso
total ao painel. A atribuição na auditoria responde "quem liberou esta pessoa".

## Decisões técnicas
- **Escrita via RPC `set_checkin(id, present)` SECURITY DEFINER**: única forma de marcar
  presença. Só altera `checked_in_at`, valida o papel e grava a auditoria. Assim o papel
  `checkin` NÃO precisa de UPDATE direto em `registrations` nem INSERT em `audit_log`.
- **Actor do JWT** (`auth.jwt() ->> 'email'`) em vez de passar do cliente — não é falsificável.
- **Política SELECT para `checkin`** limitada a `payment_status = 'confirmed'`. Necessária
  porque o realtime respeita RLS — sem ela a sincronização ao vivo entre operadores quebra.
  Trade-off consciente: expõe todas as colunas das linhas confirmadas (não só CPF/nascimento);
  uma RPC dedicada esconderia colunas mas perderia o realtime.
- **Tudo aditivo no banco**: nenhuma política de admin/viewer/anon foi alterada, então
  aplicar a migration não muda o comportamento atual (migration é retrocompatível).
- `formatBirthDate` lê a string `YYYY-MM-DD` direto, evitando o off-by-one de fuso (BRT = UTC-3).

## Impacto
- Migration `create_checkin_role.sql` **já aplicada** no projeto qshrzfahotmjshtjuvno.
- Concorrência: dois operadores na mesma pessoa → last-write-wins no timestamp + duas linhas
  de auditoria. Inofensivo, não corrompe.
- **Breaking-ish na ordem de rollout**: criar usuários `checkin` ANTES do deploy do frontend
  os deixa travados (o `useAdminAuth` em produção ainda rejeita papéis fora de admin/viewer).

## Próximos passos
1. Deploy do frontend (push → GitHub Pages).
2. VERIFICAR pós-deploy: fazer um check-in real e conferir que `audit_log.actor_email` traz
   o email do operador (valida o claim do JWT). Se vier null, passar o email do cliente como fallback.
3. Criar contas `checkin` (Dashboard > Add User, depois `raw_app_meta_data = '{"role":"checkin"}'`).
