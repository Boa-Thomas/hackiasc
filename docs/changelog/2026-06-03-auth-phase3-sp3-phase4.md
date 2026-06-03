# feat(auth): Phase 3 SP3/Phase 4 — AdminPanel scope narrowing (frontend)

**Data:** 2026-06-03
**Branch:** feat/auth-phase3-sp3-phase4
**Spec:** docs/superpowers/specs/2026-06-03-auth-phase3-sp3-scope-enforcement-design.md (§ Frontend)
**Arquivos:** src/admin/adminTabs.js (novo), src/admin/AdminPanel.jsx, src/admin/AdminAccess.jsx, src/admin/adminTabs.test.js (novo)

## O que foi feito
Camada de UX do SP3 (o gate real é o backend — Phase 2 RPC + Phase 3 RLS, já em prod):
- **`adminTabs.js` (novo):** `ALL_TABS` (movido de AdminPanel — fonte única dos IDs de aba, que são exatamente o que `allowed_tabs`/`assert_tab` gateiam) + `tabsForRole(role)` + `tabsForScope(roleTabs, scope)` (funções puras, testadas).
- **AdminPanel:** busca o scope AO VIVO via RPC `my_scope()` no mount (`{}` sem grant = irrestrito; contas-senha não assam scope no JWT). (1) `allowed_tabs` ∩ abas-do-papel (entradas desconhecidas = no-op; nunca deixa o nav vazio); (2) `read_only` agora **estende** o `readOnly` (antes só viewer) p/ esconder ações de escrita nos componentes que recebem o prop. Badge "somente leitura" p/ admin read_only.
- **AdminAccess:** input free-text de `allowedTabs` (placeholder mentiroso: `results,payments` nem são IDs reais) → **checkboxes** dos IDs canônicos (ALL_TABS). `allowed_tabs` agora só emite IDs reais → tab-gating fica utilizável.

## Decisão técnica
- **Visibilidade de aba (papel) desacoplada de escrita (scope):** o `readOnly` antigo fazia DUAS coisas — esconder abas adminOnly E esconder escrita. Um admin `read_only` deve **ver** todas as abas admin (leitura ampla, Option 2) e só não escrever. Então: abas por papel (`tabsForRole`); `read_only` afeta só o prop de escrita. Os guards `!readOnly && show('mentors')` viraram `show('mentors')` — viewer já é barrado pelo próprio `show()` (a aba não está no TABS do papel), então sem regressão; admin read_only passa a ver o conteúdo.
- **`tabsForScope` semântica:** vazio/ausente = irrestrito; entradas desconhecidas = no-op; se a interseção ficar vazia (grant nomeia só abas que o papel não tem) → fallback p/ abas-do-papel (nunca tela em branco; backend é o gate).
- **Aba Acessos travada p/ read_only:** um admin read_only **não** vê/abre a aba Acessos (criar conta lá escalaria além do read_only). Defense-in-depth — o edge `access-account` precisa do mesmo gate server-side (Tarefa E, próximo) pois o frontend não barra um curl direto.
- **`my_scope` com erro:** loga e assume `{}` (irrestrito na UI) — o backend (`can_write()`/RLS) é o gate real.
- **Limitação conhecida (UX):** componentes que não recebem `readOnly` (Mentors/Jurors/Wall/Sugar/Resources/Facilitator/Notifications/Checkin) ainda mostram botões de escrita p/ admin read_only — o clique falha no backend (`read_only`). Cobertura de esconder-escrita fica nos componentes de dados principais (Dashboard/Registrations/Teams/Deliverables/Evaluation/Financeiro/Bulk). Threadar `readOnly` nos demais é follow-up.

## Impacto
- Frontend only (deploy no merge). Backend (gate real) já em prod desde Phase 2/3.
- vitest **163/163** verde (incl. novo `adminTabs.test.js`: tabsForRole + tabsForScope, incl. unknown=no-op e nunca-em-branco). `npm run build` verde. Lint: 0 erro novo (o único nos arquivos tocados é o `load()` effect pré-existente do AdminAccess).

## Próximos passos
- Opcional: adicionar tab-gate nas escritas diretas (RLS) p/ fechar a assimetria RPC-vs-direto (hoje `allowed_tabs` gateia writes via RPC; escrita direta só checa read_only).
- Follow-up E: edges access-account/sync-mp-payments/transcribe-pitch checam role mas não scope.
