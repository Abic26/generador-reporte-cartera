import { computed, ref } from "vue";
import { extractPdf } from "../services/pdfExtractor";
import { EXCEL_COLUMNS, exportCarteraExcel } from "../services/excelExporter";
import { differenceInDays, formatDate } from "../utils/dates";

export function useCartera() {
  const files = ref([]);
  const invoices = ref([]);
  const loading = ref(false);
  const error = ref("");
  const query = ref("");
  const statusFilter = ref("Todos");
  const termFilter = ref("Todos");
  const cutoff = ref(new Date().toISOString().slice(0, 10));
  const dragActive = ref(false);
  const selectedColumns = ref(EXCEL_COLUMNS.map((column) => column.key));
  const money = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    maximumFractionDigits: 2,
  });

  function statusFor(dueDate) {
    const days = differenceInDays(dueDate, cutoff.value);
    if (days < 0)
      return { key: "Vencida", label: `${Math.abs(days)} d vencida`, days };
    if (days === 0) return { key: "Hoy", label: "Vence hoy", days };
    return { key: "Por vencer", label: `En ${days} días`, days };
  }

  async function loadFiles(input) {
    const selected = [...input].filter(
      (file) =>
        file.type === "application/pdf" ||
        file.name.toLowerCase().endsWith(".pdf"),
    );
    if (!selected.length) {
      error.value = "Selecciona uno o varios archivos PDF válidos.";
      return;
    }
    loading.value = true;
    error.value = "";
    invoices.value = [];
    files.value = selected.map((file) => ({
      name: file.name,
      size: file.size,
      state: "Leyendo…",
      pages: 0,
      count: 0,
    }));
    try {
      for (let index = 0; index < selected.length; index += 1) {
        const extracted = await extractPdf(selected[index]);
        invoices.value.push(...extracted.rows);
        files.value[index] = {
          ...files.value[index],
          state: "Procesado",
          pages: extracted.pages,
          count: extracted.rows.length,
        };
      }
      if (!invoices.value.length)
        error.value =
          "No se encontraron documentos tipo P con el formato esperado.";
    } catch (cause) {
      console.error(cause);
      error.value =
        "No fue posible leer uno de los PDF. Verifica que corresponda al informe detallado de SIIGO.";
    } finally {
      loading.value = false;
    }
  }

  function onDrop(event) {
    dragActive.value = false;
    loadFiles(event.dataTransfer.files);
  }
  const enriched = computed(() =>
    invoices.value.map((row) => ({ ...row, status: statusFor(row.due) })),
  );
  const filtered = computed(() => {
    const needle = query.value.trim().toLocaleLowerCase("es");
    return enriched.value.filter((row) => {
      const text =
        !needle ||
        `${row.client} ${row.nit} ${row.document}`
          .toLocaleLowerCase("es")
          .includes(needle);
      return (
        text &&
        (statusFilter.value === "Todos" ||
          row.status.key === statusFilter.value) &&
        (termFilter.value === "Todos" || row.term.key === termFilter.value)
      );
    });
  });
  const summary = computed(() => {
    const rows = filtered.value;
    const sum = (subset) => subset.reduce((total, row) => total + row.value, 0);
    const overdue = rows.filter((row) => row.status.key === "Vencida");
    const next30 = rows.filter(
      (row) => row.status.days >= 0 && row.status.days <= 30,
    );
    return {
      documents: rows.length,
      suppliers: new Set(rows.map((row) => row.nit)).size,
      total: sum(rows),
      overdue: sum(overdue),
      overdueCount: overdue.length,
      next30: sum(next30),
      next30Count: next30.length,
    };
  });

  function toggleColumn(key) {
    const next = new Set(selectedColumns.value);
    if (next.has(key) && next.size > 1) next.delete(key);
    else next.add(key);
    selectedColumns.value = EXCEL_COLUMNS.filter((column) =>
      next.has(column.key),
    ).map((column) => column.key);
  }
  function selectAllColumns() {
    selectedColumns.value = EXCEL_COLUMNS.map((column) => column.key);
  }

  async function exportExcel() {
    if (!filtered.value.length || !selectedColumns.value.length) return;
    loading.value = true;
    error.value = "";
    try {
      await exportCarteraExcel({
        rows: filtered.value,
        files: files.value,
        cutoff: cutoff.value,
        selectedColumnKeys: selectedColumns.value,
      });
    } catch (cause) {
      console.error(cause);
      error.value =
        "No fue posible generar el archivo Excel. Intenta nuevamente.";
    } finally {
      loading.value = false;
    }
  }

  return {
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
    excelColumns: EXCEL_COLUMNS,
    selectedColumns,
    loadFiles,
    onDrop,
    exportExcel,
    toggleColumn,
    selectAllColumns,
    formatDate,
  };
}
