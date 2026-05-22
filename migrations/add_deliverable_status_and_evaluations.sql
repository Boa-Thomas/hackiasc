-- Admin deliverables: status da entrega em `teams` + estrutura de avaliação (stub IA).
-- Rubrica = edital (4 critérios com pesos %, Técnica eliminatória).

-- 1. Status da entrega (admin controla manualmente).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','submitted','reviewing','evaluated'));

-- 2. Avaliações da equipe (estrutura pronta; agente de IA plugado depois).
CREATE TABLE IF NOT EXISTS team_evaluations (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  evaluator_type TEXT NOT NULL DEFAULT 'ai' CHECK (evaluator_type IN ('ai','human')),
  rubric_version TEXT NOT NULL DEFAULT 'edital_v1',
  scores         JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{criterion_key,label,weight,score,justification}]
  total_score    NUMERIC,                              -- 0..100 (soma ponderada)
  eliminated     BOOLEAN NOT NULL DEFAULT false,       -- critério técnico é eliminatório
  summary        TEXT,
  model          TEXT,                                 -- qual LLM gerou (null por ora)
  status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','done','error')),
  error          TEXT,
  created_by     UUID,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_evaluations_team_id ON team_evaluations(team_id);

ALTER TABLE team_evaluations ENABLE ROW LEVEL SECURITY;

-- admin/viewer leem; admin escreve; service_role (edge function) bypassa RLS automaticamente.
DROP POLICY IF EXISTS "Admin viewer read team evaluations" ON team_evaluations;
CREATE POLICY "Admin viewer read team evaluations" ON team_evaluations
  FOR SELECT TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin','viewer'));

DROP POLICY IF EXISTS "Admin write team evaluations" ON team_evaluations;
CREATE POLICY "Admin write team evaluations" ON team_evaluations
  FOR ALL TO authenticated
  USING ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin')
  WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin');
