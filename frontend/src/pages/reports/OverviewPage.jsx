import { useEffect, useState, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { useReports } from './ReportsContext';
import { LoadingCard } from '../../components/LoadingSpinner';
import OverviewTab from './OverviewTab';

export default function OverviewPage() {
  const { isAdmin } = useAuth();
  const { filterParams } = useReports();
  const { show } = useToast();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/reports/stats', { params: filterParams() });
      setStats(data.data);
    } catch { show('Failed to load stats.', 'error'); }
    setLoading(false);
  }, [filterParams]);

  useEffect(() => { if (isAdmin) loadStats(); }, [isAdmin, loadStats]);

  const handlePerformerDetail = useCallback((performer) => {
    if (performer?.userId) window.location.href = `/users/${performer.userId}`;
    else if (performer?._id) window.location.href = `/users/${performer._id}`;
  }, []);

  if (!isAdmin) return <Navigate to="/reports/individual" replace />;

  return loading ? <LoadingCard /> : stats ? (
    <OverviewTab stats={stats} onPerformerDetail={handlePerformerDetail} />
  ) : null;
}
