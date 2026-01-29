import ExcelJS from 'exceljs';
import { readFileSync } from 'fs';

const BATCH_SIZE = parseInt(process.env.EXCEL_BATCH_SIZE || '500', 10);

/**
 * Read workbook and return sheet names only (no cell data).
 */
export function getSheetNames(filePath) {
  const buffer = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  return workbook.xlsx.load(buffer).then(() => workbook.worksheets.map((ws) => ws.name));
}

/**
 * Parse one sheet: read headers from first row, then iterate data rows in batches.
 * Yields { headers, rowIndex, rowData } for each row; rowData is array of cell values.
 * Does not skip empty rows; empty cells as null or ''.
 */
export async function* parseSheetInBatches(filePath, sheetName) {
  const buffer = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Sheet not found: ${sheetName}`);

  const firstRow = worksheet.getRow(1);
  const headers = [];
  firstRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber - 1] = cell.value != null ? String(cell.value) : '';
  });
  const numCols = headers.length;
  const rowCount = worksheet.rowCount ?? 0;
  const dataRowCount = Math.max(0, rowCount - 1);

  for (let rowIndex = 0; rowIndex < dataRowCount; rowIndex++) {
    const excelRowNum = rowIndex + 2;
    const row = worksheet.getRow(excelRowNum);
    const data = [];
    for (let c = 1; c <= numCols; c++) {
      const cell = row.getCell(c);
      const v = cell.value;
      if (v == null || v === '') data.push(null);
      else if (typeof v === 'object' && v.text !== undefined) data.push(v.text);
      else data.push(String(v));
    }
    yield { headers, rowIndex, data };
  }
}

/**
 * Read one column's values from the stored Excel file for integrity check.
 * Returns array of values for row_index 0..totalRows-1 (normalized for comparison).
 */
export async function readColumnFromFile(filePath, sheetName, columnIndex, totalRows) {
  const buffer = readFileSync(filePath);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.getWorksheet(sheetName);
  if (!worksheet) throw new Error(`Sheet not found: ${sheetName}`);

  const values = [];
  for (let rowIndex = 0; rowIndex < totalRows; rowIndex++) {
    const excelRowNum = rowIndex + 2;
    const row = worksheet.getRow(excelRowNum);
    const cell = row.getCell(columnIndex + 1);
    const v = cell.value;
    const normalized = v == null || v === '' ? null : (typeof v === 'object' && v.text !== undefined ? String(v.text) : String(v));
    values.push(normalized);
  }
  return values;
}

export function normalizeCellValue(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && v.trim() === '') return null;
  return String(v).trim();
}

export { BATCH_SIZE };
