# feat: Muro de Dores — votantes (telão/admin) + admin add pain

**Data:** 2026-05-29

## O que foi feito
- Telão (`#telao`): cada ideia mostra quem votou (chips "primeiro nome + inicial",
  6 + "+N mais"), só na fase `voting_open`.
- Admin (`AdminWall`): cada ideia expande mostrando os votantes com nome + email +
  phone (botão "copiar todos") para direcionar a formação dos grupos.
- Admin pode cadastrar uma dor em nome de um participante confirmado (busca por
  nome/email/CPF), só na fase `wall_open`.

## Backend (`migrations/add_wall_voters.sql`)
- `wall_display_name(full_name)` — nome curto para o nível público.
- `wall_list` estendido: telão (registration_id NULL) recebe `voters` curtos;
  participante não recebe (payload enxuto).
- `wall_admin_list` estendido: `voters` com nome + contato (gated admin).
- `wall_admin_add_pain` — novo, `is_admin()`, só em `wall_open`.

## Decisões
- Mantidas as 3 fases. Telão expõe nome curto publicamente; contato só no admin.
- Migration aplicada via MCP (não auto-aplica).
