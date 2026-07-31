import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { differenceInDays } from '../utils/dates'

GlobalWorkerOptions.workerSrc = workerUrl

function termFor(days) {
  if (days <= 1) return { key: '0', label: 'Contado', days: 0 }
  if (days >= 23 && days <= 37) return { key: '30', label: 'Crédito 30 días', days: 30 }
  if (days >= 38 && days <= 53) return { key: '45', label: 'Crédito 45 días', days: 45 }
  return { key: 'Otro', label: `Crédito ${days} días`, days }
}

function parseAmount(raw) {
  const value = Number(raw.replace(/[,$|\s-]/g, ''))
  return /-$/.test(raw.trim()) ? -value : value
}

function cleanName(raw) {
  return raw.replace(/^\s*000\s+/, '').replace(/\s+/g, ' ').trim()
}

async function pageLines(page) {
  const content = await page.getTextContent()
  const rows = new Map()
  content.items.forEach((item) => {
    const y = Math.round(item.transform[5] / 3) * 3
    if (!rows.has(y)) rows.set(y, [])
    rows.get(y).push({ x: item.transform[4], text: item.str })
  })
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(' ').replace(/\s+/g, ' ').trim())
}

export async function extractPdf(file) {
  const pdf = await getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const rows = []
  let supplier = null
  let reportDate = ''

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const lines = await pageLines(await pdf.getPage(pageNumber))
    for (const line of lines) {
      const processed = line.match(/Procesado:\s*(\d{4}\/\d{2}\/\d{2})/i)
      if (processed) reportDate = processed[1].replaceAll('/', '-')
      const header = line.match(/^\s*(\d{6,},\d{3})\s+(.+?)\s+TELS\s*:/i)
      if (header) supplier = { nit: header[1], name: cleanName(header[2]) }
      const doc = line.match(/\b(P\d{3}-\d+-\d{3})\s+(\d{4}\/\d{2}\/\d{2})\s+(\d{4}\/\d{2}\/\d{2})\s*\|?\s*([\d,.]+-?)/i)
      if (!doc || !supplier) continue
      const issued = doc[2].replaceAll('/', '-')
      const due = doc[3].replaceAll('/', '-')
      rows.push({
        id: `${file.name}-${pageNumber}-${doc[1]}-${rows.length}`,
        file: file.name,
        reportDate,
        nit: supplier.nit,
        client: supplier.name,
        document: doc[1].toUpperCase(),
        issued,
        due,
        value: parseAmount(doc[4]),
        term: termFor(Math.max(0, differenceInDays(due, issued))),
      })
    }
  }
  return { rows, pages: pdf.numPages }
}
