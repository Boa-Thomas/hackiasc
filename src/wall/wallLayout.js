// Layout do telao do Muro de Dores. Logica pura (sem React) para caber em teste.

// Densidade do grid por quantidade de dores visiveis: telao tem que caber numa
// tela so (sem scroll). Faixas calibradas para ~20-50 dores num projetor 1080p.
export function densityFor(n) {
  if (n <= 12) return { cols: 3, titleClass: 'text-3xl xl:text-4xl' }
  if (n <= 24) return { cols: 4, titleClass: 'text-2xl xl:text-3xl' }
  if (n <= 40) return { cols: 5, titleClass: 'text-xl xl:text-2xl' }
  return { cols: 6, titleClass: 'text-lg xl:text-xl' }
}

// Mapa cols -> classe Tailwind ESTATICA (Tailwind nao gera classe dinamica).
const COL_CLASS = {
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
}

export function gridColsClass(cols) {
  return COL_CLASS[cols] || 'grid-cols-4'
}

// Ordena para exibicao. Fora de 'results': estavel por criacao (cards nao pulam
// e nao vazam o placar). Em 'results': ranking por votos, desempate por criacao.
export function sortPainsForPhase(pains, phase) {
  const arr = [...(pains || [])]
  if (phase === 'results') {
    return arr.sort(
      (a, b) =>
        (b.vote_count || 0) - (a.vote_count || 0) ||
        String(a.created_at).localeCompare(String(b.created_at)),
    )
  }
  return arr.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
}
