import { BarChart3, Layers } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Card, StatCard, ExportCsvButton, EmptyState } from '../shared/ui';

const getHeatColor = s => {
  if (!s) return 'bg-gray-100 text-gray-400';
  if (s >= 80) return 'bg-[#C8102E] text-white';
  if (s >= 65) return 'bg-[#111827] text-white';
  if (s >= 50) return 'bg-[#4B5563] text-white';
  if (s >= 35) return 'bg-[#9CA3AF] text-white';
  return 'bg-[#E5E7EB] text-gray-700';
};

const Heatmap = ({ heatmap }) => {
  const competencies = Object.keys(heatmap).filter(c => (heatmap[c] || []).length > 0);
  const depts = [...new Set(competencies.flatMap(c => (heatmap[c] || []).map(d => d.department)))];
  const lookup = {};
  competencies.forEach(comp => {
    if (!lookup[comp]) lookup[comp] = {};
    heatmap[comp]?.forEach(d => { lookup[comp][d.department] = d.avgScore; });
  });
  const hasData = competencies.length > 0 && depts.length > 0;

  return (
    <Card title="Competency × Department Heatmap" icon={Layers} subtitle="Average score per competency per department">
      {hasData ? (
        <>
          <div className="overflow-x-auto scrollbar-none">
            <table className="text-xs min-w-max">
              <thead>
                <tr>
                  <th className="text-left px-1.5 py-1.5 text-gray-500 font-medium min-w-40">Competency</th>
                  {depts.map(d => <th key={d} className="text-center px-1.5 py-1.5 text-gray-500 font-medium min-w-20">{d.length > 12 ? d.substring(0, 12) + '…' : d}</th>)}
                </tr>
              </thead>
              <tbody>
                {competencies.map(comp => (
                  <tr key={comp} className="border-t border-gray-100">
                    <td className="px-1.5 py-1 font-medium text-gray-800">{comp.length > 30 ? comp.substring(0, 30) + '…' : comp}</td>
                    {depts.map(dept => {
                      const score = lookup[comp]?.[dept];
                      return (
                        <td key={dept} className="px-1 py-0.5 text-center">
                          {score !== undefined
                            ? <div className={`inline-flex items-center justify-center w-12 h-6 rounded text-[11px] font-bold ${getHeatColor(score)}`}>{score.toFixed(0)}%</div>
                            : <div className="w-12 h-6 rounded bg-gray-50 inline-block" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center gap-3 mt-3 flex-wrap">
            <span className="text-xs text-gray-400">Legend:</span>
            {[['≥80%', 'bg-[#C8102E]'], ['≥65%', 'bg-[#111827]'], ['≥50%', 'bg-[#4B5563]'], ['≥35%', 'bg-[#9CA3AF]'], ['<35%', 'bg-[#E5E7EB]']].map(([lbl, cls]) => (
              <div key={lbl} className="flex items-center gap-1 text-xs text-gray-600"><div className={`w-3 h-3 rounded ${cls}`} />{lbl}</div>
            ))}
          </div>
        </>
      ) : (
        <EmptyState title="No heatmap data" hint="The heatmap appears once completed assessments have results." />
      )}
    </Card>
  );
};

export default function CompetencyTab({ stats, heatmap }) {
  const o = stats?.overall || {};
  const compBreakdown = stats?.competencyBreakdown || [];
  const topComp = compBreakdown[0];
  const data = compBreakdown.slice(0, 10).map(c => ({
    name: (c._id || '?').length > 22 ? c._id.substring(0, 22) + '…' : (c._id || '?'),
    score: parseFloat((c.avgScore || 0).toFixed(1)),
  }));

  const fmt = v => (v === null || v === undefined ? '' : parseFloat(v).toFixed(1));
  const today = new Date().toISOString().split('T')[0];
  const csvRows = [
    ...(compBreakdown || []).map(c => ['Competency Average', c._id || 'N/A', '', fmt(c.avgScore)]),
    ...Object.entries(heatmap || {}).flatMap(([comp, arr]) => (arr || []).map(d => ['Heatmap', comp, d.department || 'N/A', fmt(d.avgScore)])),
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Competencies" value={compBreakdown.length || 0} />
        <StatCard label="Total Results" value={o.total || 0} />
        <StatCard label="Average Score" value={`${fmt(o.avgScore)}%`} accent />
        <StatCard label="Top Competency" value={topComp?._id || '—'} sub={topComp ? `${fmt(topComp.avgScore)}% avg` : ''} />
      </div>

      {/* <div className="flex justify-end">
        <ExportCsvButton headers={['Category', 'Competency', 'Department', 'Avg Score']} rows={csvRows} filename={`competency_${today}.csv`} />
      </div> */}

      {stats && data.length > 0 && (
        <Card title="Competency Average Scores" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} layout="vertical" barSize={18}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
              <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={145} />
              <Tooltip formatter={v => [`${v}%`, 'Avg Score']} />
              <Bar dataKey="score" fill="#C8102E" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      <Heatmap heatmap={heatmap} />
    </div>
  );
}