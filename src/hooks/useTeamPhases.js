import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { getExternalClient, mapExternalRows, buildPhaseLookup, matchKey, buildAliasMap, findUnmatchedExternal } from '../lib/teamPhases'

const POLL_MS = 20000

// Le a fase das equipes do projeto externo (read-only) + os apelidos editaveis
// do nosso banco. Re-le a cada 20s. Em erro mantem o ultimo valor conhecido.
export function useTeamPhases() {
  const [externalRows, setExternalRows] = useState([])
  const [aliases, setAliases] = useState([])
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

  const aliasMap = useMemo(() => buildAliasMap(aliases), [aliases])
  const externalList = useMemo(() => mapExternalRows(externalRows, aliasMap), [externalRows, aliasMap])
  const lookup = useMemo(() => buildPhaseLookup(externalList), [externalList])
  const getPhase = useCallback((name) => lookup.get(matchKey(name, aliasMap)) ?? null, [lookup, aliasMap])
  const getUnmatched = useCallback((hackiaNames) => findUnmatchedExternal(hackiaNames, externalList, aliasMap), [externalList, aliasMap])

  const saveAliases = useCallback(async (pairs) => {
    if (!supabase) return { error: 'supabase-indisponivel' }
    const { data, error: err } = await supabase.rpc('set_team_phase_aliases', { p_aliases: pairs })
    if (err) return { error: err.message }
    if (Array.isArray(data)) setAliases(data)
    return { data }
  }, [])

  return { getPhase, getUnmatched, externalList, aliases, saveAliases, loading, error, lastUpdated }
}
