# feat: /security-sweep multi-agent security audit + gated auto-fix command

**Data:** 2026-06-01
**Branch:** feat/security-sweep-command
**Arquivos alterados:** scripts/validate-workflow.mjs, tests/validate-workflow.test.js, .claude/workflows/security-sweep-hunt.js, .claude/workflows/security-sweep-fix.js, .claude/commands/security-sweep.md, CLAUDE.md

## O que foi feito
Comando reutilizável `/security-sweep` que orquestra dois workflows: (A) caça
loop-until-dry de bugs de segurança em todo o projeto + verificação adversarial;
(B) geração de fixes (diffs) só para achados auto-fixable. A thread principal aplica
numa branch isolada, roda o gate (vitest+build) com loop de reparo, e dispara um
agente regression-validator. Inclui um harness validador de workflows testado.

## Por que
A suíte `/pre-deploy-verify` é read-only e limitada ao diff da branch. Faltava uma
auditoria ampla e periódica que também propusesse/aplicasse correções com segurança.

## Decisões técnicas
- Toda mutação de git + gate na thread principal (não em workflow) — consolidação de
  worktrees é frágil/indocumentada.
- Cerca de elegibilidade: SQL/RLS/SECURITY DEFINER/edge/pagamento são report-only
  (o gate não os exercita); só JS/JSX é auto-fixado.
- Voto de verificação fail-safe: denominador fixo (panelSize); painel degradado mantém
  o achado como `unverified` para revisão humana, nunca descarta em silêncio.
- Checkpoint humano duro entre achar e corrigir (prod com dados reais).
- Loop-until-dry (2 rodadas secas) em vez de cronômetro de 15s.

## Impacto
- Novos artefatos de automação; nenhum código de runtime do app alterado.
- Nenhuma dependência adicionada.

## Próximos passos
- Rodar `/security-sweep --dry-run` uma vez para smoke-test do pipeline.
