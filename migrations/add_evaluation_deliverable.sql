-- ============================================================
-- MIGRACAO: IA Evaluator por entregavel
-- ============================================================
-- Aplique no Supabase SQL Editor do projeto qshrzfahotmjshtjuvno (NAO auto-aplica).
-- Idempotente (IF NOT EXISTS). Depende de: team_evaluations
-- (add_deliverable_status_and_evaluations.sql).
--
-- A IA passa a gravar 1 avaliacao por (equipe, entregavel). `deliverable` marca a
-- fase ('fase1'|'fase2'|'fase3'). NULL = avaliacao holistica/humana (jurados,
-- juror_id setado) — mantem o fluxo oficial intacto.

ALTER TABLE team_evaluations
  ADD COLUMN IF NOT EXISTS deliverable TEXT
  CHECK (deliverable IN ('fase1','fase2','fase3'));

-- 1 avaliacao IA por (equipe, entregavel); re-executavel (UPDATE da linha existente).
-- Parcial: linhas humanas/holisticas (deliverable NULL) ficam livres.
CREATE UNIQUE INDEX IF NOT EXISTS uq_team_eval_ai_deliverable
  ON team_evaluations (team_id, deliverable)
  WHERE evaluator_type = 'ai' AND deliverable IS NOT NULL;
