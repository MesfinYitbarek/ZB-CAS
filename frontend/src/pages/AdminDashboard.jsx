import { useState, useEffect, useRef } from 'react';
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
  Line,
  AreaChart,
  Area,
  Legend,
  CartesianGrid
} from 'recharts';
import { ClipboardList, Target, Users, FileText, CheckCircle, TrendingUp } from 'lucide-react';
import api from '../utils/api';

const COLORS = ['#C8102E', '#2563EB', '#16A34A', '#EA580C'];

// Animated counter hook
function useAnimatedCounter(end, duration = 1500) {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  const startTimeRef = useRef(null);

  useEffect(() => {
    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      
      // Easing function for smooth animation
      const easeOutQuart = 1 - Math.pow(1 - progress, 4);
      countRef.current = Math.floor(easeOutQuart * end);
      setCount(countRef.current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return count;
}

export default function AdminDashboard() {
  const nav = useNavigate();

  const [stats, setStats] = useState({
    totalCompetencies: 0,
    activeAssessments: 0,
    completedAssessments: 0,
    totalUsers: 0,
    totalAssessments: 0,
    pendingResults: 0
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
          completedAssessments: data.stats.completedAssessments,
          totalUsers: data.stats.totalUsers || 0,
          totalAssessments: data.stats.totalAssessments || 0,
          pendingResults: data.stats.pendingResults || 0
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

  // Animated counters - MUST be before any early returns
  const animatedUsers = useAnimatedCounter(stats.totalUsers);
  const animatedAssessments = useAnimatedCounter(stats.totalAssessments);
  const animatedCompetencies = useAnimatedCounter(stats.totalCompetencies);
  const animatedActive = useAnimatedCounter(stats.activeAssessments);
  const animatedCompleted = useAnimatedCounter(stats.completedAssessments);
  const animatedPending = useAnimatedCounter(stats.pendingResults);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const KPICards = [
    {
      icon: Users,
      label: 'Total Users',
      value: animatedUsers,
      subValue: 'System users',
      color: 'text-blue-600',
      bg: 'bg-blue-100',
      link: '/users'
    },
    {
      icon: FileText,
      label: 'Total Assessments',
      value: animatedAssessments,
      subValue: 'All assessments',
      color: 'text-purple-600',
      bg: 'bg-purple-100',
      link: '/assessments'
    },
    {
      icon: Target,
      label: 'Competencies',
      value: animatedCompetencies,
      subValue: 'Skill areas',
      color: 'text-brand-red',
      bg: 'bg-brand-red/10',
      link: '/competencies'
    },
    {
      icon: ClipboardList,
      label: 'Active Now',
      value: animatedActive,
      subValue: 'In progress',
      color: 'text-green-600',
      bg: 'bg-green-100',
      link: '/assessments'
    },
    {
      icon: CheckCircle,
      label: 'Completed',
      value: animatedCompleted,
      subValue: 'Finished assessments',
      color: 'text-orange-600',
      bg: 'bg-orange-100',
      link: '/results'
    },
    {
      icon: TrendingUp,
      label: 'Pending Results',
      value: animatedPending,
      subValue: 'Awaiting finalization',
      color: 'text-indigo-600',
      bg: 'bg-indigo-100',
      link: '/results'
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

      {/* Cards + Counters Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left - Compact Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            onClick={() => nav('/competencies')}
            className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100 flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-brand-red/10 rounded-lg flex items-center justify-center">
              <Target className="w-5 h-5 text-brand-red" />
            </div>
            <div className="flex-1">
              <div className="text-xl font-display font-bold text-brand-black">{stats.totalCompetencies}</div>
              <div className="text-xs text-gray-500">Competencies across categories</div>
            </div>
          </div>

          <div
            onClick={() => nav('/assessments')}
            className="bg-white rounded-lg p-3 shadow-sm hover:shadow-md transition-all cursor-pointer border border-gray-100 flex items-center gap-3"
          >
            <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
              <ClipboardList className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-display font-bold text-brand-black">{stats.activeAssessments}</span>
                <span className="text-xs text-gray-400">active</span>
              </div>
              <div className="text-xs text-gray-500">{stats.completedAssessments} completed total</div>
            </div>
          </div>
        </div>

        {/* Right - Large Plain Counters (3 stats) */}
        <div className="flex items-center justify-around gap-4">
          <div className="text-center">
            <div className="text-4xl font-display font-bold text-brand-black">{animatedUsers}</div>
            <div className="text-sm text-gray-500 mt-1">Users</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-display font-bold text-purple-600">{animatedAssessments}</div>
            <div className="text-sm text-gray-500 mt-1">Assessments</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-display font-bold text-indigo-600">{animatedPending}</div>
            <div className="text-sm text-gray-500 mt-1">Pending</div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid lg:grid-cols-3 gap-6">
        {/* Competency Distribution - Enhanced Bar Chart */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-2">
            Competency Distribution
          </h3>
          <p className="text-xs text-gray-400 mb-4">Skills across organization</p>

          {compData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No competency data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={compData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="barGradient1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#C8102E" stopOpacity={0.3}/>
                  </linearGradient>
                  <linearGradient id="barGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#2563EB" stopOpacity={0.3}/>
                  </linearGradient>
                  <linearGradient id="barGradient3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#16A34A" stopOpacity={0.3}/>
                  </linearGradient>
                  <linearGradient id="barGradient4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EA580C" stopOpacity={0.8}/>
                    <stop offset="100%" stopColor="#EA580C" stopOpacity={0.3}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 10, fill: '#6B7280' }} 
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #E5E7EB', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                  cursor={{ fill: 'rgba(0,0,0,0.05)' }}
                />
                <Bar dataKey="value" radius={[8, 8, 0, 0]} animationDuration={1500}>
                  {compData.map((entry, i) => (
                    <Cell key={i} fill={`url(#barGradient${i % 4 + 1})`} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Assessment Status - Donut Chart with Center */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-2">
            Assessment Status
          </h3>
          <p className="text-xs text-gray-400 mb-4">Current distribution</p>

          {statusData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No assessment data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <defs>
                  <linearGradient id="pieGradient1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E"/>
                    <stop offset="100%" stopColor="#991B1B"/>
                  </linearGradient>
                  <linearGradient id="pieGradient2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2563EB"/>
                    <stop offset="100%" stopColor="#1E40AF"/>
                  </linearGradient>
                  <linearGradient id="pieGradient3" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#16A34A"/>
                    <stop offset="100%" stopColor="#166534"/>
                  </linearGradient>
                  <linearGradient id="pieGradient4" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#EA580C"/>
                    <stop offset="100%" stopColor="#9A3412"/>
                  </linearGradient>
                </defs>
                <Pie
                  data={statusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                  labelLine={{ stroke: '#E5E7EB', strokeWidth: 1 }}
                  animationBegin={0}
                  animationDuration={1500}
                >
                  {statusData.map((entry, i) => (
                    <Cell key={i} fill={`url(#pieGradient${i % 4 + 1})`} stroke="#fff" strokeWidth={2} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #E5E7EB', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend 
                  verticalAlign="bottom" 
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }}
                />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* 6-Month Trend - Area Chart */}
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-2">
            6-Month Trend
          </h3>
          <p className="text-xs text-gray-400 mb-4">Assessment activity</p>

          {trendData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-gray-400">
              No trend data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                <defs>
                  <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C8102E" stopOpacity={0.3}/>
                    <stop offset="100%" stopColor="#C8102E" stopOpacity={0.05}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" vertical={false} />
                <XAxis 
                  dataKey="month" 
                  tick={{ fontSize: 10, fill: '#6B7280' }} 
                  axisLine={{ stroke: '#E5E7EB' }}
                  tickLine={false}
                />
                <YAxis hide />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: '#fff', 
                    border: '1px solid #E5E7EB', 
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="assessments"
                  stroke="#C8102E"
                  strokeWidth={3}
                  fill="url(#areaGradient)"
                  animationDuration={1500}
                  dot={{ fill: '#C8102E', strokeWidth: 2, stroke: '#fff', r: 5 }}
                  activeDot={{ r: 7, strokeWidth: 0 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
