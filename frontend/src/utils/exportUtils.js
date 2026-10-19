/**
 * Export utilities for Excel generation
 */

// Excel Export — uses ExcelJS (replaces xlsx ^0.18.5 which had prototype-pollution CVEs)
export const exportToExcel = async (data, filename = 'export.xlsx') => {
  try {
    const ExcelJSModule = await import('exceljs');
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const wb = new ExcelJS.Workbook();
    wb.creator  = 'Zemen Bank CAS';
    wb.created  = new Date();
    wb.modified = new Date();

    // ── Brand constants ──────────────────────────────────────────────────────
    const RED    = 'FFC8102E';  // Zemen Bank primary red
    const WHITE  = 'FFFFFFFF';
    const LIGHT  = 'FFF5F5F5';
    const BORDER = { style: 'thin', color: { argb: 'FFD1D5DB' } };

    const headerFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: RED } };
    const altRowFill   = { type: 'pattern', pattern: 'solid', fgColor: { argb: LIGHT } };
    const boldWhiteFont = { bold: true, color: { argb: WHITE } };

    const allBorders = { top: BORDER, left: BORDER, bottom: BORDER, right: BORDER };

    if (data.type === 'results') {

      // ── Results sheet (one row per employee × competency) ─────────────────
      const ws = wb.addWorksheet('Results');

      ws.columns = [
        { header: 'Competency',    key: 'competency', width: 32 },
        { header: 'Employee Name', key: 'employee',   width: 28 },
        { header: 'Department',    key: 'department', width: 24 },
        { header: 'Score (%)',     key: 'score',      width: 12 },
        { header: 'Status',        key: 'status',     width: 14 },
        { header: 'Date',          key: 'date',       width: 16 },
      ];

      // Style header row
      const headerRow = ws.getRow(1);
      headerRow.eachCell((cell) => {
        cell.fill   = headerFill;
        cell.font   = boldWhiteFont;
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      headerRow.height = 22;

      // Add data rows
      (data.results || []).forEach((r, idx) => {
        const row = ws.addRow({
          competency: r.competencyName || 'N/A',
          employee:   r.userName || 'N/A',
          department: r.department || 'N/A',
          score:      r.finalScore === null || r.finalScore === undefined ? '-' : Number(r.finalScore),
          status:     r.status || '',
          date:       r.date || '',
        });

        // Alternate row shading
        if (idx % 2 === 0) {
          row.eachCell((cell) => { cell.fill = altRowFill; });
        }
        row.eachCell((cell) => { cell.border = allBorders; });

        // Center score, keep it a real number so Excel can sort/filter
        const scoreCell = row.getCell('score');
        scoreCell.alignment = { horizontal: 'center' };
        if (typeof scoreCell.value === 'number') scoreCell.numFmt = '0.0';
      });
    }

    if (data.type === 'activities') {

      // ── Activity Log sheet ────────────────────────────────────────────────
      const ws = wb.addWorksheet('Activity Log');

      ws.columns = [
        { header: 'Date',        key: 'date',        width: 20 },
        { header: 'Entity',      key: 'entity',      width: 22 },
        { header: 'Action',      key: 'action',      width: 20 },
        { header: 'Description', key: 'description', width: 60 },
        { header: 'User',        key: 'user',        width: 28 },
        { header: 'Role',        key: 'role',        width: 14 },
        { header: 'IP Address',  key: 'ip',          width: 18 },
        { header: 'Metadata',    key: 'metadata',    width: 50 },
      ];

      const activityHeaderRow = ws.getRow(1);
      activityHeaderRow.eachCell((cell) => {
        cell.fill   = headerFill;
        cell.font   = boldWhiteFont;
        cell.border = allBorders;
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      activityHeaderRow.height = 22;

      (data.activities || []).forEach((a, idx) => {
        const row = ws.addRow({
          date:        new Date(a.date).toLocaleString(),
          entity:      a.entity || '',
          action:      a.action || '',
          description: a.description || '',
          user:        a.user || 'System',
          role:        a.role || '',
          ip:          a.ip || '',
          metadata:    a.metadata ? JSON.stringify(a.metadata) : '',
        });

        if (idx % 2 === 0) row.eachCell((cell) => { cell.fill = altRowFill; });
        row.eachCell((cell) => { cell.border = allBorders; });
        row.getCell('description').alignment = { wrapText: true };
      });
    }

    // Write to buffer and trigger browser download
    const buffer = await wb.xlsx.writeBuffer();
    const blob   = new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url  = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href     = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);

    return true;
  } catch (error) {
    console.error('Excel Export Error:', error);
    throw error;
  }
};

export const generateFilename = (prefix, extension) => {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  return `${prefix}_${timestamp}.${extension}`;
};
