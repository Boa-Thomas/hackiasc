# Backlog pós-evento — itens adiados (24/05/2026)

**Data:** 2026-05-24
**Contexto:** Levantados na auditoria multiagente de melhorias (organização +
experiência). Adiados por decisão de produto ou por risco de mexer durante o
evento ao vivo (29-31/05). Itens de UX/a11y de baixo risco já foram entregues
nas branches `fix/ux-a11y-improvements` e `fix/team-subcharging`.

## CRÍTICO de segurança

### 1. Deploy da versão segura do `mp-webhook`
A versão deployada (deploy v4) é insegura: aceita webhook **sem verificar
assinatura** quando `MP_WEBHOOK_SECRET` falta (confirmações de pagamento
forjáveis, pois `verify_jwt: false`), **sem amount gate** (não valida valor pago)
e sem filtro de cancelados. A versão segura está no master
(`supabase/functions/mp-webhook/index.ts`).

**Passos seguros para deploy:**
1. Confirmar/criar `MP_WEBHOOK_SECRET` (assinatura secreta do painel Mercado Pago
   → Edge Function secrets do Supabase). NÃO usar `MP_ACCESS_TOKEN`.
2. Deployar a versão do master (`deploy_edge_function` slug `mp-webhook`).
3. Monitorar `get_logs` edge-function imediatamente. Se 401 em massa → reverter
   (redeploy da versão antiga).

### 2. `PaymentReturn` forjável (#108)
`src/components/PaymentReturn.jsx` confirma pagamento com base em parâmetros da
URL de retorno do MP, sem verificar no backend. Permite forjar confirmação.
Fix: RPC que valida `mp_payments` antes de confirmar. Não mexido agora por tocar
o fluxo de pagamento ao vivo.

## Funcionalidade (decisão de produto: adiado)

### 3. E-mail transacional da organização
Não existe nenhuma edge function de e-mail. O UI promete "e-mail de confirmação".
Implementar via Resend (API key + domínio verificado) disparado no
`mp-webhook`/`sync-mp-payments` ao confirmar. Inclui infos do evento.

### 4. UI de avaliação de jurados
Schema `team_evaluations` (`evaluator_type='human'`) existe, mas não há formulário
para o jurado lançar nota. Banca 31/05 usará planilha nesta edição. Fix: aba de
avaliação no `AdminDeliverables` com os 4 critérios do edital + score total.

## Infra (bloqueado / baixa prioridade)

### 5. Cron de sync MP (`setup_mp_sync_cron.sql`)
Bloqueado: `pg_cron` e `pg_net` desabilitados e Vault secret `mp_service_role_key`
inexistente. O webhook em tempo real já cobre o essencial. Para ativar (requer
Supabase Pro): habilitar extensões → `vault.create_secret('mp_service_role_key', ...)`
→ substituir `<SUPABASE_URL>` → agendar.

### 6. Trigger contra >6 membros em batch insert (#177)
Já existe trigger BEFORE ROW de limite de 6, mas um batch insert simultâneo pode
furar (cada row vê count < 6). Fix: constraint AFTER STATEMENT. Schema change —
fazer em janela de baixa atividade e testar a migration antes.

## Observação
Subcobrança de equipe (#33) foi **corrigida e deployada** (create-preference v7)
em 24/05. Ver [2026-05-24-fix-team-subcharging.md] (branch fix/team-subcharging).
