export function cleanCPF(cpf) {
  return (cpf || '').replace(/\D/g, '')
}

export function formatCPF(cpf) {
  const c = cleanCPF(cpf).slice(0, 11)
  if (c.length <= 3) return c
  if (c.length <= 6) return `${c.slice(0, 3)}.${c.slice(3)}`
  if (c.length <= 9) return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6)}`
  return `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9, 11)}`
}

export function validateCPF(cpf) {
  const cleaned = cleanCPF(cpf)
  if (cleaned.length !== 11) return false
  if (/^(\d)\1{10}$/.test(cleaned)) return false

  let sum = 0
  for (let i = 0; i < 9; i++) sum += parseInt(cleaned[i]) * (10 - i)
  let remainder = (sum * 10) % 11
  if (remainder >= 10) remainder = 0
  if (remainder !== parseInt(cleaned[9])) return false

  sum = 0
  for (let i = 0; i < 10; i++) sum += parseInt(cleaned[i]) * (11 - i)
  remainder = (sum * 10) % 11
  if (remainder >= 10) remainder = 0
  return remainder === parseInt(cleaned[10])
}
