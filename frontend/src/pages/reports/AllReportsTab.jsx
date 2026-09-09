import { AllReportsTable } from './ReportTables';

export default function AllReportsTab({ reports, onDetail, pagination, onPage, onChangeLimit }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <span className="text-sm text-gray-600">Show:</span>
        <select value={pagination.limit}
          onChange={e => onChangeLimit(parseInt(e.target.value, 10))}
          className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm bg-white">
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