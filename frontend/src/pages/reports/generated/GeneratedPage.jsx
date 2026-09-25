import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileSpreadsheet, Plus, Eye, Download, Trash2, Loader2 } from 'lucide-react';
import api from '../../../utils/api';
import { useToast } from '../../../context/ToastContext';
import { LoadingCard } from '../../../components/LoadingSpinner';
import { formatDate } from '../shared/ui';
import NewReportModal from './NewReportModal';
import GeneratedDetailModal from './GeneratedDetailModal';
import { useGeneratedReports, queryKeys } from '../../../hooks/queries';

export const TYPE_LABEL = { INDIVIDUAL: 'Individual', ORGANIZATION: 'Organization', CUSTOM_PIVOT: 'Custom Pivot' };

const STATUS_META = {
  PENDING:    { label: 'Pending',    cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  PROCESSING: { label: 'Processing', cls: 'border-blue-200 bg-blue-50 text-blue-700' },
  READY:      { label: 'Ready',      cls: 'border-green-200 bg-green-50 text-green-700' },
  FAILED:     { label: 'Failed',     cls: 'border-red-200 bg-red-50 text-red-700' },
};
const ACTIVE_JOB_STATUSES = new Set(['PENDING', 'PROCESSING']);

export default function GeneratedPage() {
  const { show } = useToast();
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [detail, setDetail] = useState(null);
  const [downloading, setDownloading] = useState(null);
  const [deleting, setDeleting] = useState(null);

  const { data, isLoading, refetch } = useGeneratedReports();
  const reports = data?.reports || [];

  // P3: while any report is still queued/generating, poll until it settles.
  useEffect(() => {
    if (!reports.some(r => ACTIVE_JOB_STATUSES.has(r.status))) return;
    const t = setTimeout(() => refetch(), 3000);
    return () => clearTimeout(t);
  }, [reports, refetch]);

  const download = async (r) => {
    setDownloading(r._id);
    try {
      const res = await api.get(`/reports/generated/${r._id}/download`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = r.fileName || `${r.title}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      show('Downloaded Excel file.', 'success');
    } catch { show('Download failed.', 'error'); }
    setDownloading(null);
  };

  const removeMutation = useMutation({
    mutationFn: (r) => api.delete(`/reports/generated/${r._id}`),
    onSuccess: (_, r) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.reports.generated.all });
      if (detail?._id === r._id) setDetail(null);
      show('Report deleted.', 'success');
    },
    onError: () => show('Delete failed.', 'error'),
  });

  const remove = (r) => {
    if (!window.confirm(`Delete "${r.title}"? The stored Excel file will be removed as well.`)) return;
    setDeleting(r._id);
    removeMutation.mutate(r, { onSettled: () => setDeleting(null) });
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button type="button" onClick={() => setShowNew(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-red text-white rounded-lg text-[13px] font-semibold hover:bg-brand-red-dark transition-colors">
          <Plus className="w-4 h-4" />New Report
        </button>
      </div>

      {isLoading ? <LoadingCard /> : reports.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card p-10 text-center">
          <FileSpreadsheet className="w-10 h-10 text-gray-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-gray-600 mb-1">No generated reports yet</p>
          <p className="text-xs text-gray-400 mb-4">Generate a named Excel report with its filters saved alongside it.</p>
          <button type="button" onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-brand-red text-white rounded-lg text-[13px] font-semibold hover:bg-brand-red-dark transition-colors">
            <Plus className="w-4 h-4" />Generate your first report
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-card overflow-hidden">
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Report</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Type</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Rows</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">By</th>
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Date</th>
                  <th className="text-right px-4 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {reports.map(r => {
                  const ready = r.status === 'READY';
                  return (
                  <tr key={r._id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-2.5 min-w-0">
                      <button type="button" onClick={() => setDetail(r)} className="text-left min-w-0 max-w-full">
                        <p className="font-semibold text-gray-800 text-[13px] truncate hover:text-brand-red">{r.title}</p>
                      </button>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-gray-50 text-gray-600 border-gray-200">
                        {TYPE_LABEL[r.type] || r.type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_META[r.status]?.cls || STATUS_META.READY.cls}`}>
                        {ACTIVE_JOB_STATUSES.has(r.status) ? (
                          <span className="inline-flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />{STATUS_META[r.status]?.label || r.status}
                          </span>
                        ) : (STATUS_META[r.status]?.label || r.status)}
                      </span>
                      {r.status === 'FAILED' && r.error && (
                        <p className="text-[10px] text-red-400 max-w-[180px] truncate mt-0.5" title={r.error}>{r.error}</p>
                      )}
                      {r.truncated && (
                        <p className="text-[10px] font-semibold text-amber-600 mt-0.5" title="Dataset capped at 20,000 rows">Truncated</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-gray-600 tabular-nums">{r.status === 'READY' ? r.rowCount : '—'}</td>
                    <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap text-[13px]">{r.generatorName || '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{formatDate(r.createdAt)}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        <button type="button" onClick={() => setDetail(r)} title="View details"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors">
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <button type="button" onClick={() => download(r)} disabled={!ready || downloading === r._id} title={ready ? 'Download Excel' : 'Report not generated yet'}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors disabled:opacity-50 disabled:hover:bg-transparent">
                          {downloading === r._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        </button>
                        <button type="button" onClick={() => remove(r)} disabled={deleting === r._id} title="Delete"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-brand-red hover:bg-red-50 transition-colors disabled:opacity-50">
                          {deleting === r._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showNew && (
        <NewReportModal
          onClose={() => setShowNew(false)}
        />
      )}
      {detail && (
        <GeneratedDetailModal
          report={detail}
          onClose={() => setDetail(null)}
          onDownload={() => download(detail)}
          downloading={downloading === detail._id}
        />
      )}
    </div>
  );
}
