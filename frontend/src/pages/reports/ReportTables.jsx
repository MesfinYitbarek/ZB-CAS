import { Eye, BookOpen } from 'lucide-react';
import { ScoreBadge, LevelBadge, Paginator, TableShell, Th, Td, EmployeeCell, formatDate } from './ui';

const DetailButton = ({ onClick }) => (
  <button onClick={onClick}
    className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-300 hover:text-brand-red hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
    title="View detail">
    <Eye className="w-3.5 h-3.5" />
  </button>
);

const EmptyRow = ({ colSpan, icon: Icon, title }) => (
  <tr>
    <td colSpan={colSpan} className="px-4 py-16 text-center">
      <Icon className="w-10 h-10 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-400 text-sm">{title}</p>
    </td>
  </tr>
);

const CountHeader = ({ total }) => (
  <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50/60">
    <p className="text-sm font-semibold text-gray-700">
      <span className="text-brand-red font-bold">{total}</span> report{total !== 1 ? 's' : ''}
    </p>
  </div>
);

export function IndividualReportsTable({ reports = [], onDetail, pagination, onPage, total }) {
  const competencyNames = (r) => (r.competencyResults || []).map(c => c.competencyName).join(', ') || '—';
  return (
    <TableShell
      header={<CountHeader total={total ?? reports.length} />}
      footer={pagination && <Paginator pagination={pagination} onPage={onPage} />}
    >
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80">
          <tr>
            <Th>Competency</Th>
            <Th>Target Group</Th>
            <Th>Purpose</Th>
            <Th>Score</Th>
            <Th>Level</Th>
            <Th>Date</Th>
            <Th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <EmptyRow colSpan={7} icon={BookOpen} title="No reports found" />
          ) : reports.map(r => {
            const names = competencyNames(r);
            return (
              <tr key={r._id} className="hover:bg-gray-50/70 transition-colors group">
                <Td>
                  <p className="text-sm font-medium text-gray-800 max-w-[180px] truncate" title={names}>{names}</p>
                </Td>
                <Td>
                  <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded capitalize font-medium">
                    {r.assessment?.targetGroup || '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium">
                    {r.assessment?.purpose || '—'}
                  </span>
                </Td>
                <Td><ScoreBadge score={r.overallScore} /></Td>
                <Td><LevelBadge level={r.overallLevel} /></Td>
                <Td className="text-xs text-gray-400 whitespace-nowrap">{formatDate(r.generatedAt)}</Td>
                <Td><DetailButton onClick={() => onDetail?.(r)} /></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}

export function AllReportsTable({ reports = [], onDetail, pagination, onPage, total }) {
  const competencyNames = (r) => (r.competencyResults || []).map(c => c.competencyName).join(', ') || '—';
  return (
    <TableShell
      header={<CountHeader total={total ?? reports.length} />}
      footer={pagination && <Paginator pagination={pagination} onPage={onPage} />}
    >
      <table className="w-full text-sm">
        <thead className="border-b border-gray-100 bg-gray-50/80">
          <tr>
            <Th>Employee</Th>
            <Th>Department</Th>
            <Th>Position</Th>
            <Th>Competency</Th>
            <Th>Target Group</Th>
            <Th>Purpose</Th>
            <Th>Score</Th>
            <Th>Level</Th>
            <Th>Date</Th>
            <Th className="w-10" />
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {reports.length === 0 ? (
            <EmptyRow colSpan={10} icon={BookOpen} title="No reports found matching the current filters." />
          ) : reports.map(r => {
            const names = competencyNames(r);
            return (
              <tr key={r._id} className="hover:bg-gray-50/70 transition-colors group">
                <Td><EmployeeCell name={r.user?.name} position={r.user?.position} /></Td>
                <Td className="text-sm text-gray-600 whitespace-nowrap">{r.user?.department || '—'}</Td>
                <Td className="text-sm text-gray-600 whitespace-nowrap">{r.user?.position || '—'}</Td>
                <Td>
                  <p className="text-sm font-medium text-gray-800 max-w-[160px] truncate" title={names}>{names}</p>
                </Td>
                <Td>
                  <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded capitalize font-medium whitespace-nowrap">
                    {r.assessment?.targetGroup || '—'}
                  </span>
                </Td>
                <Td>
                  <span className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-medium whitespace-nowrap">
                    {r.assessment?.purpose || '—'}
                  </span>
                </Td>
                <Td><ScoreBadge score={r.overallScore} /></Td>
                <Td><LevelBadge level={r.overallLevel} /></Td>
                <Td className="text-xs text-gray-400 whitespace-nowrap">{formatDate(r.generatedAt)}</Td>
                <Td><DetailButton onClick={() => onDetail?.(r)} /></Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </TableShell>
  );
}
