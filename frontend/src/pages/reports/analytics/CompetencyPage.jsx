import { useToast } from '../../../context/ToastContext';
import { useReports } from '../ReportsContext';
import { LoadingCard } from '../../../components/LoadingSpinner';
import CompetencyTab from './CompetencyTab';
import { useReportStats, useReportHeatmap } from '../../../hooks/queries';

export default function CompetencyPage() {
  const { filterParams } = useReports();
  const { show } = useToast();
  const { data: stats, isLoading } = useReportStats(filterParams(), {
    onError: () => show('Failed to load competency data.', 'error'),
  });
  const { data: heatmapData, isLoading: heatmapLoading } = useReportHeatmap(filterParams(), {
    onError: () => show('Failed to load competency data.', 'error'),
  });

  const heatmap = heatmapData?.heatmap || {};

  return isLoading || heatmapLoading ? <LoadingCard /> : (
    <CompetencyTab stats={stats} heatmap={heatmap} />
  );
}
