/**
 * Export utilities for PDF and Excel generation
 */

// PDF Export - Working version
export const exportToPDF = async (data, filename = 'export.pdf') => {
  try {
    // Import jsPDF dynamically
    const jsPDFModule = await import('jspdf');
    const jsPDF = jsPDFModule.default || jsPDFModule.jsPDF;
    
    const doc = new jsPDF();
    
    // Zemen Bank Header
    doc.setFontSize(22);
    doc.setTextColor(200, 16, 46);
    doc.text('ZEMEN BANK', 105, 20, { align: 'center' });
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text('Competency Assessment System', 105, 28, { align: 'center' });
    
    doc.setDrawColor(200, 16, 46);
    doc.setLineWidth(0.5);
    doc.line(20, 32, 190, 32);

    let yPos = 45;

    if (data.type === 'results') {
      // Title
      doc.setFontSize(16);
      doc.setTextColor(0);
      doc.text('Assessment Results Report', 20, yPos);
      yPos += 10;

      // Employee Info Box
      if (data.user) {
        doc.setFillColor(245, 245, 245);
        doc.rect(20, yPos, 170, 25, 'F');
        
        doc.setFontSize(10);
        doc.setTextColor(60);
        
        doc.text(`Employee Name: ${data.user.name}`, 25, yPos + 7);
        doc.text(`Employee ID: ${data.user.employeeId}`, 25, yPos + 13);
        doc.text(`Department: ${data.user.department || 'N/A'}`, 25, yPos + 19);
        
        doc.text(`Position: ${data.user.position || 'N/A'}`, 120, yPos + 7);
        doc.text(`Generated: ${new Date().toLocaleDateString()}`, 120, yPos + 13);
        doc.text(`Time: ${new Date().toLocaleTimeString()}`, 120, yPos + 19);
        
        yPos += 35;
      }

      // Summary Statistics
      if (data.results.length > 0) {
        const avgScore = Math.round(data.results.reduce((acc, r) => acc + r.finalScore, 0) / data.results.length);
        const finalCount = data.results.filter(r => r.status === 'FINAL').length;
        
        doc.setFillColor(200, 16, 46);
        doc.rect(20, yPos, 170, 18, 'F');
        
        doc.setFontSize(11);
        doc.setTextColor(255, 255, 255);
        doc.text('SUMMARY', 25, yPos + 7);
        
        doc.text(`Total: ${data.results.length}`, 25, yPos + 13);
        doc.text(`Finalized: ${finalCount}`, 90, yPos + 13);
        doc.text(`Avg Score: ${avgScore}%`, 140, yPos + 13);
        
        yPos += 25;
      }

      // Results Table
      doc.setFontSize(11);
      doc.setTextColor(0);
      doc.text('Detailed Results', 20, yPos);
      yPos += 8;

      // Table Headers
      doc.setFillColor(240, 240, 240);
      doc.rect(20, yPos, 170, 8, 'F');
      
      doc.setFontSize(9);
      doc.text('Competency', 22, yPos + 5);
      doc.text('Score', 100, yPos + 5);
      doc.text('Level', 125, yPos + 5);
      doc.text('Status', 155, yPos + 5);
      
      yPos += 10;

      // Table Rows
      data.results.forEach((r, idx) => {
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }

        if (idx % 2 === 0) {
          doc.setFillColor(250, 250, 250);
          doc.rect(20, yPos - 2, 170, 8, 'F');
        }

        doc.setTextColor(0);
        const compName = r.competencyName || r.competencyId?.name || 'N/A';
        doc.text(compName.substring(0, 35), 22, yPos + 3);
        doc.text(`${r.finalScore}%`, 100, yPos + 3);
        
        const levelColors = {
          Basic: [245, 158, 11],
          Intermediate: [234, 88, 12],
          Advanced: [37, 99, 235],
          Expert: [22, 163, 74]
        };
        const color = levelColors[r.level] || [100, 100, 100];
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(r.level, 125, yPos + 3);
        
        doc.setTextColor(0);
        doc.text(r.status, 155, yPos + 3);
        
        yPos += 8;
      });

      // Recommendations
      const withRecommendations = data.results.filter(r => r.recommendation);
      if (withRecommendations.length > 0) {
        yPos += 10;
        
        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }
        
        doc.setFontSize(14);
        doc.setTextColor(200, 16, 46);
        doc.text('Development Recommendations', 20, yPos);
        yPos += 10;

        withRecommendations.forEach((r, idx) => {
          if (yPos > 240) {
            doc.addPage();
            yPos = 20;
          }
          
          doc.setFontSize(11);
          doc.setTextColor(0);
          doc.text(`${idx + 1}. ${r.competencyName || r.competencyId?.name}`, 20, yPos);
          yPos += 6;
          
          doc.setFontSize(8);
          doc.setFillColor(245, 245, 245);
          doc.roundedRect(25, yPos - 4, 20, 5, 1, 1, 'F');
          doc.setTextColor(100);
          doc.text(r.level, 27, yPos - 1);
          yPos += 2;
          
          doc.setFontSize(9);
          doc.setTextColor(60);
          const lines = doc.splitTextToSize(r.recommendation, 165);
          doc.text(lines, 25, yPos);
          yPos += lines.length * 5 + 10;
        });
      }

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        
        doc.line(20, 282, 190, 282);
        doc.text(`Page ${i} of ${pageCount}`, 20, 287);
        doc.text('Zemen Bank CAS', 105, 287, { align: 'center' });
        doc.text(new Date().toLocaleDateString(), 190, 287, { align: 'right' });
      }
    }

    doc.save(filename);
    return true;
  } catch (error) {
    console.error('PDF Export Error:', error);
    throw error;
  }
};

// Excel Export
export const exportToExcel = async (data, filename = 'export.xlsx') => {
  try {
    const XLSXModule = await import('xlsx');
    const XLSX = XLSXModule.default || XLSXModule;

    const wb = XLSX.utils.book_new();

    if (data.type === 'results') {
      const resultsData = data.results.map(r => ({
        'Competency': r.competencyName || r.competencyId?.name || 'N/A',
        'Score (%)': r.finalScore,
        'Level': r.level,
        'Status': r.status,
        'Date': new Date(r.createdAt).toLocaleDateString(),
        'Recommendation': r.recommendation || '',
      }));

      const ws = XLSX.utils.json_to_sheet(resultsData);
      ws['!cols'] = [
        { wch: 25 },
        { wch: 12 },
        { wch: 15 },
        { wch: 12 },
        { wch: 12 },
        { wch: 60 },
      ];

      XLSX.utils.book_append_sheet(wb, ws, 'Results');

      if (data.user) {
        const avgScore = data.results.length > 0 
          ? Math.round(data.results.reduce((acc, r) => acc + r.finalScore, 0) / data.results.length)
          : 0;

        const summaryData = [
          { Field: 'Employee Name', Value: data.user.name },
          { Field: 'Employee ID', Value: data.user.employeeId },
          { Field: 'Department', Value: data.user.department || 'N/A' },
          { Field: 'Position', Value: data.user.position || 'N/A' },
          { Field: 'Total Assessments', Value: data.results.length },
          { Field: 'Average Score', Value: `${avgScore}%` },
          { Field: 'Generated', Value: new Date().toLocaleString() },
        ];

        const wsSummary = XLSX.utils.json_to_sheet(summaryData);
        wsSummary['!cols'] = [{ wch: 25 }, { wch: 40 }];
        XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');
      }
    }

    XLSX.writeFile(wb, filename);
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
