-- ============================================================
-- MIGRACAO: Transcricao do pitch + 3 eixos do IA Evaluator (edital 5.3)
-- ============================================================
-- Aplique no SQL Editor do projeto Supabase qshrzfahotmjshtjuvno (NAO auto-aplica).
-- Idempotente. Depende de: teams, team_evaluations
-- (add_deliverable_status_and_evaluations.sql), is_admin() (supabase-setup.sql),
-- bucket `files` (add_resources.sql / add_slides_upload.sql).
--
-- Edital 5.3: "Os pitchs serao transcritos e analisados por um modelo de IA
-- treinado para avaliar consistencia tecnica, tom de voz e viabilidade
-- mercadologica." A transcricao (Whisper self-hosted) e gravada em teams pela
-- edge function transcribe-pitch; a analise human-in-the-loop grava os 3 eixos
-- em team_evaluations.axes.

-- 1. teams: transcricao do pitch + meta (gravados pela edge fn via service role).
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcript     TEXT;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_segments       JSONB;   -- [{start,end,text}]
ALTER TABLE teams ADD COLUMN IF NOT EXISTS pitch_transcribed_at TIMESTAMPTZ;

-- 2. team_evaluations: 3 eixos do 5.3 (so na linha ai fase3; NULL nas demais/jurados).
ALTER TABLE team_evaluations ADD COLUMN IF NOT EXISTS axes JSONB;
--   [{key,label,score,justification}] para consistencia_tecnica, tom_de_voz,
--   viabilidade_mercadologica. Display/feedback — NAO entra na soma ponderada.

-- 3. storage: upload do audio do pitch pelo admin. Hoje o admin so tem SELECT/DELETE
--    em deliverables/ (add_slides_upload.sql); o participante nunca escreve audio.
--    Espelha o molde de add_resources.sql.
DROP POLICY IF EXISTS "deliverables_storage_admin_insert" ON storage.objects;
CREATE POLICY "deliverables_storage_admin_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'files' AND name LIKE 'deliverables/%' AND is_admin());
