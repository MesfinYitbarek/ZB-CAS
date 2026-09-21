import { useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../../context/AuthContext';
import { useToast } from '../../../context/ToastContext';
import { useReports } from '../ReportsContext';
import { LoadingCard } from '../../../components/LoadingSpinner';
import OverviewTab from './OverviewTab';
import { useReportStats } from '../../../hooks/queries';

export default function OverviewPage() {
  const { isAdmin } = useAuth();
  const { filterParams } = useReports();
  const { show } = useToast();
  const { data: stats, isLoading } = useReportStats(filterParams(), {
    enabled: isAdmin,
    onError: () => show('Failed to load stats.', 'error'),
  });

  const handlePerformerDetail = useCallback((performer) => {
    if (performer?.userId) window.location.href = `/users/${performer.userId}`;
    else if (performer?._id) window.location.href = `/users/${performer._id}`;
  }, []);

  if (!isAdmin) return <Navigate to="/reports/individual" replace />;

  return isLoading ? <LoadingCard /> : (
    <OverviewTab stats={stats} onPerformerDetail={handlePerformerDetail} />
  );
}
