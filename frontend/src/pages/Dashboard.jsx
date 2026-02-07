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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const KPICards = isAdmin
    ? [
        { icon: Users, label: 'Total Employees', value: stats.users, color: 'text-brand-red', bg: 'bg-brand-red-muted', link: '/users' },
        { icon: Target, label: 'Competencies', value: stats.competencies, color: 'text-blue-600', bg: 'bg-blue-100', link: '/competencies' },
        { icon: ClipboardList, label: 'Active Assessments', value: stats.activeAssessments, color: 'text-green-600', bg: 'bg-green-100', link: '/assessments' },
        { icon: BarChart3, label: 'Results Generated', value: stats.totalResults, color: 'text-orange-600', bg: 'bg-orange-100', link: '/results' },
      ]
    : [
        { icon: ClipboardList, label: 'My Active Assessments', value: stats.activeAssessments, color: 'text-brand-red', bg: 'bg-brand-red-muted', link: '/assessments' },
        { icon: TrendingUp, label: 'My Results', value: '—', color: 'text-blue-600', bg: 'bg-blue-100', link: '/results' },
      ];

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;

  return (
    <div className="p-4 sm:p-5 lg:p-7 bg-gray-50 min-h-screen">
      {/* Welcome Section */}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-display font-bold text-brand-black">
          Welcome, {user?.name?.split(' ')[0]}
        </h1>
        <p className="text-gray-500 mt-1.5 text-sm sm:text-base">
          {user?.position || user?.role?.replace('_', ' ')} 
          {user?.department && ` · ${user.department}`}
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 mb-8 sm:mb-10">
        {KPICards.map((k) => {
          const Icon = k.icon;
          return (
            <div
              key={k.label}
              onClick={() => nav(k.link)}
              className="bg-white rounded-xl p-4 sm:p-5 shadow-card card-hover cursor-pointer border border-gray-100 active:scale-[0.98] transition-base"
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`w-10 h-10 sm:w-11 sm:h-11 ${k.bg} rounded-xl flex items-center justify-center`}>
                  <Icon className={`w-5 h-5 ${k.color}`} />
                </div>
                <ArrowRight className="w-4 h-4 text-gray-300 flex-shrink-0" />
              </div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-brand-black mb-1">
                {k.value}
              </div>
              <div className="text-sm text-gray-500 line-clamp-1">{k.label}</div>
            </div>
          );
        })}
      </div>

      {/* Bottom row: chart + recent assessments */}
      <div className={`grid ${isAdmin ? 'lg:grid-cols-5' : ''} gap-5 sm:gap-6`}>
        {/* Competency categories chart */}
        <div className={`bg-white rounded-xl p-5 sm:p-6 shadow-card border border-gray-100 ${isAdmin ? 'lg:col-span-2' : ''}`}>
          <h3 className="text-lg sm:text-xl font-display font-bold text-brand-black mb-5">
            Questions by Category
          </h3>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : isTablet ? 260 : 280}>
            <BarChart 
              data={compData} 
              barSize={isMobile ? 28 : 36}
              margin={{ top: 10, right: 10, left: 0, bottom: 10 }}
            >
              <XAxis 
                dataKey="name" 
                tick={{ 
                  fontSize: isMobile ? 11 : 12, 
                  fill: '#374151',
                  fontFamily: "'DM Sans', sans-serif"
                }} 
                axisLine={false} 
                tickLine={false}
                tickMargin={8}
              />
              <YAxis 
                hide={isMobile}
                tick={{ fontSize: 11, fill: '#6B7280' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{ 
                  borderRadius: 8, 
                  border: 'none', 
                  boxShadow: '0 4px 12px rgba(0,0,0,0.1)', 
                  fontSize: isMobile ? 12 : 13,
                  fontFamily: "'DM Sans', sans-serif"
                }}
                formatter={(value) => [value, 'Questions']}
                labelStyle={{ fontWeight: 600 }}
              />
              <Bar 
                dataKey="value" 
                radius={[6, 6, 0, 0]}
                name="Questions"
              >
                {compData.map((entry, i) => (
                  <Cell 
                    key={i} 
                    fill={COLORS[entry.name] || '#C8102E'} 
                    className="hover:opacity-90 transition-opacity"
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {isMobile && (
            <div className="mt-4 text-xs text-gray-500 text-center">
              ← Swipe to see all categories →
            </div>
          )}
        </div>

        {/* Recent assessments table (admin only) */}
        {isAdmin && (
          <div className="bg-white rounded-xl shadow-card border border-gray-100 lg:col-span-3 overflow-hidden">
            <div className="border-b border-gray-100 px-5 sm:px-6 py-4 sm:py-5 flex items-center justify-between">
              <h3 className="text-lg sm:text-xl font-display font-bold text-brand-black">
                Active Assessments
              </h3>
              <button 
                onClick={() => nav('/assessments')}
                className="px-3 sm:px-4 py-1.5 sm:py-2 text-sm font-semibold text-brand-red border border-brand-red rounded-lg hover:bg-brand-red-muted transition-base active:scale-95"
              >
                View All
              </button>
            </div>
            {recentAssessments.length === 0 ? (
              <div className="p-8 sm:p-10 text-center text-gray-400">
                <ClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p className="text-sm sm:text-base">No active assessments</p>
              </div>
            ) : (
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full min-w-[640px]">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-5 sm:px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="text-left px-5 sm:px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Competency
                      </th>
                      <th className="text-left px-5 sm:px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Type
                      </th>
                      <th className="text-left px-5 sm:px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">
                        Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {recentAssessments.map((a) => (
                      <tr 
                        key={a._id} 
                        onClick={() => nav(`/assessments/${a._id}`)}
                        className="hover:bg-brand-red-muted cursor-pointer transition-base group"
                      >
                        <td className="px-5 sm:px-6 py-3.5 font-semibold text-sm text-brand-black-soft">
                          <div className="flex items-center gap-2">
                            <span className="line-clamp-1 group-hover:text-brand-red transition-base">
                              {a.description || '—'}
                            </span>
                            <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-base text-brand-red" />
                          </div>
                        </td>
                        <td className="px-5 sm:px-6 py-3.5 text-sm text-gray-600">
                          {a.competencyId?.name || '—'}
                        </td>
                        <td className="px-5 sm:px-6 py-3.5 text-sm text-gray-600">
                          <span className="capitalize">{a.type}</span>
                        </td>
                        <td className="px-5 sm:px-6 py-3.5">
                          <span className={`badge badge-${a.status.toLowerCase()}`}>
                            {a.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(isMobile || isTablet) && (
                  <div className="px-4 py-3 text-xs text-gray-500 text-center border-t border-gray-100 bg-gray-50">
                    ← Scroll horizontally to view all columns →
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}