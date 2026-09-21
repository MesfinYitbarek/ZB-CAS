import { useState } from 'react';
import { useToast } from '../../../context/ToastContext';
import { useReports } from '../ReportsContext';
import { LoadingCard } from '../../../components/LoadingSpinner';
import DepartmentTab from './DepartmentTab';
import { useReportStats, useReportDepartment } from '../../../hooks/queries';

export default function DepartmentPage() {
  const { filterParams, filterOptions } = useReports();
  const { show } = useToast();
  const [selDept, setSelDept] = useState('');
  const { data: stats, isLoading } = useReportStats(filterParams(), {
    onError: () => show('Failed to load stats.', 'error'),
  });
  const { data: deptData } = useReportDepartment(selDept, filterParams());

  const summary = deptData?.summary || [];

  return isLoading ? <LoadingCard /> : (
    <DepartmentTab
      stats={stats}
      departments={filterOptions.departments}
      selDept={selDept}
      onSelectDept={setSelDept}
      summary={summary}
    />
  );
}
