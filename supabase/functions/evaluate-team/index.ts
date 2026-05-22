// Stub do IA Evaluator. Estrutura pronta; o agente de IA ainda não está conectado.
// A rubrica do edital fica embutida como fonte de verdade para quando o agente for plugado.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts'

const EDITAL_RUBRIC = {
  version: 'edital_v1',
  total: 100,
  criteria: [
    { key: 'tecnica_ia', label: 'Execução Técnica e IA', weight: 30, eliminatory: true,
      describe: 'Funcionalidade do código, design da solução e profundidade da implementação de IA.' },
    { key: 'validacao_problema', label: 'Validação do Problema', weight: 25, eliminatory: false,
      describe: 'Dor real validada com dados; internacionalização; aderência aos eixos de governança (extra).' },
    { key: 'escala_negocio', label: 'Escalabilidade e Negócio', weight: 25, eliminatory: false,
      describe: 'Potencial de crescimento, evidências de tração comercial e viabilidade financeira.' },
    { key: 'pitch_equipe', label: 'Pitch e Equipe', weight: 20, eliminatory: false,
      describe: 'Clareza do problema, sinergia dos fundadores, continuidade e resposta aos jurados.' },
  ],
  extra: { key: 'mentor', label: 'Avaliação do Mentor',
    describe: 'Parecer padronizado do mentor fixo (extra, não soma nos 100).' },
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)

  let body: { team_id?: string } = {}
  try { body = await req.json() } catch { /* ignore parse error */ }
  if (!body.team_id) return json({ error: 'team_id_required' }, 400)

  // Estrutura pronta — o agente de IA ainda não foi implementado.
  return json({
    error: 'not_implemented',
    message: 'IA Evaluator ainda não conectado.',
    team_id: body.team_id,
    rubric: EDITAL_RUBRIC,
  }, 501)
})
