import { BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { LEVEL_COLORS, LEVELS, Card, ScoreBar } from './ui';

const LevelChips = ({ distribution }) => (
  <div className="flex items-center gap-1 flex-wrap">
    {LEVELS.map(l => distribution[l] > 0 && (
      <span key={l} title={`${l}: ${distribution[l]}`}
        className="text-xs px-1.5 py-0.5 rounded font-medium"
        style={{ background: `${LEVEL_COLORS[l]}20`, color: LEVEL_COLORS[l] }}>
        {l.charAt(0)}:{distribution[l]}
      </span>
    ))}
  </div>
);

export default function DepartmentTab({ stats, departments, selDept, onSelectDept, summary }) {
  const data = (stats?.departmentBreakdown || []).slice(0, 8).map(d => ({
    dept: (d._id || '?').length > 14 ? d._id.substring(0, 14) + '…' : (d._id || '?'),
    fullDept: d._id || '?', avgScore: parseFloat((d.avgScore || 0).toFixed(1)), count: d.count,
  }));

  return (
    <div className="space-y-5">
      {stats && data.length > 0 && (
        <Card title="Department Performance" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={data} barSize={30}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dept" tick={{ fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n, p) => [`${v}%`, `Avg Score (${p.payload.count} reports)`]} labelFormatter={(l, payload) => payload?.[0]?.payload.fullDept || l} />
              <Bar dataKey="avgScore" fill="#C8102E" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}

      <Card
        title="Department Deep-Dive"
        action={
          <select value={selDept} onChange={e => onSelectDept(e.target.value)}
            className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm bg-white">
            <option value="">— Select Department —</option>
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        }
      >
        {selDept && Array.isArray(summary) && summary.length > 0 ? (
          <div className="overflow-x-auto scrollbar-none">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Competency</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Reports</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Avg Score</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase w-48">Distribution</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {summary.map(row => (
                  <tr key={row.competencyName} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900">{row.competencyName}</td>
                    <td className="px-4 py-3 text-gray-600">{row.totalReports}</td>
                    <td className="px-4 py-3"><ScoreBar score={row.avgScore} /></td>
                    <td className="px-4 py-3"><LevelChips distribution={row.levelDistribution} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-center text-gray-400 py-8 text-sm">
            {selDept ? 'No data for this department.' : 'Select a department to see detailed breakdown.'}
          </p>
        )}
      </Card>
    </div>
  );
}