import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { useReports } from './ReportsContext';
import { LoadingCard } from '../../components/LoadingSpinner';
import DepartmentTab from './DepartmentTab';

export default function DepartmentPage() {
  const { filterParams, filterOptions } = useReports();
  const { show } = useToast();
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState([]);
  const [selDept, setSelDept] = useState('');
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/stats', { params: filterParams() });
      setStats(data.data);
    } catch { show('Failed to load stats.', 'error'); }
    setLoading(false);
  }, [filterParams]);

  useEffect(() => { loadStats(); }, [loadStats]);

  useEffect(() => {
    if (selDept) {
      api.get(`/reports/department/${encodeURIComponent(selDept)}`).then(({ data }) => setSummary(data.data.summary || [])).catch(() => setSummary([]));
    }
  }, [selDept]);

  return loading ? <LoadingCard /> : (
    <DepartmentTab
      stats={stats}
      departments={filterOptions.departments}
      selDept={selDept}
      onSelectDept={setSelDept}
      summary={summary}
    />
  );
}
