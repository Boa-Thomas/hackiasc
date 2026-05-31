import { useState, useEffect, useCallback, useMemo } from "react";
import {
  getExternalClient,
  mapExternalRows,
  buildPhaseLookup,
  matchKey,
} from "../lib/teamPhases";

const POLL_MS = 20000;

// Le a fase das equipes do projeto externo (read-only) e re-le a cada 20s.
// Em erro de rede mantem o ultimo valor conhecido e sinaliza `error`.
export function useTeamPhases() {
  const [externalList, setExternalList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = useCallback(async () => {
    const client = getExternalClient();
    if (!client) {
      setLoading(false);
      return;
    }
    const { data, error: err } = await client
      .from("teams")
      .select("name, stage");
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    setError(null);
    setExternalList(mapExternalRows(data));
    setLastUpdated(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    const t = setInterval(load, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  const lookup = useMemo(() => buildPhaseLookup(externalList), [externalList]);
  const getPhase = useCallback(
    (name) => lookup.get(matchKey(name)) ?? null,
    [lookup],
  );

  return { getPhase, externalList, loading, error, lastUpdated };
}
