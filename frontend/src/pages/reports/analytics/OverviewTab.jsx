import { Users, Briefcase, PieChart } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from 'recharts';
import PerformerTable from '../shared/PerformerTable';
import { LEVEL_COLORS, LEVELS, Card, ScoreBar, StatCard, ExportCsvButton } from '../shared/ui';

export default function OverviewTab({ stats, onPerformerDetail }) {
  const o = stats?.overall || {};
  const levelChartData = (stats?.levelDistribution || []).map(l => ({ name: l._id, value: l.count }));
  const top5    = (stats?.topPerformers    || []).slice(0, 5);
  const bottom5 = (stats?.bottomPerformers || []).slice(0, 5);
  const hasBreakdown = (stats?.genderBreakdown?.length > 0) || (stats?.positionBreakdown?.length > 0);

  const fmt = v => (v === null || v === undefined ? '' : parseFloat(v).toFixed(1));
  const today = new Date().toISOString().split('T')[0];
  const csvRows = [
    ...(stats?.levelDistribution || []).map(l => ['Level Distribution', l._id || 'N/A', l.count, '']),
    ...(stats?.genderBreakdown || []).map(g => ['By Gender', g._id || 'N/A', g.count, fmt(g.avgScore)]),
    ...(stats?.positionBreakdown || []).map(p => ['By Position', p._id || 'N/A', p.count, fmt(p.avgScore)]),
    ...top5.map(p => ['Top 5 Performers', p.name || '—', p.count ?? '', fmt(p.avgScore)]),
    ...bottom5.map(p => ['Needs Development Support', p.name || '—', p.count ?? '', fmt(p.avgScore)]),
  ];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <StatCard label="Total Results" value={o.total || 0} />
        <StatCard label="Employees Assessed" value={o.uniqueEmployees || 0} />
        <StatCard label="Average Score" value={`${fmt(o.avgScore)}%`} accent />
        <StatCard label="Departments" value={o.uniqueDepts || 0} />
      </div>

      {/* <div className="flex justify-end">
        <ExportCsvButton headers={['Category', 'Group', 'Reports', 'Avg Score']} rows={csvRows} filename={`overview_${today}.csv`} />
      </div> */}

      <div className="flex flex-col lg:flex-row gap-4">
        <Card title="Level Distribution" icon={PieChart} className="flex-1 min-w-0">
          {levelChartData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={levelChartData} barSize={40}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={v => [v, 'Count']} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {levelChartData.map(e => <Cell key={e.name} fill={LEVEL_COLORS[e.name] || '#888'} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex justify-center gap-3 mt-2 flex-wrap">
                {LEVELS.map(l => (
                  <div key={l} className="flex items-center gap-1.5 text-xs text-gray-600">
                    <div className="w-3 h-3 rounded-full" style={{ background: LEVEL_COLORS[l] }} />
                    {l}: {levelChartData.find(d => d.name === l)?.value || 0}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-center text-gray-400 py-8 text-sm">No data</p>
          )}
        </Card>

        {hasBreakdown && stats?.genderBreakdown?.length > 0 && (
          <Card title="By Gender" icon={Users} className="flex-1 min-w-0">
            <div className="space-y-2">
              {stats.genderBreakdown.map(g => (
                <div key={g._id} className="flex items-center gap-3">
                  <div className="w-20 text-sm text-gray-600">{g._id || 'N/A'}</div>
                  <div className="flex-1"><ScoreBar score={parseFloat((g.avgScore || 0).toFixed(1))} /></div>
                  <div className="text-xs text-gray-400 w-14 text-right">{g.count} results</div>
                </div>
              ))}
            </div>
          </Card>
        )}
        {hasBreakdown && stats?.positionBreakdown?.length > 0 && (
          <Card title="By Position" icon={Briefcase} className="flex-1 min-w-0">
            <div className="space-y-2">
              {stats.positionBreakdown.map(p => (
                <div key={p._id} className="flex items-center gap-3">
                  <div className="w-32 text-xs text-gray-600 truncate">{p._id || 'N/A'}</div>
                  <div className="flex-1"><ScoreBar score={parseFloat((p.avgScore || 0).toFixed(1))} /></div>
                  <div className="text-xs text-gray-400 w-12 text-right">{p.count}</div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <PerformerTable title="Top 5 Performers" data={top5} type="top" onDetail={onPerformerDetail} />
        <PerformerTable title="Needs Development Support" data={bottom5} type="bottom" onDetail={onPerformerDetail} />
      </div>
    </div>
  );
}