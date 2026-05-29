# Associação mentor↔equipe agora é N:N — 2026-05-29

A relação mentor↔equipe passou de 1:N (mentor com uma única equipe) para N:N.

## O que mudou

- **DB:** nova tabela `mentor_teams(mentor_id, team_id)`; backfill a partir de
  `mentors.team_id`; a coluna `mentors.team_id` foi removida.
- **RPCs:** `mentor_serialize_me` devolve `teams: [...]` (cada nota carrega
  `team_id`); `mentor_save_note` recebe `p_team_id` e valida a associação;
  `admin_create_mentor` não recebe mais equipe (atribuição é feita depois).
- **Portal do mentor:** seletor de equipe (uma por vez) quando o mentor tem
  mais de uma; entregáveis e ponderações escopados à equipe ativa.
- **Admin:** cada mentor tem multi-select de equipes (chips + adicionar/remover).
- **Notas ao desparear:** as notas persistem no banco, mas somem da visão do
  mentor enquanto ele não estiver pareado àquela equipe.

## Migração

Aplicar `migrations/mentor_teams_nn.sql` no Supabase **junto** com o deploy do
frontend — é mudança com quebra (dropa coluna e troca assinatura de RPC).
