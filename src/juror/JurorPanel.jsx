import { useJuror } from './useJuror'
import JurorTeamCard from './JurorTeamCard'

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
