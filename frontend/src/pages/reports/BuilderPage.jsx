import { useReports } from './ReportsContext';
import CustomReportBuilder from './CustomReportBuilder';

export default function BuilderPage() {
  const { filterParams } = useReports();
  return <CustomReportBuilder filterParams={filterParams} />;
}