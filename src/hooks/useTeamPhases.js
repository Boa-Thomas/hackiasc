import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getExternalClient, mapExternalRows, buildPhaseLookup, normalizeTeamName, buildAliasMap, findUnmatchedExternal } from '../lib/teamPhases'

const POLL_MS = 20000

// Le a fase das equipes do projeto externo (read-only) + os apelidos editaveis
// do nosso banco. Re-le a cada 20s. Em erro mantem o ultimo valor conhecido.
// `aliases` comeca null (= "ainda nao carregado"): nesse estado o aliasMap fica
// undefined e mapExternalRows cai no DEFAULT_ALIAS_MAP (config) como fallback.
// Depois de carregado (mesmo vazio) o banco passa a ser a fonte.
// O alias e unidirecional (so transforma o lado externo); por isso getPhase e
// getUnmatched casam o nome HackIA por normalizacao pura.
export function useTeamPhases() {
  const [externalRows, setExternalRows] = useState([])
  const [aliases, setAliases] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)

  const load = useCallback(async () => {
    if (supabase) {
      const { data: aliasData, error: aliasErr } = await supabase.rpc('get_team_phase_aliases')
      if (!aliasErr && Array.isArray(aliasData)) setAliases(aliasData)
    }
    const client = getExternalClient()
    if (!client) { setLoading(false); return }
    const { data, error: err } = await client.from('teams').select('name, stage')
    if (err) { setError(err.message); setLoading(false); return }
    setError(null)
    setExternalRows(data || [])
    setLastUpdated(new Date())
    setLoading(false)
  }, [])

  useEffect(() => {
    load() // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS)
    return () => clearInterval(t)
  }, [load])

  // null => nao carregado/sem rede => undefined => mapExternalRows usa o default do config.
  const aliasMap = useMemo(() => (aliases === null ? undefined : buildAliasMap(aliases)), [aliases])
  const externalList = useMemo(() => mapExternalRows(externalRows, aliasMap), [externalRows, aliasMap])
  const lookup = useMemo(() => buildPhaseLookup(externalList), [externalList])
  const getPhase = useCallback((name) => lookup.get(normalizeTeamName(name)) ?? null, [lookup])
  const getUnmatched = useCallback((hackiaNames) => findUnmatchedExternal(hackiaNames, externalList), [externalList])

  const saveAliases = useCallback(async (pairs) => {
    if (!supabase) return { error: 'supabase-indisponivel' }
    const { data, error: err } = await supabase.rpc('set_team_phase_aliases', { p_aliases: pairs })
    if (err) return { error: err.message }
    if (Array.isArray(data)) setAliases(data)
    return { data }
  }, [])

  // aliasesLoaded distingue "ainda carregando" de "carregado vazio" para a UI
  // poder bloquear o editor antes do 1o fetch (evita salvar [] e apagar o banco).
  return { getPhase, getUnmatched, externalList, aliases: aliases || [], aliasesLoaded: aliases !== null, saveAliases, loading, error, lastUpdated }
}
