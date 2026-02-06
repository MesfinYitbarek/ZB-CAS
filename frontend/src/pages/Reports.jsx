import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Download, BarChart3, ChevronLeft, ChevronRight } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import api from '../utils/api';

const LEVEL_COLORS = { Basic: '#F59E0B', Intermediate: '#EA580C', Advanced: '#2563EB', Expert: '#16A34A' };

export default function Reports() {
  const { user, isAdmin } = useAuth();
  const { show } = useToast();
  const [tab, setTab] = useState(isAdmin ? 'department' : 'individual');
  const [individual, setIndividual] = useState([]);
  const [deptSummary, setDeptSummary] = useState([]);
  const [heatmap, setHeatmap] = useState({});
  const [departments, setDepartments] = useState([]);
  const [selDept, setSelDept] = useState('');
  const [loading, setLoading] = useState(true);
  
  // Pagination state for individual reports
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0
  });

  const fetchIndividual = useCallback(async () => {
    try {
      const indRes = await api.get(`/reports/individual/${user._id}`, {
        params: { page: pagination.page, limit: pagination.limit }
      });
      
      if (indRes.data.data.reports) {
        setIndividual(indRes.data.data.reports);
        
        // Update pagination from API response
        if (indRes.data.data.pagination) {
          setPagination(prev => ({
            ...prev,
            total: indRes.data.data.pagination.total,
            totalPages: Math.ceil(indRes.data.data.pagination.total / pagination.limit)
          }));
        }
      } else {
        setIndividual([]);
      }
    } catch (_) {
      show('Failed to load individual reports.', 'error');
      setIndividual([]);
    }
  }, [user._id, pagination.page, pagination.limit]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        // Always fetch individual reports for non-admin or when individual tab is selected
        if (!isAdmin || tab === 'individual') {
          await fetchIndividual();
        }
        
        if (isAdmin) {
          const hmRes = await api.get('/reports/heatmap');
          setHeatmap(hmRes.data.data.heatmap);
          const depts = new Set();
          Object.values(hmRes.data.data.heatmap).forEach((arr) => arr.forEach((d) => depts.add(d.department)));
          setDepartments([...depts]);
        }
      } catch (_) {
        show('Failed to load reports.', 'error');
      }
      setLoading(false);
    };
    load();
  }, [isAdmin, user, tab, pagination.page, pagination.limit, fetchIndividual]);

  useEffect(() => {
    if (isAdmin && selDept && tab === 'department') {
      api
        .get(`/reports/department/${selDept}`)
        .then(({ data }) => setDeptSummary(data.data.summary))
        .catch(() => {});
    }
  }, [selDept, isAdmin, tab]);

  const exportReports = async () => {
    try {
      const res = await api.get(`/reports/export/${user._id}`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'my-reports.json';
      a.click();
      URL.revokeObjectURL(url);
      show('Reports exported.', 'success');
    } catch (_) {
      show('Export failed.', 'error');
    }
  };

  // Pagination handlers
  const goToPage = (page) => {
    if (page >= 1 && page <= pagination.totalPages) {
      setPagination(prev => ({ ...prev, page }));
    }
  };

  const handlePageSizeChange = (e) => {
    const newLimit = parseInt(e.target.value, 10);
    setPagination({
      page: 1,
      limit: newLimit,
      total: pagination.total,
      totalPages: Math.ceil(pagination.total / newLimit)
    });
  };

  // Handle tab change
  const handleTabChange = (newTab) => {
    setTab(newTab);
    if (newTab === 'individual') {
      setPagination(prev => ({ ...prev, page: 1 }));
    }
  };

  if (loading)
    return (
      <div className="flex items-center justify-center p-16">
        <div className="w-10 h-10 border-4 border-brand-red border-t-transparent rounded-full animate-spin" />
      </div>
    );

  const heatmapChartData = Object.entries(heatmap).map(([comp, depts]) => {
    const row = { competency: comp };
    depts.forEach((d) => {
      row[d.department] = d.avgScore;
    });
    return row;
  });
  const allDepts = [...new Set(Object.values(heatmap).flatMap((arr) => arr.map((d) => d.department)))];

  return (
    <div className="p-7">
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-black">Reports & Analytics</h1>
          <p className="text-gray-500 mt-1">View individual, departmental, and bank-wide competency reports.</p>
        </div>
        {!isAdmin && (
          <button onClick={exportReports} className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
            <Download className="w-4 h-4" /> Export
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {(isAdmin ? [['department', 'Department Summary'], ['heatmap', 'Competency Heatmap'], ['individual', 'Individual Reports']] : [['individual', 'My Reports']]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2.5 rounded-lg border-2 font-semibold text-sm transition-all ${
              tab === key ? 'border-brand-red bg-brand-red/10 text-brand-red' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Individual Reports */}
      {tab === 'individual' && (
        <>
          {/* Pagination controls */}
          {individual.length > 0 && (
            <div className="flex justify-between items-center mb-4">
              <div className="text-sm text-gray-600">
                Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
                {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
                {pagination.total} reports
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">Show:</span>
                <select 
                  value={pagination.limit} 
                  onChange={handlePageSizeChange}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 focus-brand text-sm"
                >
                  <option value="10">10 per page</option>
                  <option value="20">20 per page</option>
                  <option value="30">30 per page</option>
                  <option value="50">50 per page</option>
                </select>
              </div>
            </div>
          )}
          
          <div className="bg-white rounded-xl shadow-card border border-gray-100 overflow-hidden mb-4">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Competency</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Score</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Level</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Recommendation</th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {individual.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-400">No reports yet.</td>
                    </tr>
                  )}
                  {individual.map((r, i) => (
                    <tr key={i} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-sm text-brand-black-soft">{r.competencyName}</td>
                      <td className="px-6 py-3 font-bold text-sm text-brand-red">{r.finalScore}%</td>
                      <td className="px-6 py-3">
                        <span className={`badge badge-${r.level.toLowerCase()}`}>{r.level}</span>
                      </td>
                      <td className="px-6 py-3 text-sm text-gray-600 max-w-xs line-clamp-2">{r.recommendation || '—'}</td>
                      <td className="px-6 py-3 text-xs text-gray-400">{new Date(r.generatedAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination Controls */}
          {pagination.total > pagination.limit && (
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4 border-t border-gray-200">
              <div className="text-sm text-gray-600">
                Page {pagination.page} of {pagination.totalPages}
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goToPage(pagination.page - 1)}
                  disabled={pagination.page === 1}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Previous
                </button>
                
                <div className="flex items-center gap-1">
                  {(() => {
                    const pages = [];
                    const maxVisible = 5;
                    
                    if (pagination.totalPages <= maxVisible) {
                      for (let i = 1; i <= pagination.totalPages; i++) {
                        pages.push(i);
                      }
                    } else {
                      let start = Math.max(1, pagination.page - Math.floor(maxVisible / 2));
                      let end = Math.min(pagination.totalPages, start + maxVisible - 1);
                      
                      if (end - start + 1 < maxVisible) {
                        start = Math.max(1, end - maxVisible + 1);
                      }
                      
                      for (let i = start; i <= end; i++) {
                        pages.push(i);
                      }
                    }
                    
                    return pages.map((pageNum) => (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`w-9 h-9 rounded-lg text-sm font-medium ${
                          pagination.page === pageNum
                            ? 'bg-brand-red text-white'
                            : 'border border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {pageNum}
                      </button>
                    ));
                  })()}
                </div>
                
                <button
                  onClick={() => goToPage(pagination.page + 1)}
                  disabled={pagination.page === pagination.totalPages}
                  className="flex items-center gap-1 px-3 py-2 rounded-lg border border-gray-300 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                >
                  Next <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Department Summary */}
      {tab === 'department' && isAdmin && (
        <div>
          <div className="mb-6">
            <select value={selDept} onChange={(e) => setSelDept(e.target.value)} className="h-10 px-3 rounded-lg border border-gray-300 focus-brand text-sm w-72">
              <option value="">— Select Department —</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          {selDept && deptSummary.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {deptSummary.map((item, i) => (
                <div key={i} className="bg-white rounded-xl p-5 shadow-card border border-gray-100">
                  <h3 className="text-base font-bold text-brand-black mb-3">{item.competencyName}</h3>
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-sm text-gray-500">Avg Score</span>
                    <span className="text-base font-bold text-brand-red">{item.avgScore}%</span>
                  </div>
                  <div className="progress-bar mb-3">
                    <div className="progress-fill" style={{ width: `${item.avgScore}%` }} />
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(item.levelDistribution).map(
                      ([lvl, count]) =>
                        count > 0 && (
                          <span
                            key={lvl}
                            className="text-xs px-2 py-1 rounded-full font-semibold"
                            style={{ backgroundColor: LEVEL_COLORS[lvl] + '28', color: LEVEL_COLORS[lvl] }}
                          >
                            {lvl}: {count}
                          </span>
                        )
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          {selDept && deptSummary.length === 0 && (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600">No data for this department</h3>
            </div>
          )}
        </div>
      )}

      {/* Heatmap */}
      {tab === 'heatmap' && isAdmin && (
        <div className="bg-white rounded-xl p-6 shadow-card border border-gray-100">
          <h3 className="text-lg font-display font-bold text-brand-black mb-4">Bank-Wide Competency Heatmap</h3>
          {heatmapChartData.length === 0 ? (
            <div className="text-center py-16">
              <BarChart3 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <h3 className="text-lg font-semibold text-gray-600">No heatmap data yet</h3>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={heatmapChartData} layout="vertical" barSize={22}>
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="competency" tick={{ fontSize: 12 }} width={120} />
                <Tooltip contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', fontSize: 13 }} />
                <Legend />
                {allDepts.map((dept, i) => (
                  <Bar
                    key={dept}
                    dataKey={dept}
                    name={dept}
                    radius={[0, 4, 4, 0]}
                    fill={['#C8102E', '#2563EB', '#16A34A', '#EA580C', '#8B5CF6', '#0891B2'][i % 6]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}