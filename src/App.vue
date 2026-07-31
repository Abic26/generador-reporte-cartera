<script setup>
import { useCartera } from "./composables/useCartera";

const {
  files,
  invoices,
  loading,
  error,
  query,
  statusFilter,
  termFilter,
  cutoff,
  dragActive,
  money,
  filtered,
  summary,
  excelColumns,
  selectedColumns,
  loadFiles,
  onDrop,
  exportExcel,
  toggleColumn,
  selectAllColumns,
  formatDate,
} = useCartera();
</script>

<template>
  <main class="app-shell">
    <header class="topbar">
      <a class="brand" href="#" aria-label="JD Eléctricos, inicio"
        ><span class="brand-mark"><img src="/jd-logo.png" alt="" /></span
        ><span
          ><strong>JD Eléctricos</strong
          ><small>Control de proveedores</small></span
        ></a
      >
      <div class="secure-pill"><span></span> Procesamiento local y seguro</div>
    </header>

    <section class="hero-copy">
      <div class="eyebrow">INFORMES DE CUENTAS POR PAGAR</div>
      <h1>Convierte tus PDF en<br /><em>decisiones más claras.</em></h1>
      <p>
        Carga tus reportes de cartera, identifica vencimientos y organiza tus
        pagos en segundos.
      </p>
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
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"
          />
        </svg>
      </div>
      <h2>
        {{
          loading ? "Procesando tus informes…" : "Arrastra tus archivos aquí"
        }}
      </h2>
      <p>o selecciónalos desde tu equipo</p>
      <label class="primary-button" :class="{ disabled: loading }"
        ><input
          type="file"
          multiple
          accept="application/pdf,.pdf"
          :disabled="loading"
          @change="loadFiles($event.target.files)"
        /><svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M4 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"
          /></svg
        >Seleccionar PDF</label
      >
      <span class="upload-note"
        >PDF · Puedes cargar varios archivos a la vez</span
      >
    </section>

    <div v-if="error" class="alert" role="alert">{{ error }}</div>
    <section
      v-if="files.length"
      class="file-strip"
      aria-label="Archivos cargados"
    >
      <div v-for="file in files" :key="file.name" class="file-chip">
        <span class="pdf-icon">PDF</span
        ><span
          ><strong>{{ file.name }}</strong
          ><small
            >{{ file.state
            }}<template v-if="file.pages">
              · {{ file.pages }} pág. · {{ file.count }} facturas</template
            ></small
          ></span
        ><span
          class="file-check"
          :class="{ pending: file.state !== 'Procesado' }"
          >{{ file.state === "Procesado" ? "✓" : "…" }}</span
        >
      </div>
    </section>

    <section v-if="invoices.length" class="results">
      <div class="results-heading">
        <div>
          <span class="section-kicker">RESUMEN</span>
          <h2>Estado de tu cartera</h2>
        </div>
        <label class="cutoff"
          >Fecha de corte <input v-model="cutoff" type="date"
        /></label>
      </div>
      <div class="summary-grid">
        <article>
          <span class="metric-icon blue">▤</span>
          <div>
            <small>Total por pagar</small
            ><strong>{{ money.format(summary.total) }}</strong
            ><span
              >{{ summary.documents }} facturas ·
              {{ summary.suppliers }} proveedores</span
            >
          </div>
        </article>
        <article>
          <span class="metric-icon coral">!</span>
          <div>
            <small>Saldo vencido</small
            ><strong>{{ money.format(summary.overdue) }}</strong
            ><span>{{ summary.overdueCount }} facturas vencidas</span>
          </div>
        </article>
        <article>
          <span class="metric-icon gold">◷</span>
          <div>
            <small>Próximos 30 días</small
            ><strong>{{ money.format(summary.next30) }}</strong
            ><span>{{ summary.next30Count }} facturas por pagar</span>
          </div>
        </article>
      </div>

      <div class="report-card">
        <div class="toolbar">
          <div class="search-wrap">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m16 16 4 4" /></svg
            ><input
              v-model="query"
              placeholder="Buscar proveedor, NIT o documento…"
              aria-label="Buscar"
            />
          </div>
          <select v-model="statusFilter" aria-label="Filtrar por estado">
            <option>Todos</option>
            <option>Vencida</option>
            <option>Hoy</option>
            <option>Por vencer</option>
          </select>
          <select v-model="termFilter" aria-label="Filtrar por plazo">
            <option>Todos</option>
            <option value="0">Contado</option>
            <option value="30">30 días</option>
            <option value="45">45 días</option>
            <option value="Otro">Otro plazo</option>
          </select>
          <button
            class="export-button"
            :disabled="loading || !filtered.length || !selectedColumns.length"
            @click="exportExcel"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" /></svg
            >{{ loading ? "Generando…" : `Generar Excel (${filtered.length})` }}
          </button>
        </div>

        <div class="column-picker">
          <div class="column-picker-heading">
            <div>
              <strong>Columnas del Excel</strong
              ><span
                >Selecciona las casillas que quieres incluir en cada
                pestaña.</span
              >
            </div>
            <button type="button" @click="selectAllColumns">
              Seleccionar todas
            </button>
          </div>
          <div class="column-options">
            <label
              v-for="column in excelColumns"
              :key="column.key"
              :class="{ selected: selectedColumns.includes(column.key) }"
              ><input
                type="checkbox"
                :checked="selectedColumns.includes(column.key)"
                @change="toggleColumn(column.key)"
              /><span class="box"></span>{{ column.label }}</label
            >
          </div>
        </div>

        <div class="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Proveedor</th>
                <th>Documento</th>
                <th>Vencimiento</th>
                <th>Condición</th>
                <th>Estado</th>
                <th class="right">Valor</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filtered" :key="row.id">
                <td>
                  <strong>{{ row.client }}</strong
                  ><small>NIT {{ row.nit }}</small>
                </td>
                <td>
                  <code>{{ row.document }}</code
                  ><small>Factura: {{ formatDate(row.issued) }}</small>
                </td>
                <td>{{ formatDate(row.due) }}</td>
                <td>
                  <span class="term-badge" :class="`term-${row.term.key}`">{{
                    row.term.label
                  }}</span>
                </td>
                <td>
                  <span
                    class="status-badge"
                    :class="row.status.key.toLowerCase().replace(' ', '-')"
                    ><i></i>{{ row.status.label }}</span
                  >
                </td>
                <td class="right amount">{{ money.format(row.value) }}</td>
              </tr>
              <tr v-if="!filtered.length">
                <td colspan="6" class="empty">
                  No hay facturas que coincidan con los filtros.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <footer class="table-footer">
          <span
            >Mostrando {{ filtered.length }} de
            {{ invoices.length }} facturas</span
          ><span
            >Excel: {{ selectedColumns.length }} columnas · Total filtrado:
            <strong>{{
              money.format(filtered.reduce((sum, row) => sum + row.value, 0))
            }}</strong></span
          >
        </footer>
      </div>
    </section>

    <section v-else class="features">
      <article>
        <span>01</span>
        <h3>Carga uno o varios PDF</h3>
        <p>
          Combina reportes de proveedores, transportes y otros en un solo
          informe.
        </p>
      </article>
      <article>
        <span>02</span>
        <h3>Detecta cada vencimiento</h3>
        <p>
          Extraemos proveedor, NIT, factura, fechas, plazo comercial y valor.
        </p>
      </article>
      <article>
        <span>03</span>
        <h3>Exporta y toma acción</h3>
        <p>
          Filtra lo urgente y genera un Excel con las columnas que necesites.
        </p>
      </article>
    </section>
    <footer class="page-footer">
      <img src="/jd-logo.png" alt="Logo JD Eléctricos" /> Los archivos se
      procesan en este dispositivo y no se envían a ningún servidor.
    </footer>
  </main>
</template>
