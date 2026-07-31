export function localDate(value) {
  const [year, month, day] = value.split(/[-/]/).map(Number)
  return new Date(year, month - 1, day)
}

export function differenceInDays(a, b) {
  return Math.round((localDate(a) - localDate(b)) / 86400000)
}

export function excelDate(value) {
  const date = localDate(value)
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12)
}

export function formatDate(value) {
  return localDate(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
