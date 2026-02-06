import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend } from 'recharts';
import { Users, ClipboardList, BarChart3, Target, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import api from '../utils/api';

const COLORS = ['#C8102E', '#2563EB', '#16A34A', '#EA580C'];

export default function AdminDashboard() {
  const nav = useNavigate();
  const [stats, setStats] = useState({
    totalUsers: 0,
    activeUsers: 0,
    totalCompetencies: 0,
    activeAssessments: 0,
    completedAssessments: 0,
    pendingResults: 0,
    totalResults: 0,
  });
  const [compData, setCompData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [usersRes, compRes, assessRes, resultsRes] = await Promise.all([
          api.get('/users?limit=1'),
          api.get('/competencies'),
          api.get('/assessments'),
          api.get('/results?limit=1'),
        ]);

        const users = usersRes.data.data.users || [];
        const assessments = assessRes.data.data.assessments || [];

        setStats({
          totalUsers: usersRes.data.data.pagination?.total || 0,
          activeUsers: users.filter((u) => u.status === 'ACTIVE').length,
          totalCompetencies: compRes.data.data.competencies.length,
          activeAssessments: assessments.filter((a) => a.status === 'ACTIVE').length,
          completedAssessments: assessments.filter((a) => a.status === 'COMPLETED').length,
          pendingResults: resultsRes.data.data.results?.filter((r) => r.status === 'PENDING').length || 0,
          totalResults: resultsRes.data.data.pagination?.total || 0,
        });

        // Competency distribution
        const categories = compRes.data.data.competencies.reduce((acc, c) => {
          if (!acc[c.category]) acc[c.category] = 0;
          acc[c.category] += c.noOfQuestions || 1;
          return acc;
        }, {});
        setCompData(Object.entries(categories).map(([name, value]) => ({ name, value })));

        // Assessment status distribution
        const statusDist = assessments.reduce((acc, a) => {
          if (!acc[a.status]) acc[a.status] = 0;
          acc[a.status]++;
          return acc;
        }, {});
        setStatusData(Object.entries(statusDist).map(([name, value]) => ({ name, value })));

        // Mock trend data (in production, this would come from backend)
        setTrendData([
          { month: 'Jan', assessments: 12, results: 10 },
          { month: 'Feb', assessments: 19, results: 15 },
          { month: 'Mar', assessments: 15, results: 14 },
          { month: 'Apr', assessments: 22, results: 18 },
          { month: 'May', assessments: 28, results: 25 },
          { month: 'Jun', assessments: 24, results: 22 },
        ]);

        // Recent activity
        setRecentActivity([
          { type: 'assessment', desc: 'New assessment created', time: '5 min ago', user: 'HR Admin' },
          { type: 'result', desc: 'Results finalized for 5 employees', time: '1 hour ago', user: 'HR Admin' },
          { type: 'user', desc: 'New employee onboarded', time: '2 hours ago', user: 'System' },
          { type: 'feedback', desc: 'New feedback received', time: '3 hours ago', user: 'John Doe' },
        ]);
      } catch (_) {
        // Silent
      }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const KPICards = [
    { icon: Users, label: 'Total Employees', value: stats.totalUsers, subValue: `${stats.activeUsers} active`, color: 'text-blue-600', bg: 'bg-blue-100', link: '/users' },
    { icon: Target, label: 'Competencies', value: stats.totalCompetencies, subValue: 'across 4 categories', color: 'text-brand-red', bg: 'bg-brand-red/10', link: '/competencies' },
    { icon: ClipboardList, label: 'Active Assessments', value: stats.activeAssessments, subValue: `${stats.completedAssessments} completed`, color: 'text-green-600', bg: 'bg-green-100', link: '/assessments' },
    { icon: BarChart3, label: 'Total Results', value: stats.totalResults, subValue: `${stats.pendingResults} pending review`, color: 'text-orange-600', bg: 'bg-orange-100', link: '/results' },
  ];

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-display font-bold text-brand-black">Admin Dashboard</h1>
        <p className="text-gray-500 mt-1">Comprehensive overview of the assessment system</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {KPICards.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              onClick={() => nav(k.link)}
              className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-12 h-12 ${k.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-6 h-6 ${k.color}`} />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
              </div>
              <div className="text-3xl font-display font-bold text-brand-black mb-1">{k.value}</div>
              <div className="text-sm font-semibold text-gray-700 mb-1">{k.label}</div>
              <div className="text-xs text-gray-500">{k.subValue}</div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Competency Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Competency Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={compData}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {compData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Assessment Status */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Assessment Status</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={statusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={5}
                dataKey="value"
                label={(entry) => entry.name}
              >
                {statusData.map((entry, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Trend */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">6-Month Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={trendData}>
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis hide />
              <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend />
              <Line type="monotone" dataKey="assessments" stroke="#C8102E" strokeWidth={2} dot={{ r: 4 }} />
              <Line type="monotone" dataKey="results" stroke="#2563EB" strokeWidth={2} dot={{ r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Recent Activity</h3>
          <div className="space-y-3">
            {recentActivity.map((act, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="w-8 h-8 rounded-lg bg-brand-red/10 flex items-center justify-center flex-shrink-0">
                  {act.type === 'assessment' && <ClipboardList className="w-4 h-4 text-brand-red" />}
                  {act.type === 'result' && <CheckCircle className="w-4 h-4 text-green-600" />}
                  {act.type === 'user' && <Users className="w-4 h-4 text-blue-600" />}
                  {act.type === 'feedback' && <AlertTriangle className="w-4 h-4 text-orange-600" />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-brand-black">{act.desc}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {act.user} · {act.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Quick Actions</h3>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => nav('/users')} className="p-4 border-2 border-gray-200 rounded-xl hover:border-brand-red hover:bg-brand-red-muted transition-all text-left group">
              <Users className="w-6 h-6 text-gray-400 group-hover:text-brand-red mb-2" />
              <div className="text-sm font-semibold text-brand-black">Manage Users</div>
            </button>
            <button onClick={() => nav('/assessments')} className="p-4 border-2 border-gray-200 rounded-xl hover:border-brand-red hover:bg-brand-red-muted transition-all text-left group">
              <ClipboardList className="w-6 h-6 text-gray-400 group-hover:text-brand-red mb-2" />
              <div className="text-sm font-semibold text-brand-black">New Assessment</div>
            </button>
            <button onClick={() => nav('/results')} className="p-4 border-2 border-gray-200 rounded-xl hover:border-brand-red hover:bg-brand-red-muted transition-all text-left group">
              <BarChart3 className="w-6 h-6 text-gray-400 group-hover:text-brand-red mb-2" />
              <div className="text-sm font-semibold text-brand-black">Review Results</div>
            </button>
            <button onClick={() => nav('/reports')} className="p-4 border-2 border-gray-200 rounded-xl hover:border-brand-red hover:bg-brand-red-muted transition-all text-left group">
              <Target className="w-6 h-6 text-gray-400 group-hover:text-brand-red mb-2" />
              <div className="text-sm font-semibold text-brand-black">View Reports</div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
