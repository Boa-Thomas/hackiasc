// Decide o estado do certificado a partir de sinais já resolvidos.
// Ordem importa: data antes da pesquisa; pesquisa respondida (ou prazo de dispensa) antes de checar se está aberta.
// → 'loading' | 'locked_event' | 'locked_survey' | 'locked_survey_closed' | 'available'
export function gateState({ loaded, eventEnded, submitted, surveyOpen, surveyBypassed }) {
  if (!loaded) return 'loading'
  if (!eventEnded) return 'locked_event'
  if (submitted || surveyBypassed) return 'available'
  return surveyOpen ? 'locked_survey' : 'locked_survey_closed'
}
