import { relativeTime } from '../lib/relativeTime'

// Linha discreta de meta POR SECAO: "Editado por {nome} · há {tempo}".
// `meta` é o objeto deliverable_meta da equipe ({ <field>: { updated_by_name, updated_at } });
// `field` é o campo da fase ativa (hypotheses_canvas, slc_ia_canvas, ...).
// Renderiza nada quando não há meta para o campo.
export default function SectionMeta({ meta, field }) {
  const entry = meta && field ? meta[field] : null
  if (!entry || !entry.updated_at) return null
  return (
    <p className="text-xs text-text-muted">
      Editado por {entry.updated_by_name || 'membro da equipe'} · há {relativeTime(entry.updated_at)}
    </p>
  )
}
