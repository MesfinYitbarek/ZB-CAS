import { useState } from 'react';
import { X, Download, Loader2, FileSpreadsheet, Eye, EyeOff } from 'lucide-react';
import { formatDate } from '../shared/ui';
import { TYPE_LABEL } from './GeneratedPage';
import { useGeneratedReportPreview } from '../../../hooks/queries';

const FILTER_LABELS = {
  department: 'Department', position: 'Position', gender: 'Gender',
  assessmentId: 'Assessment', assessmentType: 'Type', purpose: 'Purpose',
  targetGroup: 'Target Group', competencyId: 'Competency',
  competencyCategory: 'Category', overallLevel: 'Level',
  scoreMin: 'Score ≥', scoreMax: 'Score ≤', dateFrom: 'From', dateTo: 'To',
  employeeId: 'Employee',
};

const STATUS_LABEL = { PENDING: 'Pending', PROCESSING: 'Processing', READY: 'Ready', FAILED: 'Failed' };

const PivotConfigSummary = ({ pivot }) => {
  const rows = pivot.rowFields || (pivot.rowField ? [pivot.rowField] : []);
  const vals = pivot.values || [{ valueField: pivot.valueField || 'score', aggregation: pivot.aggregation || 'avg' }];
  return (
    <div className="text-[13px] text-gray-700 space-y-1">
      <p><span className="text-gray-400">Rows:</span> {rows.join(' → ') || '—'}</p>
      {pivot.colField && <p><span className="text-gray-400">Columns:</span> {pivot.colField}</p>}
      <p><span className="text-gray-400">Metrics:</span> {vals.map((v) => `${v.aggregation} of ${v.valueField}`).join(' · ')}</p>
      {(pivot.dateTrunc && pivot.dateTrunc !== 'month') || pivot.orderRows !== 'label' || pivot.topRows ? (
        <p className="text-[11px] text-gray-400">
          {[pivot.dateTrunc && pivot.dateTrunc !== 'month' ? `by ${pivot.dateTrunc}` : '',
            pivot.orderRows && pivot.orderRows !== 'label' ? `ordered ${pivot.orderRows}` : '',
            pivot.topRows ? `top ${pivot.topRows}` : ''].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </div>
  );
};

export default function GeneratedDetailModal({ report, onClose, onDownload, downloading }) {
  const filters = Object.entries(report.filters || {})
    .filter(([, v]) => v !== '' && v !== null && v !== undefined);
  const pivot = report.pivot || null;
  const ready = report.status === 'READY';

  const [showPreview, setShowPreview] = useState(false);
  const { data: preview, isFetching: previewLoading, isError } = useGeneratedReportPreview(report._id, {
    enabled: showPreview,
  });
  const previewError = isError ? 'Could not load preview.' : '';

  const togglePreview = () => setShowPreview(v => !v);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className={`bg-white rounded-xl shadow-2xl w-full max-h-[90vh] overflow-y-auto scrollbar-none ${showPreview ? 'max-w-5xl' : 'max-w-lg'}`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0">
              <FileSpreadsheet className="w-4 h-4 text-brand-red" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-gray-900 truncate">{report.title}</h3>
              <p className="text-[11px] text-gray-400">
                {TYPE_LABEL[report.type] || report.type} · {STATUS_LABEL[report.status] || report.status}
                {ready ? ` · ${report.rowCount} rows` : ''} · by {report.generatorName || '—'} · {formatDate(report.createdAt)}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {report.description && (
            <p className="text-[13px] text-gray-600 bg-gray-50 rounded-lg px-3 py-2">{report.description}</p>
          )}

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Filters frozen at generation</p>
            {filters.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {filters.map(([k, v]) => (
                  <span key={k} className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">
                    {FILTER_LABELS[k] || k}: <span className="font-semibold">{String(v)}</span>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No filters — whole scope.</p>
            )}
          </div>

          {pivot && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Pivot configuration</p>
              <PivotConfigSummary pivot={pivot} />
              {pivot._notices?.length > 0 && (
                <div className="mt-2 space-y-1">
                  {pivot._notices.map((n, i) => (
                    <p key={i} className="text-[11px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                      {n.message || n}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
          {report.truncated && (
            <p className="text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
              Dataset capped at 20,000 rows — narrow the filters for exact figures.
            </p>
          )}

          <div className="flex items-center justify-between text-[11px] text-gray-400 border-t border-gray-100 pt-3">
            <span className="truncate">{ready ? `File: ${report.fileName}` : (report.status === 'FAILED' ? `Failed: ${report.error || 'generation error'}` : 'Queued — file will appear once generation finishes.')}</span>
          </div>

          {showPreview && previewError && (
            <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{previewError}</p>
          )}

          {showPreview && preview && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Preview — {preview.sheetName}</p>
                <p className="text-[11px] text-gray-400">
                  {preview.totalRows} row{preview.totalRows === 1 ? '' : 's'}{preview.truncated ? ` · showing first ${preview.rows.length}` : ''}
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-auto max-h-80 scrollbar-none">
                <table>
                  <thead className="sticky top-0 z-10">
                    <tr>
                      {preview.columns.map((c, i) => (
                        <th key={i} className="px-2 py-1.5 text-left text-[11px] font-bold text-white bg-gray-800 whitespace-nowrap">
                          {c || ''}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.rows.map((r, i) => (
                      <tr key={i} className={i % 2 ? 'bg-gray-50' : 'bg-white'}>
                        {r.map((v, j) => (
                          <td key={j} className="px-2 py-1 text-[11px] text-gray-700 whitespace-nowrap">{v}</td>
                        ))}
                      </tr>
                    ))}
                    {preview.rows.length === 0 && (
                      <tr>
                        <td colSpan={preview.columns.length || 1} className="px-2 py-3 text-xs text-gray-400">No data rows to display.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-gray-100 sticky bottom-0 bg-white">
          <button type="button" onClick={onClose}
            className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50">
            Close
          </button>
          <button type="button" onClick={togglePreview} disabled={!ready}
            className="flex items-center gap-1.5 px-4 py-2 border border-gray-300 bg-white rounded-lg text-[13px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors">
            {previewLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : (showPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />)}
            {previewLoading ? 'Loading…' : showPreview ? 'Hide preview' : 'Preview data'}
          </button>
          <button type="button" onClick={onDownload} disabled={downloading || !ready}
            className="flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white rounded-lg text-[13px] font-semibold hover:bg-brand-red-dark disabled:opacity-50 transition-colors">
            {downloading ? <><Loader2 className="w-4 h-4 animate-spin" />Downloading…</> : <><Download className="w-4 h-4" />Download Excel</>}
          </button>
        </div>
      </div>
    </div>
  );
}
