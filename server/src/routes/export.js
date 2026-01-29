import { Router } from 'express';
import ExcelJS from 'exceljs';
import * as sessionService from '../services/sessionService.js';
import { readColumnFromFile, normalizeCellValue } from '../services/excelService.js';

const router = Router({ mergeParams: true });

/**
 * Pre-export integrity check: compare one non-modified left column from session_rows
 * with the stored Excel file. Returns { ok: true } or { ok: false, error }.
 */
async function runIntegrityCheck(sessionId) {
  const session = sessionService.getSession(sessionId);
  if (!session || !session.file_path) return { ok: false, error: 'Session or file not found' };
  const config = sessionService.getSessionConfig(sessionId);
  if (!config || !config.left_columns || config.left_columns.length === 0) {
    return { ok: false, error: 'No left column to compare' };
  }
  const leftColumn = config.left_columns[0];
  const headers = session.headers;
  const columnIndex = headers.indexOf(leftColumn);
  if (columnIndex === -1) return { ok: false, error: 'Left column not in headers' };

  const fileValues = await readColumnFromFile(
    session.file_path,
    session.sheet_name,
    columnIndex,
    session.total_rows
  );
  const rows = sessionService.getSessionRows(sessionId, 0, session.total_rows);
  if (rows.length !== session.total_rows) {
    return { ok: false, error: 'Row count mismatch' };
  }
  for (let i = 0; i < rows.length; i++) {
    const data = rows[i].data;
    const dbVal = data[columnIndex];
    const normalizedDb = normalizeCellValue(dbVal);
    const normalizedFile = normalizeCellValue(fileValues[i]);
    if (normalizedDb !== normalizedFile) {
      return { ok: false, error: `Integrity check failed at row ${i}: data out of sync with source file` };
    }
  }
  return { ok: true };
}

// GET /api/sessions/:id/export
router.get('/', async (req, res) => {
  try {
    const sessionId = Number(req.params.id);
    const session = sessionService.getSession(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    const config = sessionService.getSessionConfig(sessionId);
    if (!config) return res.status(400).json({ error: 'Session not configured' });

    const check = await runIntegrityCheck(sessionId);
    if (!check.ok) {
      return res.status(409).json({
        error: check.error || 'Integrity check failed: data out of sync with source file. Re-import the sheet or contact support.',
      });
    }

    const BATCH = 1000;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(session.sheet_name || 'Sheet1');
    const headers = session.headers;
    const targetColumn = config.target_column;
    const targetColumnIsNew = config.target_column_is_new === 1;
    const targetColIndex = headers.indexOf(targetColumn);

    const exportHeaders = targetColumnIsNew ? [...headers, targetColumn] : headers;
    sheet.addRow(exportHeaders);

    const edits = sessionService.getAllRowEdits(sessionId);
    let offset = 0;
    while (true) {
      const rows = sessionService.getSessionRows(sessionId, offset, BATCH);
      if (rows.length === 0) break;
      for (const { row_index, data } of rows) {
        const rowData = [...data];
        const editVal = edits[row_index];
        if (editVal !== undefined) {
          if (targetColumnIsNew) {
            while (rowData.length < headers.length) rowData.push(null);
            rowData.push(editVal);
          } else if (targetColIndex >= 0) {
            rowData[targetColIndex] = editVal;
          }
        } else if (targetColumnIsNew) {
          while (rowData.length < headers.length) rowData.push(null);
          rowData.push(null);
        }
        sheet.addRow(rowData);
      }
      offset += rows.length;
      if (rows.length < BATCH) break;
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="export-${sessionId}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message || 'Export failed' });
  }
});

export default router;
