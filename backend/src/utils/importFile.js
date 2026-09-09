/* utils/importFile.js
 *
 * Shared Excel/CSV bulk-import helpers (same behavior as the Users import):
 *  - parseImportBuffer(buffer, filename) → array of { headerKey: cellValue }
 *  - header aliases map common spellings → canonical field names
 *  - toCell() trims cell values safely
 *
 * Controllers supply their own HEADER_ALIASES + row validation.
 */
import ExcelJS from 'exceljs';
import AppError from './AppError.js';

export const toCell = (v) => (v === null || v === undefined ? '' : String(v).trim());

// Manual CSV parser — handles quoted fields, commas inside quotes, and CRLF.
function parseCSV(text) {
  const rows = [];
  let cur = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cur); cur = '';
    } else if (ch === '\n') {
      row.push(cur); rows.push(row); row = []; cur = '';
    } else if (ch === '\r') {
      // skip, handle \n
    } else {
      cur += ch;
    }
  }
  if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ''));
}

function rowsToObjects(rows, normalizeHeader) {
  const header = rows[0].map(normalizeHeader);
  if (header.every((h) => h === null)) {
    throw new AppError('Could not detect a valid header row. Use the provided template.', 400);
  }
  const data = [];
  for (let i = 1; i < rows.length; i++) {
    const obj = { __line: i + 1 };
    rows[i].forEach((cellVal, idx) => {
      const key = header[idx];
      if (key) obj[key] = cellVal;
    });
    if (Object.keys(obj).length > 1) data.push(obj);
  }
  return data;
}

/** Parse uploaded buffer into an array of plain objects (header → value). */
export async function parseImportBuffer(buffer, filename = '', normalizeHeader) {
  const lower = (filename || '').toLowerCase();
  const normalize = normalizeHeader || ((h) => (h || '').toString().trim().toLowerCase() || null);

  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
    const rows = parseCSV(text);
    if (rows.length < 2) throw new AppError('CSV must contain a header row and at least one data row.', 400);
    return rowsToObjects(rows, normalize);
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount < 2) throw new AppError('XLSX must contain a header row and at least one data row.', 400);
    const rows = [];
    ws.eachRow((r) => {
      const vals = [];
      r.eachCell({ includeEmpty: true }, (c) => vals.push(c.value));
      rows.push(vals.map((v) => (v === null || v === undefined ? '' : String(v))));
    });
    return rowsToObjects(rows, normalize);
  }

  throw new AppError('Unsupported file type. Please upload a .xlsx, .xls, or .csv file.', 400);
}

/** Build an .xlsx template buffer from headers + one sample row. */
export async function buildImportTemplate(sheetName, headers, sampleRow) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  ws.addRow(headers);
  if (sampleRow) ws.addRow(sampleRow);
  ws.getRow(1).font = { bold: true };
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(String(h).length + 4, 18);
  });
  return wb.xlsx.writeBuffer();
}

export const sendXlsxDownload = async (res, filename, buffer) => {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(Buffer.from(buffer));
};
