import { createClient } from "@supabase/supabase-js";
import { EXTERNAL_PHASE_TRACKER } from "./config";

const { url, anonKey, PHASES, STAGE_ALIASES, TEAM_NAME_ALIASES } =
  EXTERNAL_PHASE_TRACKER;

const PHASE_BY_KEY = Object.fromEntries(PHASES.map((p) => [p.key, p]));

// Mapa de apelidos default (do config), ja normalizado. Fallback offline.
const DEFAULT_ALIAS_MAP = { ...TEAM_NAME_ALIASES };

// Cliente Supabase EXTERNO, lazy e somente-leitura. null se não configurado.
let _client;
export function getExternalClient() {
  if (!url || !anonKey) return null;
  if (!_client) {
    _client = createClient(url, anonKey, { auth: { persistSession: false } });
  }
  return _client;
}

// Minúsculas; remove acentos, emoji, espaços e pontuação.
export function normalizeTeamName(name) {
  return (name || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

// Pares crus [{ external, hackia }] -> { normExternal: normHackia } (ignora lado vazio).
export function buildAliasMap(rawPairs) {
  const map = {};
  for (const pair of rawPairs || []) {
    const ext = normalizeTeamName(pair && pair.external);
    const hk = normalizeTeamName(pair && pair.hackia);
    if (ext && hk) map[ext] = hk;
  }
  return map;
}

// stage (string do banco externo) -> objeto de fase ou null.
export function stageToPhase(stage) {
  if (!stage) return null;
  const raw = String(stage).trim().toLowerCase();
  const key = STAGE_ALIASES[raw] || raw;
  return PHASE_BY_KEY[key] || null;
}

// Chave canônica de casamento de um nome (aplica o mapa de apelidos).
export function matchKey(name, aliasMap = DEFAULT_ALIAS_MAP) {
  const norm = normalizeTeamName(name);
  return aliasMap[norm] || norm;
}

// Linhas externas [{ name, stage }] -> [{ name, key, phase }].
export function mapExternalRows(rows, aliasMap = DEFAULT_ALIAS_MAP) {
  return (rows || []).map((r) => ({
    name: r.name,
    key: matchKey(r.name, aliasMap),
    phase: stageToPhase(r.stage),
  }));
}

// Map chave->fase (primeira fase valida vence; null nao sobrescreve fase boa).
export function buildPhaseLookup(externalList) {
  const map = new Map();
  for (const e of externalList) {
    if (!map.has(e.key) || map.get(e.key) === null) map.set(e.key, e.phase);
  }
  return map;
}

// Nomes externos que não têm par entre os nomes HackIA.
export function findUnmatchedExternal(hackiaNames, externalList, aliasMap = DEFAULT_ALIAS_MAP) {
  const hackiaKeys = new Set(hackiaNames.map((n) => matchKey(n, aliasMap)));
  return externalList.filter((e) => !hackiaKeys.has(e.key)).map((e) => e.name);
}
