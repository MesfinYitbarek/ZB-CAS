import { Users, Briefcase, PieChart } from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell, CartesianGrid,
} from 'recharts';
import PerformerTable from './PerformerTable';
import { LEVEL_COLORS, LEVELS, Card, ScoreBar } from './ui';

export default function OverviewTab({ stats, onPerformerDetail }) {
  const levelChartData = (stats?.levelDistribution || []).map(l => ({ name: l._id, value: l.count }));
  const top5    = (stats?.topPerformers    || []).slice(0, 5);
  const bottom5 = (stats?.bottomPerformers || []).slice(0, 5);
  const hasBreakdown = (stats?.genderBreakdown?.length > 0) || (stats?.positionBreakdown?.length > 0);

  return (
    <div className="space-y-5">
      <Card
        title="Level Distribution"
        icon={PieChart}
      >
        {levelChartData.length > 0 ? (
          <>
            <ResponsiveContainer width="100%" height={220}>
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

      <div className="grid lg:grid-cols-2 gap-5">
        <PerformerTable title="Top 5 Performers" data={top5} type="top" onDetail={onPerformerDetail} />
        <PerformerTable title="Needs Development Support" data={bottom5} type="bottom" onDetail={onPerformerDetail} />
      </div>

      {hasBreakdown && (
        <div className="grid lg:grid-cols-2 gap-5">
          {stats?.genderBreakdown?.length > 0 && (
            <Card title="By Gender" icon={Users}>
              <div className="space-y-3">
                {stats.genderBreakdown.map(g => (
                  <div key={g._id} className="flex items-center gap-3">
                    <div className="w-20 text-sm text-gray-600">{g._id || 'N/A'}</div>
                    <div className="flex-1"><ScoreBar score={parseFloat((g.avgScore || 0).toFixed(1))} /></div>
                    <div className="text-xs text-gray-400 w-14 text-right">{g.count} reports</div>
                  </div>
                ))}
              </div>
            </Card>
          )}
          {stats?.positionBreakdown?.length > 0 && (
            <Card title="By Position" icon={Briefcase}>
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
      )}
    </div>
  );
}