import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { EVENT_CONFIG } from '../lib/config'
import { gateState } from './certificateGate'

/** Converte um nome em slug seguro para o nome do arquivo PDF. */
function toSlug(name) {
  return (name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/** O certificado em si — dark/neon na tela, claro na impressão (ver @media print no index.css). */
function CertificateSheet({ profile }) {
  return (
    <div
      id="participant-certificate"
      className="relative mx-auto flex aspect-[1.414/1] w-full max-w-3xl flex-col items-center justify-center overflow-hidden rounded-2xl border border-cyan/40 bg-dark px-[8%] text-center text-white print:max-w-none print:aspect-auto print:rounded-none print:border-0 print:bg-white print:text-black"
    >
      {/* Barras de cor — topo */}
      <div className="absolute inset-x-0 top-0 flex h-1.5">
        <span className="flex-1 bg-cyan" />
        <span className="flex-1 bg-electric" />
        <span className="flex-1 bg-violet" />
      </div>

      {/* Cantos em colchete */}
      <span className="pointer-events-none absolute left-4 top-4 h-7 w-7 border-l-2 border-t-2 border-cyan" />
      <span className="pointer-events-none absolute right-4 top-4 h-7 w-7 border-r-2 border-t-2 border-electric" />
      <span className="pointer-events-none absolute bottom-4 left-4 h-7 w-7 border-b-2 border-l-2 border-violet" />
      <span className="pointer-events-none absolute bottom-4 right-4 h-7 w-7 border-b-2 border-r-2 border-gold" />

      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-cyan sm:text-xs print:text-[10pt]">
        {EVENT_CONFIG.brand}
      </p>

      <h2 className="mt-3 text-lg font-bold tracking-wide sm:text-3xl print:text-[26pt] print:text-black">
        CERTIFICADO DE PARTICIPAÇÃO
      </h2>
      <span className="mt-2 h-px w-40 bg-electric" />

      <p className="mt-4 text-[11px] text-text-muted sm:text-sm print:text-[11pt] print:text-neutral-600">
        Certificamos que
      </p>

      <p className="mt-1 text-2xl font-bold text-gold sm:text-4xl print:text-[30pt]">
        {profile.full_name}
      </p>
      <span className="mt-2 h-px w-56 bg-gold" />

      <p className="mt-4 text-sm text-white/90 sm:text-base print:text-[13pt] print:text-black">
        participou do <span className="font-semibold">{EVENT_CONFIG.name}</span>
      </p>
      <p className="mt-1 text-[11px] text-text-muted sm:text-sm print:text-[11pt] print:text-neutral-600">
        realizado nos dias {EVENT_CONFIG.dates}, em {EVENT_CONFIG.city}.
      </p>

      <span className="mt-4 rounded-full border border-violet px-4 py-1 text-[10px] text-violet sm:text-xs print:text-[10pt]">
        {EVENT_CONFIG.location}
      </span>

      {/* Rodapé — organização */}
      <div className="absolute inset-x-0 bottom-7 text-center">
        <p className="text-[9px] text-text-muted sm:text-[11px] print:text-[9pt] print:text-neutral-600">
          {EVENT_CONFIG.organizer.email}
        </p>
      </div>

      {/* Barras de cor — rodapé */}
      <div className="absolute inset-x-0 bottom-0 flex h-1.5">
        <span className="flex-1 bg-cyan" />
        <span className="flex-1 bg-electric" />
        <span className="flex-1 bg-gold" />
      </div>
    </div>
  )
}

export default function CertificateSection({ profile, token, onGoToEvaluation }) {
  const [evalStatus, setEvalStatus] = useState({ loaded: false, submitted: false, surveyOpen: false })

  useEffect(() => {
    if (!supabase || !token) {
      setEvalStatus({ loaded: true, submitted: false, surveyOpen: false }) // eslint-disable-line react-hooks/set-state-in-effect
      return
    }
    let active = true
    supabase
      .rpc('get_my_event_evaluation', { p_token: token, p_type: 'participant' })
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data || !data.authorized) {
          setEvalStatus({ loaded: true, submitted: false, surveyOpen: false })
          return
        }
        setEvalStatus({ loaded: true, submitted: !!data.submitted, surveyOpen: !!data.open })
      })
    return () => { active = false }
  }, [token])

  const eventEnded = new Date() >= new Date(EVENT_CONFIG.eventEndDate)
  const surveyBypassed = new Date() >= new Date(EVENT_CONFIG.certificateSurveyBypassDate)
  const state = gateState({
    loaded: evalStatus.loaded,
    eventEnded,
    submitted: evalStatus.submitted,
    surveyOpen: evalStatus.surveyOpen,
    surveyBypassed,
  })

  const endDateLabel = new Date(EVENT_CONFIG.eventEndDate).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  })

  function handlePrint() {
    const prev = document.title
    document.title = `certificado-hackia-sc-${toSlug(profile.full_name)}`
    // afterprint pode não disparar em alguns navegadores; o foco volta à janela ao
    // fechar o diálogo (depois de o nome do arquivo já ter sido capturado), então
    // serve de fallback para não deixar o título preso.
    const restore = () => {
      document.title = prev
      window.removeEventListener('afterprint', restore)
      window.removeEventListener('focus', restore)
    }
    window.addEventListener('afterprint', restore, { once: true })
    window.addEventListener('focus', restore, { once: true })
    window.print()
  }

  return (
    <div className="card-glass rounded-2xl p-6 border border-gold/30">
      <div className="flex items-start gap-4">
        {/* Ícone */}
        <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gold/10 border border-gold/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0 1 12 2.944a11.955 11.955 0 0 1-8.618 3.04A12.02 12.02 0 0 0 3 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-xs font-mono text-gold uppercase tracking-wider mb-1">Certificado de Participação</p>
          <p className="text-sm text-white font-semibold leading-snug">{EVENT_CONFIG.name}</p>
          <p className="text-xs text-text-muted mt-1">{EVENT_CONFIG.dates} · {EVENT_CONFIG.city}</p>

          <div className="mt-4">
            {state === 'loading' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark/60 text-text-muted text-sm">
                Carregando…
              </div>
            )}

            {state === 'locked_event' && (
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-dark-border bg-dark/60 text-text-muted text-sm">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                Disponível após o evento ({endDateLabel})
              </div>
            )}

            {state === 'locked_survey' && (
              <div className="space-y-3">
                <p className="text-sm text-text-muted leading-relaxed">
                  Responda a pesquisa de avaliação do evento para liberar seu certificado.
                </p>
                <button
                  onClick={onGoToEvaluation}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-cyan/40 bg-cyan/10 text-cyan text-sm font-semibold hover:bg-cyan/20 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  Ir para a Avaliação
                </button>
              </div>
            )}

            {state === 'locked_survey_closed' && (
              <p className="text-sm text-text-muted leading-relaxed">
                A pesquisa de avaliação está encerrada. Fale com a organização para liberar seu certificado.
              </p>
            )}

            {state === 'available' && (
              <div className="space-y-4">
                <CertificateSheet profile={profile} />
                <button
                  onClick={handlePrint}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-gold/40 bg-gold/10 text-gold text-sm font-semibold hover:bg-gold/20 transition-colors print:hidden"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Imprimir / Salvar como PDF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
