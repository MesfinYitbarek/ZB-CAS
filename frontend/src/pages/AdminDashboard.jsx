import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend
} from 'recharts';
import { ClipboardList, Target, TrendingUp } from 'lucide-react';
import api from '../utils/api';

const COLORS = ['#C8102E', '#2563EB', '#16A34A', '#EA580C'];

export default function AdminDashboard() {
  const nav = useNavigate();

  const [stats, setStats] = useState({
    totalCompetencies: 0,
    activeAssessments: 0,
    completedAssessments: 0
  });

  const [compData, setCompData] = useState([]);
  const [statusData, setStatusData] = useState([]);
  const [trendData, setTrendData] = useState([]);
  const [quickStats, setQuickStats] = useState({
    completionRate: 0
  });

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const res = await api.get('/dashboard/admin');
        const data = res.data.data;

        setStats({
          totalCompetencies: data.stats.totalCompetencies,
          activeAssessments: data.stats.activeAssessments,
          completedAssessments: data.stats.completedAssessments
        });

        setCompData(data.charts.competencyDistribution || []);
        setStatusData(data.charts.assessmentStatus || []);
        setTrendData(data.charts.monthlyTrends || []);
        setQuickStats(data.quickStats || {});
      } catch (error) {
        console.error('Failed to load admin dashboard:', error);
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const KPICards = [
    {
      icon: Target,
      label: 'Competencies',
      value: stats.totalCompetencies,
      subValue: 'across 4 categories',
      color: 'text-brand-red',
      bg: 'bg-brand-red/10',
      link: '/competencies'
    },
    {
      icon: ClipboardList,
      label: 'Active Assessments',
      value: stats.activeAssessments,
      subValue: `${stats.completedAssessments} completed`,
      color: 'text-green-600',
      bg: 'bg-green-100',
      link: '/assessments'
    }
  ];

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">
            Admin Dashboard
          </h1>
          <p className="text-gray-500 mt-1">
            Comprehensive overview of the assessment system
          </p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {KPICards.map((k) => {
          const Icon = k.icon;

          return (
            <div
              key={k.label}
              onClick={() => nav(k.link)}
              className="bg-white rounded-xl p-5 shadow-card hover:shadow-card-hover transition-all cursor-pointer border border-gray-100"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className={`w-12 h-12 ${k.bg} rounded-xl flex items-center justify-center`}
                >
                  <Icon className={`w-6 h-6 ${k.color}`} />
                </div>
                <TrendingUp className="w-4 h-4 text-green-500 ml-auto" />
              </div>

              <div className="text-3xl font-display font-bold text-brand-black mb-1">
                {k.value}
              </div>
              <div className="text-sm font-semibold text-gray-700 mb-1">
                {k.label}
              </div>
              <div className="text-xs text-gray-500">{k.subValue}</div>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Competency Distribution */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">
            Competency Distribution
          </h3>

          {compData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No competency data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={compData}>
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  {compData.map((entry, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Assessment Status */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">
            Assessment Status
          </h3>

          {statusData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No assessment data available
            </div>
          ) : (
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
          )}
        </div>

        {/* 6-Month Trend */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">
            6-Month Trend
          </h3>

          {trendData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No trend data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis hide />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="assessments"
                  stroke="#C8102E"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
