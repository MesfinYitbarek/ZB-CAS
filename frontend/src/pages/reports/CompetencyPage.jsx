import { useEffect, useState, useCallback } from 'react';
import { useToast } from '../../context/ToastContext';
import api from '../../utils/api';
import { useReports } from './ReportsContext';
import { LoadingCard } from '../../components/LoadingSpinner';
import CompetencyTab from './CompetencyTab';

export default function CompetencyPage() {
  const { filterParams } = useReports();
  const { show } = useToast();
  const [stats, setStats] = useState(null);
  const [heatmap, setHeatmap] = useState({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, h] = await Promise.all([
        api.get('/reports/stats', { params: filterParams() }),
        api.get('/reports/heatmap'),
      ]);
      setStats(s.data.data);
      setHeatmap(h.data.data.heatmap || {});
    } catch { show('Failed to load competency data.', 'error'); }
    setLoading(false);
  }, [filterParams]);

  useEffect(() => { load(); }, [load]);

  return loading ? <LoadingCard /> : (
    <CompetencyTab stats={stats} heatmap={heatmap} />
  );
}
