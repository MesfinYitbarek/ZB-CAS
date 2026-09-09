import { BarChart3, Layers } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';
import { Card } from './ui';

const getHeatColor = s => {
  if (!s) return 'bg-gray-100 text-gray-400';
  if (s >= 80) return 'bg-emerald-500 text-white';
  if (s >= 65) return 'bg-blue-500 text-white';
  if (s >= 50) return 'bg-amber-400 text-white';
  if (s >= 35) return 'bg-orange-500 text-white';
  return 'bg-red-500 text-white';
};

const Heatmap = ({ heatmap }) => {
  const competencies = Object.keys(heatmap);
  const depts = [...new Set(Object.values(heatmap).flatMap(arr => arr.map(d => d.department)))];
  const lookup = {};
  competencies.forEach(comp => {
    if (!lookup[comp]) lookup[comp] = {};
    heatmap[comp]?.forEach(d => { lookup[comp][d.department] = d.avgScore; });
  });

  if (competencies.length === 0 || depts.length === 0) return null;

  return (
    <Card title="Competency × Department Heatmap" icon={Layers} subtitle="Average score per competency per department">
      <div className="overflow-x-auto">
        <table className="text-xs min-w-max">
          <thead>
            <tr>
              <th className="text-left px-2 py-2 text-gray-500 font-medium min-w-40">Competency</th>
              {depts.map(d => <th key={d} className="text-center px-2 py-2 text-gray-500 font-medium min-w-20">{d.length > 12 ? d.substring(0, 12) + '…' : d}</th>)}
            </tr>
          </thead>
          <tbody>
            {competencies.map(comp => (
              <tr key={comp} className="border-t border-gray-50">
                <td className="px-2 py-1.5 font-medium text-gray-800">{comp.length > 30 ? comp.substring(0, 30) + '…' : comp}</td>
                {depts.map(dept => {
                  const score = lookup[comp]?.[dept];
                  return (
                    <td key={dept} className="px-1 py-1 text-center">
                      {score !== undefined
                        ? <div className={`inline-flex items-center justify-center w-14 h-7 rounded text-xs font-bold ${getHeatColor(score)}`}>{score.toFixed(0)}%</div>
                        : <div className="w-14 h-7 rounded bg-gray-50 inline-block" />}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <span className="text-xs text-gray-400">Legend:</span>
        {[['≥80%', 'bg-emerald-500'], ['≥65%', 'bg-blue-500'], ['≥50%', 'bg-amber-400'], ['≥35%', 'bg-orange-500'], ['<35%', 'bg-red-500']].map(([lbl, cls]) => (
          <div key={lbl} className="flex items-center gap-1 text-xs text-gray-600"><div className={`w-3 h-3 rounded ${cls}`} />{lbl}</div>
        ))}
      </div>
    </Card>
  );
};

export default function CompetencyTab({ stats, heatmap }) {
  const data = (stats?.competencyBreakdown || []).slice(0, 10).map(c => ({
    name: (c._id || '?').length > 22 ? c._id.substring(0, 22) + '…' : (c._id || '?'),
    score: parseFloat((c.avgScore || 0).toFixed(1)),
  }));

  return (
    <div className="space-y-5">
      {stats && data.length > 0 && (
        <Card title="Competency Average Scores" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={280}>
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