import { AllReportsTable } from './ReportTables';

export default function AllReportsTab({ reports, onDetail, pagination, onPage, onChangeLimit }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <select value={pagination.limit}
          onChange={e => onChangeLimit(parseInt(e.target.value, 10))}
          className="h-8 px-2 rounded-lg border border-gray-200 text-sm focus:ring-2 focus:ring-brand-red bg-white">
          {[20, 50, 100].map(n => <option key={n} value={n}>{n} per page</option>)}
        </select>
      </div>
      <AllReportsTable
        reports={reports}
        onDetail={onDetail}
        pagination={pagination}
        onPage={onPage}
        total={pagination.total}
      />
    </div>
  );
}