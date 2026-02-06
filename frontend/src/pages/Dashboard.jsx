import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, ClipboardList, BarChart3, Target, ArrowRight, TrendingUp } from 'lucide-react';
import api from '../utils/api';

const COLORS = {
  Core: '#C8102E',
  Managerial: '#2563EB',
  Leadership: '#16A34A',
  Technical: '#EA580C',
};

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const nav = useNavigate();
  const [stats, setStats] = useState({ users: 0, competencies: 0, activeAssessments: 0, totalResults: 0 });
  const [compData, setCompData] = useState([]);
  const [recentAssessments, setRecentAssessments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const compRes = await api.get('/competencies');
        const categories = compRes.data.data.competencies.reduce((acc, c) => {
          if (!acc[c.category]) acc[c.category] = 0;
          acc[c.category] += c.noOfQuestions || 1;
          return acc;
        }, {});
        setCompData(Object.entries(categories).map(([name, value]) => ({ name, value })));

        if (isAdmin) {
          const [usersRes, assessRes, resultsRes] = await Promise.all([
            api.get('/users?limit=1'),
            api.get('/assessments?status=ACTIVE&limit=5'),
            api.get('/results?limit=1'),
          ]);
          setStats({
            users: usersRes.data.data.pagination.total,
            competencies: compRes.data.data.competencies.length,
            activeAssessments: assessRes.data.data.assessments.length,
            totalResults: resultsRes.data.data.pagination.total,
          });
          setRecentAssessments(assessRes.data.data.assessments);
        } else {
          const assessRes = await api.get('/assessments/active');
          setRecentAssessments(assessRes.data.data.assessments);
          setStats((prev) => ({ ...prev, activeAssessments: assessRes.data.data.assessments.length }));
        }
      } catch (_) {
        // Silent
      }
      setLoading(false);
    };
    load();
  }, [isAdmin]);

  if (loading) return <div className="flex items-center justify-center min-h-screen"><div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" /></div>;

  const KPICards = isAdmin
    ? [
        { icon: Users, label: 'Total Employees', value: stats.users, color: 'text-brand-red', bg: 'bg-brand-red/10', link: '/users' },
        { icon: Target, label: 'Competencies', value: stats.competencies, color: 'text-blue-600', bg: 'bg-blue-100', link: '/competencies' },
        { icon: ClipboardList, label: 'Active Assessments', value: stats.activeAssessments, color: 'text-green-600', bg: 'bg-green-100', link: '/assessments' },
        { icon: BarChart3, label: 'Results Generated', value: stats.totalResults, color: 'text-orange-600', bg: 'bg-orange-100', link: '/results' },
      ]
    : [
        { icon: ClipboardList, label: 'My Active Assessments', value: stats.activeAssessments, color: 'text-brand-red', bg: 'bg-brand-red/10', link: '/assessments' },
        { icon: TrendingUp, label: 'My Results', value: '—', color: 'text-blue-600', bg: 'bg-blue-100', link: '/results' },
      ];

  return (
    <div className="p-7">
      {/* Welcome */}
      <div className="mb-7">
        <h1 className="text-3xl font-display font-bold text-brand-black">Welcome, {user?.name?.split(' ')[0]}</h1>
        <p className="text-gray-500 mt-1">{user?.position || user?.role?.replace('_', ' ')} · {user?.department || ''}</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-7">
        {KPICards.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              onClick={() => nav(k.link)}
              className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer border border-gray-100"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`w-11 h-11 ${k.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300" />
              </div>
              <div className="text-3xl font-display font-bold text-brand-black">{k.value}</div>
              <div className="text-sm text-gray-500 mt-1">{k.label}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom row: chart + recent assessments */}
      <div className={`grid ${isAdmin ? 'lg:grid-cols-5' : 'lg:grid-cols-1'} gap-5`}>
        {/* Competency categories chart */}
        <div className={`bg-white rounded-xl p-6 shadow-card border border-gray-100 ${isAdmin ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Questions by Category</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={compData} barSize={36}>
              <XAxis dataKey="name" tick={{ fontSize: 12, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {compData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[entry.name] || '#C8102E'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Recent assessments table (admin only) */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 lg:col-span-3">
            <div className="border-b border-gray-100 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-display font-bold text-brand-black">Active Assessments</h3>
              <button onClick={() => nav('/assessments')} className="px-3 py-1.5 text-sm font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-colors">
                View All
              </button>
            </div>
            {recentAssessments.length === 0 ? (
              <div className="p-8 text-center text-gray-400">No active assessments</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentAssessments.map((a) => (
                      <tr key={a._id} onClick={() => nav(`/assessments/${a._id}`)} className="hover:bg-brand-red-muted cursor-pointer transition-colors">
                        <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft">{a.description || '—'}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{a.competencyId?.name || '—'}</td>
                        <td className="px-6 py-3 text-sm text-gray-600">{a.type}</td>
                        <td className="px-6 py-3">
                          <span className={`badge badge-${a.status.toLowerCase()}`}>{a.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
