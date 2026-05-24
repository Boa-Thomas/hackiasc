import { useState } from 'react'
import { useJuror } from './useJuror'
import JurorTeamCard from './JurorTeamCard'

// ---------------------------------------------------------------------------
// ConsentGate — exibido quando juror.consent_at é null/ausente.
// ---------------------------------------------------------------------------
function ConsentGate({ jurorName, onAccept }) {
  const [checked, setChecked] = useState(false)
  const [accepting, setAccepting] = useState(false)
  const [acceptError, setAcceptError] = useState(null)

  async function handleAccept() {
    if (!checked || accepting) return
    setAccepting(true)
    setAcceptError(null)
    const result = await onAccept()
    if (!result.ok) {
      setAcceptError('Erro ao registrar consentimento. Tente novamente.')
      setAccepting(false)
    }
    // Se ok, o refresh() interno em acceptConsent atualiza o contexto e o
    // JurorPanel re-renderiza sem o ConsentGate (consent_at passa a ser não-nulo).
  }

  return (
    <div className="min-h-screen bg-dark text-white bg-grid flex items-center justify-center px-4 py-12">
      <div className="orb w-[400px] h-[400px] bg-electric/10 -top-20 -left-20 pointer-events-none" />
      <div className="orb w-[300px] h-[300px] bg-violet/10 bottom-0 right-0 pointer-events-none" />

      <div className="card-glass rounded-2xl p-8 max-w-2xl w-full relative z-10">
        {/* Cabeçalho */}
        <p className="text-xs font-mono text-electric uppercase tracking-wider mb-1">
          HackIA SC — AI Hackathon Blumenau 2026
        </p>
        <h1 className="text-xl sm:text-2xl font-bold text-white mb-6">
          Termo de Consentimento — Gravação e Avaliação por IA
        </h1>

        {/* Saudação */}
        <p className="text-sm text-white/80 mb-5">
          Olá, <span className="text-gold font-semibold">{jurorName}</span>. Antes de acessar o painel de avaliação, leia e aceite o termo abaixo.
        </p>

        {/* Corpo do termo */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5 text-sm text-white/80 space-y-3 leading-relaxed mb-6">
          <p>Como jurado(a) do HackIA SC — AI Hackathon Blumenau 2026, autorizo:</p>
          <ol className="list-decimal list-inside space-y-2 pl-1">
            <li>
              A gravação em áudio e/ou vídeo das minhas falas e feedbacks durante as apresentações
              e deliberações do evento.
            </li>
            <li>
              A transcrição automatizada e a análise dessas gravações por modelos de Inteligência
              Artificial (IA Evaluator), em conjunto com os critérios da rubrica oficial do edital.
            </li>
            <li>
              O uso das gravações e transcrições exclusivamente para fins de avaliação das equipes
              e geração de feedback, conforme a cláusula 5.3 do edital.
            </li>
          </ol>
          <p>
            As gravações não serão utilizadas para outras finalidades sem novo consentimento. Posso
            revogar este consentimento a qualquer momento, por escrito, junto à organização
            (<a href="mailto:contato@hackiasc.com" className="text-cyan hover:underline">contato@hackiasc.com</a>),
            ressalvado o material já utilizado na avaliação.
          </p>
          <p className="text-white/60 text-xs font-mono">
            Ao marcar a caixa abaixo e continuar, declaro que li e concordo com este termo.
          </p>
        </div>

        {/* Checkbox */}
        <label className="flex items-start gap-3 cursor-pointer mb-6 group">
          <input
            type="checkbox"
            checked={checked}
            onChange={e => setChecked(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-cyan cursor-pointer flex-shrink-0"
          />
          <span className="text-sm text-white/80 group-hover:text-white transition-colors">
            Li e concordo com este Termo de Consentimento.
          </span>
        </label>

        {/* Erro */}
        {acceptError && (
          <p className="text-sm text-hot mb-4 font-mono">{acceptError}</p>
        )}

        {/* Botão */}
        <button
          onClick={handleAccept}
          disabled={!checked || accepting}
          className={[
            'w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200',
            checked && !accepting
              ? 'bg-electric hover:bg-electric/80 text-white glow-electric cursor-pointer'
              : 'bg-white/10 text-white/30 cursor-not-allowed',
          ].join(' ')}
        >
          {accepting ? 'Registrando consentimento…' : 'Aceitar e continuar'}
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// JurorPanel — orquestra ConsentGate + painel de avaliação.
// ---------------------------------------------------------------------------
export default function JurorPanel() {
  const juror = useJuror()
  const { loading, isValid, token } = juror

  if (loading) {
    return (
      <div className="min-h-screen bg-dark flex items-center justify-center">
        <p className="text-white/60 font-mono">Carregando...</p>
      </div>
    )
  }

  if (!token || !isValid) {
    return (
      <div className="min-h-screen bg-dark text-white bg-grid flex items-center justify-center px-4">
        <div className="card-glass rounded-2xl p-8 max-w-md text-center">
          <p className="text-xs font-mono text-hot uppercase tracking-wider mb-2">Acesso inválido</p>
          <h1 className="text-xl font-bold">Link de jurado inválido ou desativado</h1>
          <p className="text-sm text-text-muted mt-3">
            Verifique se você abriu o link completo enviado pela organização. Se o problema persistir,
            peça um novo link ao time do HackIA SC.
          </p>
          <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = '' }}
            className="inline-block mt-5 text-sm text-cyan hover:underline font-mono">
            ← voltar ao site
          </a>
        </div>
      </div>
    )
  }

  const { juror: profile, teams, myScores } = juror

  // Exibe o termo se o jurado ainda não consentiu (consent_at null/ausente).
  if (!profile?.consent_at) {
    return (
      <ConsentGate
        jurorName={profile?.name ?? 'Jurado(a)'}
        onAccept={juror.acceptConsent}
      />
    )
  }

  const scoreByTeam = new Map((myScores || []).map(s => [s.team_id, s]))
  const evaluatedCount = (myScores || []).length

  return (
    <div className="min-h-screen bg-dark text-white bg-grid">
      <div className="orb w-[500px] h-[500px] bg-gold/5 -top-40 -right-40 pointer-events-none" />

      <header className="sticky top-0 z-20 bg-dark/80 backdrop-blur border-b border-dark-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <a href="#" onClick={(e) => { e.preventDefault(); window.location.hash = '' }} className="font-mono text-lg font-bold tracking-tight">
            <span className="text-cyan">{'>'}</span>
            <span className="text-white">hack</span>
            <span className="text-gradient-cyan">IA</span>
            <span className="text-text-muted">.sc</span>
          </a>
          <span className="hidden sm:inline-block text-text-muted text-xs font-mono uppercase tracking-wider">/ Scorecard do Jurado</span>
        </div>
      </header>

      <main className="relative max-w-4xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        <div className="card-glass rounded-2xl p-6">
          <p className="text-xs font-mono text-gold uppercase tracking-wider">Bem-vindo(a)</p>
          <h1 className="text-2xl font-bold mt-1">{profile?.name}</h1>
          <p className="text-sm text-text-muted mt-2">
            Avalie cada equipe pela rubrica do edital. Você pode salvar e editar suas notas enquanto a votação estiver aberta.
          </p>
          <p className="text-xs text-text-muted mt-3 font-mono">
            {evaluatedCount} de {teams.length} equipes avaliadas
          </p>
        </div>

        {!teams.length && (
          <div className="card-glass rounded-2xl p-6">
            <p className="text-sm text-text-muted">Nenhuma equipe disponível para avaliação ainda.</p>
          </div>
        )}

        {teams.map(team => (
          <JurorTeamCard
            key={team.id}
            team={team}
            existing={scoreByTeam.get(team.id) || null}
            onSubmit={juror.submitScore}
          />
        ))}
      </main>
    </div>
  )
}
