<script setup>
import { computed, ref } from 'vue'
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = workerUrl

const files = ref([])
const invoices = ref([])
const loading = ref(false)
const error = ref('')
const query = ref('')
const statusFilter = ref('Todos')
const termFilter = ref('Todos')
const cutoff = ref(new Date().toISOString().slice(0, 10))
const dragActive = ref(false)

const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 2 })
const plainNumber = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 })

function localDate(value) {
  const [year, month, day] = value.split(/[-/]/).map(Number)
  return new Date(year, month - 1, day)
}

function differenceInDays(a, b) {
  return Math.round((localDate(a) - localDate(b)) / 86400000)
}

function termFor(days) {
  if (days <= 1) return { key: '0', label: 'Contado', days: 0 }
  if (days >= 23 && days <= 37) return { key: '30', label: 'Crédito 30 días', days: 30 }
  if (days >= 38 && days <= 53) return { key: '45', label: 'Crédito 45 días', days: 45 }
  return { key: 'Otro', label: `Crédito ${days} días`, days }
}

function statusFor(dueDate) {
  const days = differenceInDays(dueDate, cutoff.value)
  if (days < 0) return { key: 'Vencida', label: `${Math.abs(days)} d vencida`, days }
  if (days === 0) return { key: 'Hoy', label: 'Vence hoy', days }
  return { key: 'Por vencer', label: `En ${days} días`, days }
}

function parseAmount(raw) {
  const negative = /-$/.test(raw.trim())
  const value = Number(raw.replace(/[,$|\s-]/g, ''))
  return negative ? -value : value
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

async function extractPdf(file) {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const result = []
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
      if (doc && supplier) {
        const issued = doc[2].replaceAll('/', '-')
        const due = doc[3].replaceAll('/', '-')
        const rawDays = Math.max(0, differenceInDays(due, issued))
        result.push({
          id: `${file.name}-${pageNumber}-${doc[1]}-${result.length}`,
          file: file.name,
          reportDate,
          nit: supplier.nit,
          client: supplier.name,
          document: doc[1].toUpperCase(),
          issued,
          due,
          value: parseAmount(doc[4]),
          term: termFor(rawDays),
        })
      }
    }
  }
  return { rows: result, pages: pdf.numPages }
}

async function loadFiles(input) {
  const selected = [...input].filter((file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))
  if (!selected.length) {
    error.value = 'Selecciona uno o varios archivos PDF válidos.'
    return
  }
  loading.value = true
  error.value = ''
  invoices.value = []
  files.value = selected.map((file) => ({ name: file.name, size: file.size, state: 'Leyendo…', pages: 0, count: 0 }))
  try {
    for (let index = 0; index < selected.length; index += 1) {
      const extracted = await extractPdf(selected[index])
      invoices.value.push(...extracted.rows)
      files.value[index] = { ...files.value[index], state: 'Procesado', pages: extracted.pages, count: extracted.rows.length }
    }
    if (!invoices.value.length) error.value = 'No se encontraron documentos tipo P con el formato esperado en los archivos.'
  } catch (cause) {
    console.error(cause)
    error.value = 'No fue posible leer uno de los PDF. Verifica que corresponda al informe detallado de SIIGO.'
  } finally {
    loading.value = false
  }
}

function onDrop(event) {
  dragActive.value = false
  loadFiles(event.dataTransfer.files)
}

const enriched = computed(() => invoices.value.map((row) => ({ ...row, status: statusFor(row.due) })))
const filtered = computed(() => {
  const needle = query.value.trim().toLocaleLowerCase('es')
  return enriched.value.filter((row) => {
    const matchesText = !needle || `${row.client} ${row.nit} ${row.document}`.toLocaleLowerCase('es').includes(needle)
    const matchesStatus = statusFilter.value === 'Todos' || row.status.key === statusFilter.value
    const matchesTerm = termFilter.value === 'Todos' || row.term.key === termFilter.value
    return matchesText && matchesStatus && matchesTerm
  })
})

const summary = computed(() => {
  const rows = enriched.value
  const sum = (subset) => subset.reduce((total, row) => total + row.value, 0)
  const overdue = rows.filter((row) => row.status.key === 'Vencida')
  const next30 = rows.filter((row) => row.status.days >= 0 && row.status.days <= 30)
  return {
    documents: rows.length,
    suppliers: new Set(rows.map((row) => row.nit)).size,
    total: sum(rows),
    overdue: sum(overdue),
    overdueCount: overdue.length,
    next30: sum(next30),
    next30Count: next30.length,
  }
})

function csvCell(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function exportCsv() {
  const headers = ['NIT', 'Nombre / Razón social', 'Número de documento', 'Fecha factura', 'Fecha vencimiento', 'Plazo', 'Estado', 'Valor', 'Valor contado', 'Valor 30 días', 'Valor 45 días', 'Archivo origen']
  const rows = filtered.value.map((row) => [
    row.nit, row.client, row.document, row.issued, row.due, row.term.label, row.status.label, row.value,
    row.term.key === '0' ? row.value : 0,
    row.term.key === '30' ? row.value : 0,
    row.term.key === '45' ? row.value : 0,
    row.file,
  ])
  const csv = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `informe-cartera-${cutoff.value}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

function formatDate(value) {
  return localDate(value).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
}
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="Cartera Clara, inicio">
        <span class="brand-mark"><span></span><span></span><span></span></span>
        <span><strong>Cartera Clara</strong><small>Control de proveedores</small></span>
      </a>
      <div class="secure-pill"><span></span> Procesamiento local y seguro</div>
    </header>

    <section class="hero-copy">
      <div class="eyebrow">INFORMES DE CUENTAS POR PAGAR</div>
      <h1>Convierte tus PDF en<br><em>decisiones más claras.</em></h1>
      <p>Carga tus reportes de cartera, identifica vencimientos y organiza tus pagos en segundos.</p>
    </section>

    <section
      class="upload-card"
      :class="{ active: dragActive }"
      @dragenter.prevent="dragActive = true"
      @dragover.prevent
      @dragleave.prevent="dragActive = false"
      @drop.prevent="onDrop"
    >
      <div class="upload-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" /></svg>
      </div>
      <h2>{{ loading ? 'Procesando tus informes…' : 'Arrastra tus archivos aquí' }}</h2>
      <p>o selecciónalos desde tu equipo</p>
      <label class="primary-button" :class="{ disabled: loading }">
        <input type="file" multiple accept="application/pdf,.pdf" :disabled="loading" @change="loadFiles($event.target.files)" />
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" /></svg>
        Seleccionar PDF
      </label>
      <span class="upload-note">PDF · Puedes cargar varios archivos a la vez</span>
    </section>

    <div v-if="error" class="alert" role="alert">{{ error }}</div>

    <section v-if="files.length" class="file-strip" aria-label="Archivos cargados">
      <div v-for="file in files" :key="file.name" class="file-chip">
        <span class="pdf-icon">PDF</span>
        <span><strong>{{ file.name }}</strong><small>{{ file.state }}<template v-if="file.pages"> · {{ file.pages }} pág. · {{ file.count }} facturas</template></small></span>
        <span class="file-check" :class="{ pending: file.state !== 'Procesado' }">{{ file.state === 'Procesado' ? '✓' : '…' }}</span>
      </div>
    </section>

    <section v-if="invoices.length" class="results">
      <div class="results-heading">
        <div><span class="section-kicker">RESUMEN</span><h2>Estado de tu cartera</h2></div>
        <label class="cutoff">Fecha de corte <input v-model="cutoff" type="date" /></label>
      </div>

      <div class="summary-grid">
        <article><span class="metric-icon blue">▤</span><div><small>Total por pagar</small><strong>{{ money.format(summary.total) }}</strong><span>{{ summary.documents }} facturas · {{ summary.suppliers }} proveedores</span></div></article>
        <article><span class="metric-icon coral">!</span><div><small>Saldo vencido</small><strong>{{ money.format(summary.overdue) }}</strong><span>{{ summary.overdueCount }} facturas vencidas</span></div></article>
        <article><span class="metric-icon gold">◷</span><div><small>Próximos 30 días</small><strong>{{ money.format(summary.next30) }}</strong><span>{{ summary.next30Count }} facturas por pagar</span></div></article>
      </div>

      <div class="report-card">
        <div class="toolbar">
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 4 4"/></svg>
            <input v-model="query" placeholder="Buscar proveedor, NIT o documento…" aria-label="Buscar" />
          </div>
          <select v-model="statusFilter" aria-label="Filtrar por estado"><option>Todos</option><option>Vencida</option><option>Hoy</option><option>Por vencer</option></select>
          <select v-model="termFilter" aria-label="Filtrar por plazo"><option>Todos</option><option value="0">Contado</option><option value="30">30 días</option><option value="45">45 días</option><option value="Otro">Otro plazo</option></select>
          <button class="export-button" @click="exportCsv">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14"/></svg> Exportar CSV
          </button>
        </div>

        <div class="table-scroll">
          <table>
            <thead><tr><th>Proveedor</th><th>Documento</th><th>Vencimiento</th><th>Condición</th><th>Estado</th><th class="right">Valor</th></tr></thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id">
                <td><strong>{{ row.client }}</strong><small>NIT {{ row.nit }}</small></td>
                <td><code>{{ row.document }}</code><small>Factura: {{ formatDate(row.issued) }}</small></td>
                <td>{{ formatDate(row.due) }}</td>
                <td><span class="term-badge" :class="`term-${row.term.key}`">{{ row.term.label }}</span></td>
                <td><span class="status-badge" :class="row.status.key.toLowerCase().replace(' ', '-')"><i></i>{{ row.status.label }}</span></td>
                <td class="right amount">{{ money.format(row.value) }}</td>
              </tr>
              <tr v-if="!filtered.length"><td colspan="6" class="empty">No hay facturas que coincidan con los filtros.</td></tr>
            </tbody>
          </table>
        </div>
        <footer class="table-footer"><span>Mostrando {{ filtered.length }} de {{ invoices.length }} facturas</span><span>Total filtrado: <strong>{{ money.format(filtered.reduce((sum, row) => sum + row.value, 0)) }}</strong></span></footer>
      </div>
    </section>

    <section v-else class="features">
      <article><span>01</span><h3>Carga uno o varios PDF</h3><p>Combina reportes de proveedores, transportes y otros en un solo informe.</p></article>
      <article><span>02</span><h3>Detecta cada vencimiento</h3><p>Extraemos proveedor, NIT, factura, fechas, plazo comercial y valor.</p></article>
      <article><span>03</span><h3>Exporta y toma acción</h3><p>Filtra lo urgente y descarga un CSV compatible con Excel.</p></article>
    </section>

    <footer class="page-footer">Los archivos se procesan en este dispositivo y no se envían a ningún servidor.</footer>
  </main>
</template>
