import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { useReports } from './ReportsContext';
import { LoadingCard } from '../../components/LoadingSpinner';
import IndividualTab from './IndividualTab';
import ReportDetailModal from './ReportDetailModal';

export default function IndividualPage() {
  const { user, isAdmin } = useAuth();
  const { filterParams, setExportTarget } = useReports();
  const { show } = useToast();

  const [employees, setEmployees] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [reports, setReports] = useState([]);
  const [detailReport, setDetailReport] = useState(null);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const targetId = selectedEmployee?._id || user._id;
      const { data } = await api.get(`/reports/individual/${targetId}`, {
        params: { page, limit: pagination.limit, ...filterParams() },
      });
      setReports(data.data.reports || []);
      if (data.data.pagination) {
        const pg = data.data.pagination;
        setPagination(pv => ({ ...pv, page, total: pg.total, totalPages: Math.ceil(pg.total / pv.limit) }));
      }
    } catch { show('Failed to load reports.', 'error'); }
    setLoading(false);
  }, [selectedEmployee, user._id, filterParams, pagination.limit]);

  useEffect(() => { load(1); }, [load]);

  useEffect(() => {
    if (isAdmin) {
      api.get('/reports/employees').then(({ data }) => setEmployees(data.data.employees)).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => { setExportTarget(selectedEmployee); }, [selectedEmployee, setExportTarget]);

  return (
    <>
      {detailReport && <ReportDetailModal report={detailReport} onClose={() => setDetailReport(null)} />}
      {loading ? <LoadingCard /> : (
        <IndividualTab
          isAdmin={isAdmin}
          user={user}
          employees={employees}
          selectedEmployee={selectedEmployee}
          onSelectEmployee={setSelectedEmployee}
          reports={reports}
          onDetail={setDetailReport}
          pagination={pagination}
          onPage={load}
        />
      )}
    </>
  );
}