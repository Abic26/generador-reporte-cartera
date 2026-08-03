import { excelDate } from "../utils/dates";

export const EXCEL_COLUMNS = [
  { key: "nit", label: "NIT", width: 15 },
  { key: "client", label: "Nombre / Razón social", width: 35 },
  { key: "document", label: "Número de documento", width: 25 },
  { key: "issued", label: "Fecha factura", width: 14, type: "date" },
  { key: "due", label: "Fecha vencimiento", width: 16, type: "date" },
  { key: "term", label: "Condición", width: 19 },
  { key: "status", label: "Estado al corte", width: 18 },
  { key: "days", label: "Días al vencimiento", width: 17 },
  { key: "paymentWeek", label: "Semana de pago", width: 16 },
  { key: "value", label: "Valor", width: 17, type: "money" },
  { key: "cash", label: "Valor contado", width: 17, type: "money" },
  {
    key: "week1Value",
    label: "Valor Semana 1 - 30 días",
    width: 24,
    type: "money",
  },
  {
    key: "week2Value",
    label: "Valor Semana 2 - 45 días",
    width: 24,
    type: "money",
  },
  { key: "other", label: "Otro plazo", width: 17, type: "money" },
  { key: "file", label: "Archivo origen", width: 34 },
];

function safeSheetName(fileName, usedNames) {
  const base =
    fileName
      .replace(/\.pdf$/i, "")
      .replace(/[\\/*?:[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Informe";
  let name = base;
  let suffix = 2;
  while (usedNames.has(name.toLocaleLowerCase("es"))) {
    const ending = ` (${suffix++})`;
    name = `${base.slice(0, 31 - ending.length)}${ending}`;
  }
  usedNames.add(name.toLocaleLowerCase("es"));
  return name;
}

function cellValue(row, key) {
  const values = {
    nit: row.nit,
    client: row.client,
    document: row.document,
    issued: excelDate(row.issued),
    due: excelDate(row.due),
    term: row.term.label,
    status: row.status.label,
    days: row.status.days,
    paymentWeek: row.paymentWeek,
    value: row.value,
    cash: row.term.key === "0" ? row.value : 0,
    week1Value: row.paymentWeek === "Semana 1" ? row.value : 0,
    week2Value: row.paymentWeek === "Semana 2" ? row.value : 0,
    other: row.term.key === "Otro" ? row.value : 0,
    file: row.file,
  };
  return values[key];
}

function groupRowsBySupplier(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    const key = row.nit || row.client;
    if (!groups.has(key)) {
      groups.set(key, { nit: row.nit, client: row.client, rows: [] });
    }
    groups.get(key).rows.push(row);
  });
  return [...groups.values()].sort((a, b) =>
    a.client.localeCompare(b.client, "es", { sensitivity: "base" }),
  );
}

function excelColumnLetter(index) {
  let value = index;
  let result = "";
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function styleDataRow(dataRow, columns, striped) {
  dataRow.height = 20;
  dataRow.eachCell((cell, columnIndex) => {
    cell.font = { name: "Arial", size: 9, color: { argb: "FF29433E" } };
    cell.border = { bottom: { style: "hair", color: { argb: "FFDDE5EB" } } };
    cell.alignment = { vertical: "middle" };
    const type = columns[columnIndex - 1].type;
    if (type === "date") cell.numFmt = "yyyy-mm-dd";
    if (type === "money") cell.numFmt = "$#,##0.00;[Red]-$#,##0.00";
  });
  if (striped) {
    dataRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF8FAFC" } };
    });
  }
}

function addSupplierSubtotal(sheet, rowNumber, startRow, endRow, group, columns) {
  const subtotalRow = sheet.getRow(rowNumber);
  const labelIndex = columns.findIndex((column) => column.type !== "money");
  const safeLabelIndex = labelIndex >= 0 ? labelIndex : 0;
  subtotalRow.getCell(safeLabelIndex + 1).value = `TOTAL ${group.client} - NIT ${group.nit}`;

  columns.forEach((column, index) => {
    if (column.type !== "money" || index === safeLabelIndex) return;
    const letter = excelColumnLetter(index + 1);
    const cell = subtotalRow.getCell(index + 1);
    cell.value = { formula: `SUM(${letter}${startRow}:${letter}${endRow})` };
    cell.numFmt = "$#,##0.00;[Red]-$#,##0.00";
  });

  subtotalRow.height = 24;
  subtotalRow.eachCell((cell) => {
    cell.font = { name: "Arial", size: 9, bold: true, color: { argb: "FF0B4168" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF0BD" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFF1B81A" } },
      bottom: { style: "medium", color: { argb: "FF0B4168" } },
    };
    cell.alignment = { vertical: "middle" };
  });
}

function styleWorksheet(sheet, rows, title, cutoff, columns) {
  const lastColumn = String.fromCharCode(64 + Math.max(8, columns.length));
  const tableLastColumn = String.fromCharCode(64 + columns.length);
  sheet.mergeCells(`A1:${lastColumn}1`);
  Object.assign(sheet.getCell("A1"), { value: title });
  sheet.getCell("A1").font = {
    name: "Arial",
    size: 18,
    bold: true,
    color: { argb: "FFFFFFFF" },
  };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B4168" },
  };
  sheet.getCell("A1").alignment = { vertical: "middle", horizontal: "left" };
  sheet.getRow(1).height = 34;
  sheet.getCell("A2").value = "Fecha de corte";
  sheet.getCell("B2").value = excelDate(cutoff);
  sheet.getCell("B2").numFmt = "yyyy-mm-dd";
  sheet.getCell("D2").value = "Facturas";
  sheet.getCell("E2").value = rows.length;
  sheet.getCell("G2").value = "Total cartera";
  sheet.getCell("H2").value = rows.reduce((sum, row) => sum + row.value, 0);
  sheet.getCell("H2").numFmt = "$#,##0.00;[Red]-$#,##0.00";
  ["A2", "D2", "G2"].forEach((address) => {
    sheet.getCell(address).font = { bold: true, color: { argb: "FF0B4168" } };
  });
  sheet.mergeCells(`A4:${lastColumn}4`);
  sheet.getCell("A4").value =
    "Columnas incluidas según la selección realizada en JD Eléctricos.";
  sheet.getCell("A4").font = {
    italic: true,
    size: 9,
    color: { argb: "FF6F817C" },
  };
  sheet.getCell("A4").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFF6D9" },
  };

  const header = sheet.getRow(6);
  header.values = columns.map((column) => column.label);
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = {
      name: "Arial",
      size: 9,
      bold: true,
      color: { argb: "FFFFFFFF" },
    };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B4168" },
    };
    cell.alignment = {
      vertical: "middle",
      horizontal: "center",
      wrapText: true,
    };
  });
  let currentRow = 7;
  let dataIndex = 0;
  groupRowsBySupplier(rows).forEach((group) => {
    const groupStartRow = currentRow;
    group.rows.forEach((row) => {
      const dataRow = sheet.getRow(currentRow);
      dataRow.values = columns.map((column) => cellValue(row, column.key));
      styleDataRow(dataRow, columns, dataIndex % 2 === 1);
      currentRow += 1;
      dataIndex += 1;
    });
    addSupplierSubtotal(
      sheet,
      currentRow,
      groupStartRow,
      currentRow - 1,
      group,
      columns,
    );
    currentRow += 3;
  });
  sheet.columns = columns.map((column) => ({ width: column.width }));
  sheet.views = [
    {
      state: "frozen",
      ySplit: 6,
      xSplit: Math.min(2, columns.length),
      showGridLines: false,
    },
  ];
  if (rows.length)
    sheet.autoFilter = {
      from: "A6",
      to: `${tableLastColumn}${currentRow - 3}`,
    };
  sheet.pageSetup = {
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    paperSize: 9,
  };
  sheet.headerFooter.oddFooter = `&LGenerado por JD Eléctricos&C&P de &N&RFecha de corte: ${cutoff}`;
}

export async function exportCarteraExcel({
  rows,
  files,
  cutoff,
  selectedColumnKeys,
}) {
  const ExcelJS = (await import("exceljs/dist/exceljs.min.js")).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JD Eléctricos";
  workbook.company = "JD Eléctricos e Industria SAS";
  workbook.created = new Date();
  workbook.calcProperties.fullCalcOnLoad = true;
  workbook.calcProperties.forceFullCalc = true;
  const columns = EXCEL_COLUMNS.filter((column) =>
    selectedColumnKeys.includes(column.key),
  );
  const consolidated = workbook.addWorksheet("Consolidado", {
    properties: { tabColor: { argb: "FF0B4168" } },
  });
  styleWorksheet(
    consolidated,
    rows,
    "Consolidado de cuentas por pagar",
    cutoff,
    columns,
  );
  const usedNames = new Set(["consolidado"]);
  files.forEach((file) => {
    const name = safeSheetName(file.name, usedNames);
    const sheet = workbook.addWorksheet(name, {
      properties: { tabColor: { argb: "FFF1B81A" } },
    });
    styleWorksheet(
      sheet,
      rows.filter((row) => row.file === file.name),
      `Cartera - ${name}`,
      cutoff,
      columns,
    );
  });
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `informe-cartera-${cutoff}.xlsx`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
