# feat: painel de entregáveis da equipe + sistema de mentores

**Data:** 2026-05-22
**Branch:** claude/admiring-pike-d33b46
**Commits:** 3707891, 2935f2a, c8d1ec3, 085583c, bbb1403, d4107fb (+ fix LearningDiary readOnly)
**Arquivos alterados:**
- DB: `supabase-setup.sql`, `migrations/add_team_and_mentors.sql` (novo)
- Participante: `src/participant/{DeliverablesSection,DeliverableForm,LearningDiary,deliverableFields}.jsx/js` (novos), `useParticipantAuth.js`, `ParticipantPanel.jsx`; removido `ComingSoon.jsx`
- Mentor: `src/mentor/{useMentorAuth,MentorLogin,MentorPanel,MentorNotes}.jsx/js` (novos)
- Admin: `src/admin/{AdminMentors.jsx (novo),AdminPanel.jsx,AdminTeams.jsx}`
- App: `src/App.jsx`; helper `src/lib/relativeTime.js` (novo)
- Docs: spec + plano em `docs/superpowers/`

## O que foi feito

Três blocos que se conectam pela nova tabela `teams`:

1. **Entregáveis da equipe** (painel do participante): a aba placeholder "Em Breve" virou "Entregáveis" com 4 sub-abas ancoradas nas fases da metodologia oficial — Canvas de Hipóteses (Ignição), Canvas SLC-IA + Diário de Aprendizado/BML (Construção), Entregas finais com links públicos (Apresentação). Conteúdo é compartilhado pela equipe; qualquer membro confirmado edita (last-write-wins, com guarda de conflito por `updated_at`).

2. **Sistema de mentores**: rota `/#mentor` com login próprio (email + código de 4 dígitos), painel que mostra a equipe pareada, os entregáveis em modo leitura e um espaço de **ponderações por fase** — privadas (só a organização vê) ou públicas (aparecem na aba Entregáveis da equipe).

3. **Aba Mentores no admin**: cadastro por email que gera um código de 4 dígitos (exibido uma vez), pareamento mentor↔equipe, reset de código e remoção.

## Por que

O painel do participante já existia mas não tinha os entregáveis da metodologia. A organização precisava de um lugar único onde a equipe registra seus canvases e onde os mentores acompanham/comentam o progresso — sem planilhas paralelas. O código de 4 dígitos foi pedido explicitamente para simplificar o onboarding dos mentores (sem criação de conta/senha longa).

## Decisões técnicas

- **`teams.id` estável + `team_name` canônico**: `registrations.team_name` continua a fonte de pertença (intocado nos 9 pontos de escrita do admin); `teams.id` é o UUID estável que carrega os entregáveis. `registrations.team_id` é espelho mantido por trigger `sync_registration_team_id` (BEFORE INSERT/UPDATE). Renomear equipe altera só `teams.name` via `cascade_team_rename` (AFTER UPDATE — BEFORE causaria órfão). Entrega "ID estável" com 1 ponto de refactor (rename) em vez de 9.
- **Auth de mentor por token custom, NÃO Supabase Auth**: mesmo padrão do participante (RPC SECURITY DEFINER + RLS deny-all + lockout 10 tentativas → 1h). Incompatível com Supabase Auth porque o código de 4 dígitos é gerado no admin, não criado pelo usuário. Código hasheado com `crypt(code, gen_salt('bf'))`.
- **JSONB para os canvases**: campos definidos pela UI, sem DDL a cada ajuste. Limite de 65536 bytes por entregável na RPC.
- **3 entregáveis em RPC única whitelisted** (`participant_save_team_deliverable`) com whitelist de campo, em vez de 1 RPC por canvas — menos superfície, validação centralizada.
- **Migração separada** (`migrations/add_team_and_mentors.sql`): idempotente, para aplicar no banco de produção já populado sem rodar o `supabase-setup.sql` inteiro.

## Impacto

- **Schema novo**: tabelas `teams`, `mentors`, `mentor_sessions`, `mentor_notes` + coluna `registrations.team_id`. RLS: admin lê/gere; participante e mentor só via RPC.
- **Sem breaking change** no fluxo de inscrição/admin existente — adições são aditivas e o backfill popula `teams` a partir dos `team_name` distintos.
- **Ação de deploy obrigatória**: aplicar `migrations/add_team_and_mentors.sql` no Supabase SQL Editor antes de qualquer teste — nada funciona sem isso.
- `pgcrypto` necessário (já usado pelo login de participante).

## Correções pós-revisão (security-auditor + code-reviewer)

Dois agentes de verificação convergiram em achados; corrigidos antes do PR:

- **[fix] Vazamento de notas privadas entre co-mentores** (`mentor_get_me`, ambos os arquivos SQL): a query de notas filtrava só por `team_id`. Como `mentors.team_id` não tem UNIQUE e o reassign do admin permite dois mentores na mesma equipe, o mentor A via as ponderações **privadas** do mentor B. Adicionado `AND n.mentor_id = v_mentor_id` — "Minhas ponderações" agora retorna só as do próprio mentor (as públicas continuam chegando à equipe pelo caminho separado `participant_get_me.public_notes`).
- **[fix] Código de 4 dígitos com PRNG não-cripto** (`admin_create_mentor`/`admin_reset_mentor_code`): trocado `floor(random()*10000)` por `gen_random_bytes(4)` (CSPRNG do pgcrypto, sem viés de módulo relevante). O lockout 10/1h continua sendo o controle principal.
- **[fix] `MentorNotes.remove()` engolia erro** silenciosamente; agora exibe feedback como o `save()`.

## Próximos passos

- **Exclusividade mentor↔equipe no admin**: o `reassign` em `AdminMentors.jsx` não avisa se a equipe já tem mentor. O fix acima torna o estado multi-mentor seguro para leitura, mas um aviso ("essa equipe já tem mentor X") ataca a origem. Follow-up.
- Visualização das ponderações privadas na banca/jurados (RLS de leitura admin já existe).
- Extrair estilos de input duplicados (`INPUT`/`LBL`) para `_styles.js` — follow-up barato pós-evento.
- `mentor_notes` tem `ON DELETE CASCADE`: remover um mentor apaga suas ponderações. Preferir reatribuir a equipe a remover, se quiser preservar histórico.
