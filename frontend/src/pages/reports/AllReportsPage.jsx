import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { useReports } from './ReportsContext';
import { LoadingCard } from '../../components/LoadingSpinner';
import AllReportsTab from './AllReportsTab';
import ReportDetailModal from './ReportDetailModal';

export default function AllReportsPage() {
  const { filterParams } = useReports();
  const { show } = useToast();

  const [reports, setReports] = useState([]);
  const [detailReport, setDetailReport] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports', { params: { page, limit: pagination.limit, ...filterParams() } });
      setReports(data.data.reports || []);
      const pg = data.data.pagination;
      setPagination(pv => ({ ...pv, page, total: pg.total, totalPages: Math.ceil(pg.total / pv.limit) }));
    } catch { show('Failed to load reports.', 'error'); }
    setLoading(false);
  }, [filterParams, pagination.limit]);

  useEffect(() => { load(1); }, [load]);

  const onChangeLimit = useCallback(n => {
    setPagination(pv => ({ ...pv, limit: n, page: 1 }));
  }, []);

  return (
    <>
      {detailReport && <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} />}
      {loading ? <LoadingCard /> : (
        <AllReportsTab
          reports={reports}
          onDetail={setDetailReport}
          pagination={pagination}
          onPage={p => load(p)}
          onChangeLimit={onChangeLimit}
        />
      )}
    </>
  );
}