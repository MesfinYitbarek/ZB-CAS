import EmployeePicker from './EmployeePicker';
import { IndividualReportsTable } from './ReportTables';

export default function IndividualTab({
  isAdmin, user, employees, selectedEmployee, onSelectEmployee,
  reports, onDetail, pagination, onPage,
}) {
  return (
    <div className="space-y-5">
      {isAdmin && (
        <EmployeePicker
          user={user}
          employees={employees}
          value={selectedEmployee}
          onChange={onSelectEmployee}
        />
      )}
      <IndividualReportsTable
        reports={reports}
        onDetail={onDetail}
        pagination={pagination}
        onPage={onPage}
        total={pagination.total}
      />
    </div>
  );
}